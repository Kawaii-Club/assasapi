import axios from "axios";
import admin from "firebase-admin";
import { getUser, updateUser } from "../services/user.service.js";
import {
  createSubscription,
  createCustomer,
  getSubscriptionPayments,
} from "../services/asaas.service.js";
import { todayPlus } from "../utils/date.js";

const db = admin.firestore(); // ✅ FIX: estava faltando em cancelSubscription

const ASAAS_API = process.env.ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

const asaasHeaders = {
  access_token: process.env.ASAAS_API_KEY,
  "Content-Type": "application/json",
};

// =========================================================
// CRIAR / ATUALIZAR ASSINATURA
// =========================================================

export async function createSubscriptionController(req, res) {
  try {
    const { userId, planId, value, cycle, billingType } = req.body;

    const missingFields = [];
    if (!userId) missingFields.push("userId");
    if (!planId) missingFields.push("planId");
    if (value === undefined || value === null) missingFields.push("value");
    if (!cycle) missingFields.push("cycle");
    if (!billingType) missingFields.push("billingType");

    if (missingFields.length > 0) {
      return res.status(400).json({ success: false, error: "Campos obrigatórios faltando", missingFields });
    }
    if (typeof value !== "number" || value <= 0) {
      return res.status(400).json({ success: false, error: "Valor inválido" });
    }
    if (!["MONTHLY", "YEARLY"].includes(cycle)) {
      return res.status(400).json({ success: false, error: "Ciclo inválido" });
    }
    if (!["PIX", "BOLETO", "CREDIT_CARD"].includes(billingType)) {
      return res.status(400).json({ success: false, error: "Tipo de pagamento inválido" });
    }

    let user;
    try {
      user = await getUser(userId);
    } catch (err) {
      console.error("❌ ERRO AO BUSCAR USER:", err);
      return res.status(500).json({ success: false, error: "Erro ao buscar usuário" });
    }

    if (!user) return res.status(404).json({ success: false, error: "Usuário não encontrado" });
    if (!user.email || !user.cpf) return res.status(400).json({ success: false, error: "Usuário sem email ou CPF" });

    // =========================================================
    // CASO 1 — USUÁRIO JÁ POSSUI ASSINATURA ATIVA (UPGRADE/DOWNGRADE)
    // =========================================================

    if (user.subscriptionId && user.planStatus === "active") {
      try {
        const isDowngrade = user.planPrice && value < user.planPrice;

        if (isDowngrade) {
          await updateUser(userId, { nextPlanId: planId });
          return res.json({ success: true, message: "Downgrade programado para o próximo ciclo" });
        }

        const payload = {
          value, cycle, billingType,
          nextDueDate: todayPlus(0),
          description: `Plano ${planId}`,
          updatePendingPayments: true,
        };

        const updatedSubscription = await updateSubscription(user.subscriptionId, payload);

        await updateUser(userId, {
          nextPlanId: planId,
          subscriptionId: updatedSubscription.id,
        });

        await new Promise(resolve => setTimeout(resolve, 1500));

        const payments = await getSubscriptionPayments(updatedSubscription.id);
        let checkoutUrl = null, pixCode = null;

        if (payments?.data?.length > 0) {
          checkoutUrl = payments.data[0]?.invoiceUrl || null;
          pixCode = payments.data[0]?.pixQrCode || null;
        }

        return res.json({
          success: true,
          message: "Upgrade iniciado",
          subscriptionId: updatedSubscription.id,
          checkoutUrl,
          pixCode,
        });

      } catch (err) {
        console.warn("⚠️ erro ao atualizar subscription:", err.response?.data || err);
        user.subscriptionId = null;
      }
    }

    // =========================================================
    // CASO 2 — CRIAR CUSTOMER SE NÃO EXISTIR
    // =========================================================

    try {
      if (!user.customerId) {
        const customer = await createCustomer({
          name: user.name,
          email: user.email,
          cpfCnpj: user.cpf,
          phone: user.phone,
          externalReference: userId,
        });

        if (!customer?.id) throw new Error("Asaas não retornou customerId");

        await updateUser(userId, { customerId: customer.id });
        user.customerId = customer.id;
        console.log("💳 Novo customer criado:", customer.id);
      }
    } catch (err) {
      console.error("❌ ERRO AO CRIAR CUSTOMER:", err.response?.data || err);
      return res.status(500).json({ success: false, error: "Erro ao criar cliente no Asaas" });
    }

    // =========================================================
    // CASO 3 — CRIAR NOVA ASSINATURA
    // =========================================================

    let subscription;
    try {
      const nextDueDate = cycle === "YEARLY" ? todayPlus(365) : todayPlus(30);

      subscription = await createSubscription({
        customer: user.customerId,
        billingType, value, cycle, nextDueDate,
        description: `Plano ${planId}`,
        externalReference: userId,
      });

      if (!subscription?.id) throw new Error("Asaas não retornou subscriptionId");
      console.log("✅ SUBSCRIPTION:", subscription.id);

    } catch (err) {
      console.error("❌ ERRO AO CRIAR SUBSCRIPTION:", err.response?.data || err);
      return res.status(500).json({ success: false, error: "Erro ao criar assinatura no Asaas" });
    }

    let checkoutUrl = null, pixCode = null;
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const payments = await getSubscriptionPayments(subscription.id);

      if (payments?.data?.length > 0) {
        checkoutUrl = payments.data[0]?.invoiceUrl || null;
        pixCode = payments.data[0]?.pixQrCode || null;
      }
    } catch (err) {
      console.error("⚠️ ERRO AO BUSCAR PAYMENT:", err.response?.data || err);
    }

    try {
      await updateUser(userId, {
        subscriptionId: subscription.id,
        subscriptionCreatedAt: new Date(),
        nextPlanId: planId,
        planStatus: "pending_payment",
      });
    } catch (err) {
      console.error("⚠️ ERRO AO ATUALIZAR USER:", err);
    }

    return res.json({
      success: true,
      subscriptionId: subscription.id,
      customerId: user.customerId,
      planId,
      status: "pending_payment",
      checkoutUrl,
      pixCode,
    });

  } catch (err) {
    console.error("💥 ERRO FATAL:", err.response?.data || err.message);
    return res.status(500).json({ success: false, error: "Erro interno inesperado" });
  }
}

// =========================================================
// CANCELAR PAGAMENTO PENDENTE (SEM REABRIR)
//
// Usar quando o usuário quer cancelar a cobrança pendente
// e voltar à tela de planos para escolher normalmente.
//
// Body: { userId }
// =========================================================

export async function cancelPendingPayment(req, res) {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: "userId é obrigatório" });
  }

  let user;
  try {
    user = await getUser(userId);
  } catch (err) {
    return res.status(500).json({ success: false, error: "Erro ao buscar usuário" });
  }

  if (!user) return res.status(404).json({ success: false, error: "Usuário não encontrado" });

  if (user.planStatus !== "pending_payment") {
    return res.status(400).json({
      success: false,
      error: "Usuário não possui pagamento pendente.",
    });
  }

  // ---- 1. Deletar assinatura pendente no Asaas ----
  if (user.subscriptionId) {
    try {
      await axios.delete(`${ASAAS_API}/subscriptions/${user.subscriptionId}`, {
        headers: asaasHeaders,
      });
      console.log("🗑️ Assinatura pendente deletada:", user.subscriptionId);
    } catch (err) {
      const status = err.response?.status;
      if (status !== 404) {
        console.error("❌ Erro ao deletar assinatura pendente:", err.response?.data || err);
        return res.status(500).json({ success: false, error: "Erro ao cancelar cobrança no Asaas" });
      }
      console.warn("⚠️ Assinatura já não existia no Asaas, seguindo...");
    }
  }

  // ---- 2. Limpar pendência no usuário ----
  // ✅ FIX: volta para o status correto baseado no planId atual,
  // sem tocar no planId — o plano ativo permanece intacto.
  try {
    await updateUser(userId, {
      subscriptionId: null,
      nextPlanId: null,
      planStatus: user.planId && user.planId !== "nobreza" ? "active" : "inactive",
    });
    console.log("🧹 Pendência limpa para usuário:", userId);
  } catch (err) {
    console.error("⚠️ Erro ao limpar pendência do usuário:", err);
    return res.status(500).json({ success: false, error: "Erro ao atualizar usuário" });
  }

  return res.json({ success: true, message: "Pagamento pendente cancelado com sucesso." });
}

// =========================================================
// ATUALIZAR SUBSCRIPTION ASAAS (helper interno)
// =========================================================

export async function updateSubscription(subscriptionId, payload) {
  const response = await axios.put(
    `${ASAAS_API}/subscriptions/${subscriptionId}`,
    payload,
    { headers: asaasHeaders }
  );
  return response.data;
}

// =========================================================
// CANCELAR SUBSCRIPTION DEFINITIVAMENTE
// =========================================================

export async function cancelSubscription(req, res) {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ success: false, error: "subscriptionId é obrigatório" });
    }

    console.log("🛑 Cancelando assinatura:", subscriptionId);

    const response = await axios.delete(
      `${ASAAS_API}/subscriptions/${subscriptionId}`,
      { headers: asaasHeaders }
    );

    // ✅ FIX: db agora está definido no topo do arquivo
    const users = await db
      .collection("users")
      .where("subscriptionId", "==", subscriptionId)
      .get();

    for (const doc of users.docs) {
      await doc.ref.update({
        planStatus: "cancelled",
        nextPlanId: "nobreza",
      });
    }

    console.log("✅ Assinatura cancelada no Asaas");

    return res.json({
      success: true,
      message: "Assinatura cancelada com sucesso",
      data: response.data,
    });

  } catch (err) {
    console.error("❌ ERRO AO CANCELAR SUBSCRIPTION:", err.response?.data || err);
    return res.status(500).json({ success: false, error: "Erro ao cancelar assinatura" });
  }
}