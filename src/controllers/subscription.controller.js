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

// ─────────────────────────────────────────────────────────────
// Hierarquia de planos — usada em upgrade/downgrade/proteções
// ─────────────────────────────────────────────────────────────
const PLAN_ORDER = { nobreza: 0, alteza: 1, majestade: 2 };

function planRank(planId) {
  return PLAN_ORDER[planId?.toLowerCase()] ?? -1;
}

// ─────────────────────────────────────────────────────────────
// Helper: busca pagamentos pendentes de uma assinatura
// ─────────────────────────────────────────────────────────────
async function getPendingPayment(subscriptionId) {
  await new Promise(resolve => setTimeout(resolve, 1500));
  const payments = await getSubscriptionPayments(subscriptionId);
  const pending = payments?.data?.find(p => p.status === "PENDING") ?? payments?.data?.[0];
  return {
    checkoutUrl: pending?.invoiceUrl || null,
    pixCode: pending?.pixQrCode || null,
    paymentId: pending?.id || null,
  };
}

// ─────────────────────────────────────────────────────────────
// Helper: notificação push
// ─────────────────────────────────────────────────────────────
async function sendPush(fcmToken, title, body) {
  if (!fcmToken) return;
  try {
    await admin.messaging().send({ token: fcmToken, notification: { title, body } });
  } catch (err) {
    console.warn("⚠️ Push falhou:", err.message);
  }
}

// =========================================================
// CRIAR / RENOVAR / UPGRADE / DOWNGRADE DE ASSINATURA
//
// Body: { userId, planId, value, cycle, billingType }
//
// Detecta automaticamente o tipo de operação:
//   - Sem assinatura ativa → cria nova
//   - Mesmo plano → renova (recria assinatura)
//   - Plano superior → upgrade imediato
//   - Plano inferior → downgrade no próximo ciclo
// =========================================================

export async function createSubscriptionController(req, res) {
  try {
    const { userId, planId, value, cycle, billingType } = req.body;

    // ── Validação ──
    const missingFields = [];
    if (!userId)   missingFields.push("userId");
    if (!planId)   missingFields.push("planId");
    if (value === undefined || value === null) missingFields.push("value");
    if (!cycle)    missingFields.push("cycle");
    if (!billingType) missingFields.push("billingType");

    if (missingFields.length > 0) {
      return res.status(400).json({ success: false, error: "Campos obrigatórios faltando", missingFields });
    }
    if (typeof value !== "number" || value <= 0) {
      return res.status(400).json({ success: false, error: "Valor inválido" });
    }
    if (!["MONTHLY", "YEARLY"].includes(cycle)) {
      return res.status(400).json({ success: false, error: "Ciclo inválido. Use MONTHLY ou YEARLY" });
    }
    if (!["PIX", "BOLETO", "CREDIT_CARD"].includes(billingType)) {
      return res.status(400).json({ success: false, error: "Tipo de pagamento inválido" });
    }

    // ── Busca usuário ──
    let user;
    try {
      user = await getUser(userId);
    } catch (err) {
      console.error("❌ ERRO AO BUSCAR USER:", err);
      return res.status(500).json({ success: false, error: "Erro ao buscar usuário" });
    }

    if (!user) return res.status(404).json({ success: false, error: "Usuário não encontrado" });
    if (!user.email || !user.cpf) {
      return res.status(400).json({ success: false, error: "Usuário sem email ou CPF cadastrado" });
    }

    // ── Detecta operação ──
    const currentRank = planRank(user.planId);
    const newRank     = planRank(planId);
    const hasActive   = user.subscriptionId && user.planStatus === "active";

    const isRenew    = hasActive && user.planId === planId;
    const isUpgrade  = hasActive && newRank > currentRank;
    const isDowngrade = hasActive && newRank < currentRank && newRank >= 0;

    console.log(`🔄 Operação detectada: ${isRenew ? "RENOVAÇÃO" : isUpgrade ? "UPGRADE" : isDowngrade ? "DOWNGRADE" : "NOVA ASSINATURA"}`);
    console.log(`   Plano atual: ${user.planId} (rank ${currentRank}) → Novo: ${planId} (rank ${newRank})`);

    // =========================================================
    // DOWNGRADE — agenda para o próximo ciclo, sem cobrança agora
    // =========================================================
    if (isDowngrade) {
      await updateUser(userId, { nextPlanId: planId });

      return res.json({
        success: true,
        operation: "downgrade",
        message: `Downgrade para ${planId} programado para o próximo ciclo de cobrança.`,
      });
    }

    // =========================================================
    // UPGRADE ou RENOVAÇÃO — atualiza assinatura existente no Asaas
    // =========================================================
    if (isUpgrade || isRenew) {
      try {
        const payload = {
          value,
          cycle,
          billingType,
          nextDueDate: todayPlus(0), // cobrança imediata
          description: `Plano ${planId}`,
          updatePendingPayments: true,
        };

        const updated = await updateSubscription(user.subscriptionId, payload);

        // Salva o novo subscriptionId e marca nextPlanId para o webhook ativar
        await updateUser(userId, {
          subscriptionId: updated.id,
          nextPlanId: planId,
          billingCycle: cycle.toLowerCase(),
        });

        const { checkoutUrl, pixCode, paymentId } = await getPendingPayment(updated.id);

        return res.json({
          success: true,
          operation: isRenew ? "renew" : "upgrade",
          message: isRenew ? "Renovação iniciada" : `Upgrade para ${planId} iniciado`,
          subscriptionId: updated.id,
          paymentId,
          checkoutUrl,
          pixCode,
        });

      } catch (err) {
        console.warn("⚠️ Falha ao atualizar assinatura, tentando criar nova:", err.response?.data || err.message);
        // Fallback: cancela a antiga e cria nova abaixo
        user.subscriptionId = null;
      }
    }

    // =========================================================
    // NOVA ASSINATURA (primeira vez ou fallback)
    // =========================================================

    // Garante customer no Asaas
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

    // Cria assinatura
    let subscription;
    try {
      const nextDueDate = cycle === "YEARLY" ? todayPlus(365) : todayPlus(30);

      subscription = await createSubscription({
        customer: user.customerId,
        billingType,
        value,
        cycle,
        nextDueDate,
        description: `Plano ${planId}`,
        externalReference: userId,
      });

      if (!subscription?.id) throw new Error("Asaas não retornou subscriptionId");
      console.log("✅ SUBSCRIPTION criada:", subscription.id);

    } catch (err) {
      console.error("❌ ERRO AO CRIAR SUBSCRIPTION:", err.response?.data || err);
      return res.status(500).json({ success: false, error: "Erro ao criar assinatura no Asaas" });
    }

    // Busca cobrança gerada
    const { checkoutUrl, pixCode, paymentId } = await getPendingPayment(subscription.id).catch(() => ({}));

    // Atualiza usuário
    try {
      await updateUser(userId, {
        subscriptionId: subscription.id,
        subscriptionCreatedAt: new Date(),
        nextPlanId: planId,
        planStatus: "pending_payment",
        billingCycle: cycle.toLowerCase(),
      });
    } catch (err) {
      console.error("⚠️ ERRO AO ATUALIZAR USER:", err);
    }

    return res.json({
      success: true,
      operation: "new",
      subscriptionId: subscription.id,
      customerId: user.customerId,
      planId,
      paymentId,
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
// CANCELAR PAGAMENTO PENDENTE (sem reabrir)
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
    return res.status(400).json({ success: false, error: "Usuário não possui pagamento pendente." });
  }

  // Deleta assinatura pendente no Asaas
  if (user.subscriptionId) {
    try {
      await axios.delete(`${ASAAS_API}/subscriptions/${user.subscriptionId}`, { headers: asaasHeaders });
      console.log("🗑️ Assinatura pendente deletada:", user.subscriptionId);
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error("❌ Erro ao deletar assinatura pendente:", err.response?.data || err);
        return res.status(500).json({ success: false, error: "Erro ao cancelar cobrança no Asaas" });
      }
      console.warn("⚠️ Assinatura já não existia no Asaas.");
    }
  }

  // Volta ao status anterior sem alterar planId
  try {
    await updateUser(userId, {
      subscriptionId: null,
      nextPlanId: null,
      planStatus: user.planId && user.planId !== "nobreza" ? "active" : "inactive",
    });
    console.log("🧹 Pendência limpa:", userId);
  } catch (err) {
    console.error("⚠️ Erro ao limpar pendência:", err);
    return res.status(500).json({ success: false, error: "Erro ao atualizar usuário" });
  }

  return res.json({ success: true, message: "Pagamento pendente cancelado." });
}

// =========================================================
// CANCELAR ASSINATURA DEFINITIVAMENTE (plano ativo)
//
// Body: { subscriptionId }
// =========================================================

export async function cancelSubscription(req, res) {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ success: false, error: "subscriptionId é obrigatório" });
    }

    console.log("🛑 Cancelando assinatura:", subscriptionId);

    await axios.delete(`${ASAAS_API}/subscriptions/${subscriptionId}`, { headers: asaasHeaders });

    // Atualiza todos os usuários com essa assinatura
    const users = await db.collection("users").where("subscriptionId", "==", subscriptionId).get();

    for (const doc of users.docs) {
      await doc.ref.update({
        planStatus: "cancelled",
        subscriptionId: null,
        nextPlanId: null,
      });

      // Notifica o usuário
      const userData = doc.data();
      await sendPush(
        userData.fcmToken,
        "Assinatura cancelada",
        "Sua assinatura foi cancelada. Você pode reativar quando quiser."
      );
    }

    console.log("✅ Assinatura cancelada:", subscriptionId);

    return res.json({ success: true, message: "Assinatura cancelada com sucesso." });

  } catch (err) {
    console.error("❌ ERRO AO CANCELAR:", err.response?.data || err);
    return res.status(500).json({ success: false, error: "Erro ao cancelar assinatura" });
  }
}

// =========================================================
// ALERTAS DE VENCIMENTO DO PLANO ATIVO
//
// Chamar via cron job diário (ex: todo dia às 9h)
// Envia push quando faltam 30, 15, 7 e 1 dia para expirar
// =========================================================

export async function checkPlanExpirations(req, res) {
  try {
    const now = new Date();

    // Busca usuários com plano ativo
    const snapshot = await db
      .collection("users")
      .where("planStatus", "==", "active")
      .get();

    let notified = 0;

    for (const doc of snapshot.docs) {
      const user = doc.data();

      if (!user.planExpiresAt || !user.fcmToken) continue;

      const expiresAt = user.planExpiresAt.toDate?.() ?? new Date(user.planExpiresAt);
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

      // Dispara em marcos específicos
      if (![30, 15, 7, 1].includes(daysLeft)) continue;

      const messages = {
        30: { title: "Seu plano vence em 30 dias", body: "Renove agora para não perder o acesso." },
        15: { title: "Seu plano vence em 15 dias", body: "Não esqueça de renovar sua assinatura!" },
         7: { title: "⚠️ Seu plano vence em 7 dias", body: "Renove agora para manter seus benefícios." },
         1: { title: "🚨 Seu plano vence amanhã!", body: "Renove hoje para não perder o acesso." },
      };

      const { title, body } = messages[daysLeft];

      await sendPush(user.fcmToken, title, body);

      // Registra o alerta enviado para evitar duplicatas
      await doc.ref.update({
        [`expirationAlertSent_${daysLeft}d`]: new Date(),
      });

      notified++;
      console.log(`🔔 Alerta ${daysLeft}d enviado para: ${doc.id}`);
    }

    return res.json({ success: true, notified });

  } catch (err) {
    console.error("❌ ERRO AO CHECAR EXPIRAÇÕES:", err);
    return res.status(500).json({ success: false, error: "Erro ao processar alertas" });
  }
}

// =========================================================
// HELPER INTERNO — atualiza assinatura no Asaas
// =========================================================

export async function updateSubscription(subscriptionId, payload) {
  const response = await axios.put(
    `${ASAAS_API}/subscriptions/${subscriptionId}`,
    payload,
    { headers: asaasHeaders }
  );
  return response.data;
}