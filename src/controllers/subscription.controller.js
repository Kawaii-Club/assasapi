import axios from "axios";
import admin from "firebase-admin";
import { getUser, updateUser } from "../services/user.service.js";
import {
  createSubscription,
  createCustomer,
  getSubscriptionPayments,
} from "../services/asaas.service.js";
import { todayPlus } from "../utils/date.js";

const db = admin.firestore();

const ASAAS_API = process.env.ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

const asaasHeaders = {
  access_token: process.env.ASAAS_API_KEY,
  "Content-Type": "application/json",
};

const PLAN_ORDER = { nobreza: 0, alteza: 1, majestade: 2 };

function planRank(planId) {
  return PLAN_ORDER[planId?.toLowerCase()] ?? -1;
}

//
// 🔥 FIX PRINCIPAL: retry REAL no Asaas
//
async function getPendingPayment(subscriptionId) {
  let attempts = 0;

  while (attempts < 6) {
    await new Promise(r => setTimeout(r, 2500)); // 2.5s

    const payments = await getSubscriptionPayments(subscriptionId);

    console.log("💰 PAYMENTS:", payments?.data);

    const pending =
      payments?.data?.find(p => p.status === "PENDING") ||
      payments?.data?.[0];

    if (pending) {
      console.log("✅ PAGAMENTO ENCONTRADO:", pending.id);

      return {
        checkoutUrl: pending.invoiceUrl || null,
        pixCode: pending.pixQrCode || null,
        paymentId: pending.id || null,
      };
    }

    attempts++;
    console.log(`⏳ Tentativa ${attempts} sem pagamento ainda...`);
  }

  console.warn("⚠️ Nenhum pagamento encontrado após retries");

  return {
    checkoutUrl: null,
    pixCode: null,
    paymentId: null,
  };
}

async function sendPush(fcmToken, title, body) {
  if (!fcmToken) return;
  try {
    await admin.messaging().send({ token: fcmToken, notification: { title, body } });
  } catch (err) {
    console.warn("⚠️ Push falhou:", err.message);
  }
}

export async function createSubscriptionController(req, res) {
  try {
    const { userId, planId, value, cycle, billingType } = req.body;

    if (!userId || !planId || value == null || !cycle || !billingType) {
      return res.status(400).json({ success: false, error: "Campos obrigatórios faltando" });
    }

    let user = await getUser(userId);
    if (!user) return res.status(404).json({ success: false, error: "Usuário não encontrado" });

    if (!user.email || !user.cpf) {
      return res.status(400).json({ success: false, error: "Usuário sem dados obrigatórios" });
    }

    const currentRank = planRank(user.planId);
    const newRank = planRank(planId);
    const hasActive = user.subscriptionId && user.planStatus === "active";

    const isRenew = hasActive && user.planId === planId;
    const isUpgrade = hasActive && newRank > currentRank;
    const isDowngrade = hasActive && newRank < currentRank && newRank >= 0;

    // DOWNGRADE
    if (isDowngrade) {
      await updateUser(userId, { nextPlanId: planId });
      return res.json({ success: true, operation: "downgrade" });
    }

    // UPGRADE / RENOVAÇÃO
    if (isUpgrade || isRenew) {
      try {
        const updated = await updateSubscription(user.subscriptionId, {
          value,
          cycle,
          billingType,
          nextDueDate: todayPlus(0),
          updatePendingPayments: true,
        });

        await updateUser(userId, {
          subscriptionId: updated.id,
          nextPlanId: planId,
        });

        const payment = await getPendingPayment(updated.id);

        const hasUrl = payment.checkoutUrl || payment.pixCode;

        return res.json({
          success: !!hasUrl,
          operation: isRenew ? "renew" : "upgrade",
          ...payment,
        });

      } catch (err) {
        console.warn("⚠️ Falhou update, criando nova...");
        user.subscriptionId = null;
      }
    }

    // CUSTOMER
    if (!user.customerId) {
      const customer = await createCustomer({
        name: user.name,
        email: user.email,
        cpfCnpj: user.cpf,
        phone: user.phone,
      });

      await updateUser(userId, { customerId: customer.id });
      user.customerId = customer.id;
    }

    // SUBSCRIPTION
    const subscription = await createSubscription({
      customer: user.customerId,
      billingType,
      value,
      cycle,
      nextDueDate: todayPlus(cycle === "YEARLY" ? 365 : 30),
      description: `Plano ${planId}`,
    });

    console.log("✅ SUBSCRIPTION:", subscription.id);

    const payment = await getPendingPayment(subscription.id);

    const hasUrl = payment.checkoutUrl || payment.pixCode;

    await updateUser(userId, {
      subscriptionId: subscription.id,
      planStatus: "pending_payment",
      nextPlanId: planId,
    });

    return res.json({
      success: !!hasUrl,
      operation: "new",
      subscriptionId: subscription.id,
      customerId: user.customerId,
      ...payment,
      error: hasUrl ? null : "Pagamento ainda não gerado pelo Asaas",
    });

  } catch (err) {
    console.error("💥 ERRO:", err.response?.data || err);
    return res.status(500).json({ success: false });
  }
}

export async function updateSubscription(subscriptionId, payload) {
  const response = await axios.put(
    `${ASAAS_API}/subscriptions/${subscriptionId}`,
    payload,
    { headers: asaasHeaders }
  );
  return response.data;
}