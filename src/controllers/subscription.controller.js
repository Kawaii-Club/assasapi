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
// HELPER — busca pagamento gerado
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

    // Garante customer no Asaas
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

    // Upgrade — atualiza assinatura existente
    if (user.subscriptionId && user.planStatus === "active") {
      try {
        const updated = await updateSubscriptionAsaas(user.subscriptionId, {
          value,
          cycle,
          billingType,
          nextDueDate: todayPlus(0),
          updatePendingPayments: true,
          description: planId,
        });

        const payment = await getPendingPayment(updated.id);

        await updateUser(userId, {
          subscriptionId: updated.id,
          nextPlanId: planId,
        });

        return res.json({ success: true, operation: "upgrade", ...payment });

      } catch {
        user.subscriptionId = null; // fallback: cria nova
      }
    }

    // Nova assinatura
    const subscription = await createSubscription({
      customer: user.customerId,
      billingType,
      value,
      cycle,
      nextDueDate: todayPlus(1),
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
    console.error("❌ createSubscription:", err.message);
    return res.status(500).json({ error: "Erro interno" });
  }
}

// ===============================
// CANCELAR PAGAMENTO PENDENTE
// ===============================
export async function cancelPendingPayment(req, res) {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    // ✅ FIX: tenta deletar a assinatura no Asaas mas ignora 404.
    // Se a assinatura já não existe lá (expirou, foi cancelada manualmente,
    // ou nunca foi criada), simplesmente segue e limpa o Firestore.
    if (user.subscriptionId) {
      try {
        await deleteSubscriptionAsaas(user.subscriptionId);
        console.log("🗑️ Assinatura deletada no Asaas:", user.subscriptionId);
      } catch (err) {
        const status = err?.response?.status ?? err?.status;

        if (status === 404) {
          // Assinatura já não existe no Asaas — sem problema, só limpa o Firestore
          console.warn("⚠️ Assinatura não encontrada no Asaas (404), seguindo:", user.subscriptionId);
        } else {
          // Erro real — retorna 500 para o Flutter tratar
          console.error("❌ Erro ao deletar assinatura no Asaas:", err?.response?.data || err.message);
          return res.status(500).json({ error: "Erro ao cancelar assinatura no Asaas" });
        }
      }
    }

    // Limpa o Firestore — verifica se ainda tem plano ativo para não regredir
    const now = new Date();
    const expiresAt = user.planExpiresAt?.toDate?.() ?? null;
    const hasActivePlan = expiresAt && now < expiresAt && user.planId && user.planId !== "nobreza";

    await updateUser(userId, {
      subscriptionId: null,
      nextPlanId: null,
      planStatus: hasActivePlan ? "active" : "inactive",
      // Se não tem plano ativo, volta para nobreza
      ...(!hasActivePlan && {
        planId: "nobreza",
        planStartedAt: null,
        planExpiresAt: null,
      }),
    });

    console.log("🧹 Pendência cancelada para:", userId, "| planStatus →", hasActivePlan ? "active" : "inactive");

    return res.json({ success: true });

  } catch (err) {
    console.error("❌ cancelPendingPayment:", err.message);
    return res.status(500).json({ error: "Erro ao cancelar pendente" });
  }
}

// ===============================
// CANCELAR ASSINATURA DEFINITIVAMENTE
// ===============================
export async function cancelSubscription(req, res) {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: "subscriptionId obrigatório" });
    }

    // ✅ Mesma proteção: ignora 404 no Asaas
    try {
      await deleteSubscriptionAsaas(subscriptionId);
      console.log("🛑 Assinatura cancelada no Asaas:", subscriptionId);
    } catch (err) {
      const status = err?.response?.status ?? err?.status;
      if (status !== 404) {
        console.error("❌ Erro ao cancelar no Asaas:", err?.response?.data || err.message);
        return res.status(500).json({ error: "Erro ao cancelar assinatura no Asaas" });
      }
      console.warn("⚠️ Assinatura já não existia no Asaas:", subscriptionId);
    }

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

    console.log("✅ Assinatura cancelada:", subscriptionId);
    return res.json({ success: true });

  } catch (err) {
    console.error("❌ cancelSubscription:", err.message);
    return res.status(500).json({ error: "Erro ao cancelar assinatura" });
  }
}