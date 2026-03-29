import admin from "firebase-admin";
import { getUser, updateUser } from "../services/user.service.js";
import {
  createSubscription,
  createCustomer,
  updateSubscriptionAsaas,
  deleteSubscriptionAsaas,
  getSubscriptionPayments,
} from "../services/asaas.service.js";
import { todayPlus } from "../utils/date.js";

const db = admin.firestore();

// ===============================
// HELPER
// ===============================
async function getPendingPayment(subscriptionId) {
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const payments = await getSubscriptionPayments(subscriptionId);

    const payment =
      payments?.data?.find(p => p.status === "PENDING") ||
      payments?.data?.[0];

    if (payment) {
      return {
        checkoutUrl: payment.invoiceUrl || null,
        pixCode: payment.pixQrCode || null,
        paymentId: payment.id || null,
      };
    }
  }

  return { checkoutUrl: null, pixCode: null, paymentId: null };
}

// ===============================
// CREATE / UPDATE SUBSCRIPTION
// ===============================
export async function createSubscriptionController(req, res) {
  try {
    const { userId, planId, value, cycle, billingType } = req.body;

    if (!userId || !planId || value == null || !cycle || !billingType) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

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

    // UPGRADE
    if (user.subscriptionId && user.planStatus === "active") {
      try {
        const updated = await updateSubscriptionAsaas(user.subscriptionId, {
          value,
          cycle,
          billingType,
          nextDueDate: todayPlus(0),
          updatePendingPayments: true,
            description: planId,                  // 🔥 nome do plano

        });

        const payment = await getPendingPayment(updated.id);

        await updateUser(userId, {
          subscriptionId: updated.id,
          nextPlanId: planId,
        });

        return res.json({
          success: true,
          operation: "upgrade",
          ...payment,
        });

      } catch {
        user.subscriptionId = null;
      }
    }

    // CREATE
    const subscription = await createSubscription({
      customer: user.customerId,
      billingType,
      value,
      cycle,
      nextDueDate: todayPlus(3),   // 🔥 fatura vence em 3 dias, ciclo do plano é controlado pelo "cycle"
      description: planId,
    });

    const payment = await getPendingPayment(subscription.id);

    await updateUser(userId, {
      subscriptionId: subscription.id,
      planStatus: "pending_payment",
      nextPlanId: planId,
    });

    return res.json({
      success: true,
      operation: "new",
      subscriptionId: subscription.id,
      ...payment,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro interno" });
  }
}

// ===============================
// CANCELAR PAGAMENTO PENDENTE
// ===============================
export async function cancelPendingPayment(req, res) {
  try {
    const { userId } = req.body;

    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    if (user.subscriptionId) {
      await deleteSubscriptionAsaas(user.subscriptionId);
    }

    const now = new Date();
    const expiresAt = user.planExpiresAt?.toDate?.() ?? null;
    const hasActivePlan = expiresAt && now < expiresAt;

    await updateUser(userId, {
      subscriptionId: null,
      nextPlanId: null,         // 🔥 limpa o nextPlanId sempre
      ...(hasActivePlan
        ? { planStatus: "active" }
        : {
            planStatus: "active",
            planId: "nobreza",
            planStartedAt: null,
            planExpiresAt: null,
          }
      ),
    });

    return res.json({ success: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao cancelar pendente" });
  }
}
// ===============================
// CANCELAR ASSINATURA
// ===============================
export async function cancelSubscription(req, res) {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: "subscriptionId obrigatório" });
    }

    await deleteSubscriptionAsaas(subscriptionId);

    const users = await db
      .collection("users")
      .where("subscriptionId", "==", subscriptionId)
      .get();

    for (const doc of users.docs) {
      await doc.ref.update({
        subscriptionId: null,
        planStatus: "cancelled",
        nextPlanId: null,
      });
    }

    return res.json({ success: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao cancelar assinatura" });
  }
}