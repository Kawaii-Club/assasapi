import { updateUserByCustomerId, getUserByCustomerId } from "../services/user.service.js";
import admin from "firebase-admin";

const db = admin.firestore();

// ─────────────────────────────────────────────────────────────
// Hierarquia de planos
// ─────────────────────────────────────────────────────────────
const PLAN_ORDER = { nobreza: 0, alteza: 1, majestade: 2 };

function planRank(planId) {
  return PLAN_ORDER[planId?.toLowerCase()] ?? -1;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function sendPush(fcmToken, title, body, data = {}) {
  if (!fcmToken) return;
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data,
    });
  } catch (err) {
    console.warn("⚠️ Push falhou:", err.message);
  }
}

async function downgradeToBasic(customerId) {
  await updateUserByCustomerId(customerId, {
    planId: "nobreza",
    nextPlanId: null,
    planStatus: "active",
    subscriptionId: null,
    planStartedAt: null,
    planExpiresAt: null,
  });
  console.log("👑 Usuário voltou para Nobreza:", customerId);
}

// Calcula a data de expiração baseado no ciclo salvo no usuário
function calcExpiresAt(startedAt, billingCycle) {
  const d = new Date(startedAt);
  const cycle = billingCycle?.toLowerCase();

  if (cycle === "yearly") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    // default: monthly
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

// =========================================================
// WEBHOOK PRINCIPAL
// =========================================================

export async function asaasWebhook(req, res) {
  try {

    // ── Segurança ──
    if (req.headers["asaas-access-token"] !== process.env.ASAAS_WEBHOOK_TOKEN) {
      console.log("⛔ Token inválido");
      return res.status(401).json({ error: "Invalid webhook" });
    }

    const { event, payment, subscription } = req.body;

    console.log("🔥 EVENTO:", event);

    // =========================================================
    // EVENTOS DE ASSINATURA
    // =========================================================

    if (event?.startsWith("SUBSCRIPTION_")) {

      if (!subscription?.customer) {
        return res.status(200).json({ ignored: true });
      }

      const user = await getUserByCustomerId(subscription.customer);
      if (!user) return res.status(200).json({ ignored: true });

      // Mantém coleção subscriptions atualizada
      await db.collection("subscriptions").doc(subscription.id).set({
        userId: user.id,
        customerId: subscription.customer,
        subscriptionId: subscription.id,
        status: subscription.status || null,
        value: subscription.value || null,
        billingType: subscription.billingType || null,
        cycle: subscription.cycle || null,
        nextDueDate: subscription.nextDueDate || null,
        description: subscription.description || null,
        updatedAt: new Date(),
      }, { merge: true });

      // ── SUBSCRIPTION_CREATED ──
      if (event === "SUBSCRIPTION_CREATED") {
        await updateUserByCustomerId(subscription.customer, {
          subscriptionId: subscription.id,
          planStatus: "pending_payment",
          subscriptionCreatedAt: new Date(),
        });
        console.log("🆕 Assinatura criada:", user.id);
      }

      // ── SUBSCRIPTION_DELETED / INACTIVATED ──
      // Só faz downgrade se o plano estava ativo.
      // Se estava pending_payment, o cancelPendingPayment já limpou — ignora.
      if (event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED") {
        if (user.planStatus === "active") {
          await downgradeToBasic(subscription.customer);
          await sendPush(
            user.fcmToken,
            "Assinatura encerrada",
            "Seu plano foi encerrado. Você pode reativar quando quiser."
          );
          console.log("❌ Assinatura ativa cancelada, downgrade:", user.id);
        } else {
          console.log("ℹ️ Assinatura pendente deletada, sem downgrade:", user.id);
        }
      }

      return res.status(200).json({ received: true });
    }

    // =========================================================
    // EVENTOS DE PAGAMENTO
    // =========================================================

    if (!payment?.customer || !payment?.id) {
      return res.status(200).json({ ignored: true });
    }

    const customerId = payment.customer;
    const user = await getUserByCustomerId(customerId);
    if (!user) return res.status(200).json({ ignored: true });

    // ── Garante subscription na coleção ──
    if (payment.subscription) {
      await db.collection("subscriptions").doc(payment.subscription).set({
        userId: user.id,
        customerId: payment.customer,
        subscriptionId: payment.subscription,
        billingType: payment.billingType || null,
        status: payment.status || "pending",
        updatedAt: new Date(),
      }, { merge: true });
    }

    // ── Salva/atualiza order ──
    const orderRef = db.collection("orders").doc(payment.id);
    const orderSnap = await orderRef.get();

    await orderRef.set({
      userId: user.id,
      customerId: payment.customer,
      subscriptionId: payment.subscription || null,
      paymentId: payment.id,
      billingType: payment.billingType,
      value: payment.value,
      status: payment.status,
      dueDate: payment.dueDate,
      checkoutUrl: payment.invoiceUrl || null,
      pixCode: payment.pixQrCode || null,
      paidAt: payment.paymentDate || null,
      updatedAt: new Date(),
      ...(!orderSnap.exists && {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    }, { merge: true });

    console.log("💾 Order salva:", payment.id);

    // =========================================================
    // PAYMENT_CREATED — cobrança gerada (ainda não paga)
    // =========================================================
    if (event === "PAYMENT_CREATED") {
      console.log("🧾 Cobrança criada:", payment.id);
      // Nenhuma ação no plano — aguarda confirmação
    }

    // =========================================================
    // PAYMENT_DUE_DATE_WARNING — fatura prestes a vencer
    // =========================================================
    if (event === "PAYMENT_DUE_DATE_WARNING") {
      await sendPush(
        user.fcmToken,
        "Fatura prestes a vencer",
        `Sua fatura de ${payment.value ? `R$ ${payment.value.toFixed(2)}` : ""} vence em ${payment.dueDate}.`,
        { type: "payment_due", paymentId: payment.id, invoiceUrl: payment.invoiceUrl || "" }
      );
      console.log("🔔 Alerta de vencimento de fatura enviado");
    }

    // =========================================================
    // PAYMENT_CONFIRMED / PAYMENT_RECEIVED — pagamento confirmado
    // =========================================================
    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {

      // ── Proteção: ignora pagamentos de assinaturas antigas ──
      if (
        user.subscriptionId &&
        payment.subscription &&
        payment.subscription !== user.subscriptionId
      ) {
        console.warn("⚠️ Pagamento de assinatura diferente da atual — ignorado.", {
          paymentSub: payment.subscription,
          userSub: user.subscriptionId,
        });
        return res.status(200).json({ ignored: true });
      }

      // ── Determina o plano a ativar ──
      // usa nextPlanId se existir, caso contrário mantém o atual
      const newPlan = user?.nextPlanId ?? user?.planId;

      // ── Proteção anti-downgrade acidental via webhook ──
      // Garante que um pagamento recorrente de ciclo passado não rebaixe o plano
      if (
        user.planId &&
        newPlan &&
        planRank(newPlan) < planRank(user.planId)
      ) {
        console.warn("⚠️ Webhook tentaria fazer downgrade acidental — ignorado.", {
          current: user.planId,
          next: newPlan,
        });
        await updateUserByCustomerId(customerId, { nextPlanId: null });
        return res.status(200).json({ ignored: true });
      }

      const startedAt = payment.paymentDate
        ? new Date(payment.paymentDate)
        : new Date();

      const expiresAt = calcExpiresAt(startedAt, user.billingCycle);

      await updateUserByCustomerId(customerId, {
        planId: newPlan,
        nextPlanId: null,
        planStatus: "active",
        subscriptionId: payment.subscription || user.subscriptionId,
        billingCycle: user.billingCycle || "monthly",
        planStartedAt: startedAt,
        planExpiresAt: expiresAt,
        lastPaymentAt: startedAt,
        lastPaymentId: payment.id,
        // limpa alertas de expiração para o novo ciclo
        expirationAlertSent_30d: null,
        expirationAlertSent_15d: null,
        expirationAlertSent_7d: null,
        expirationAlertSent_1d: null,
      });

      await sendPush(
        user.fcmToken,
        "Pagamento confirmado ✅",
        `Seu plano ${newPlan} está ativo até ${expiresAt.toLocaleDateString("pt-BR")}.`
      );

      console.log(`✅ Plano ativado: ${newPlan} | Expira: ${expiresAt}`);
    }

    // =========================================================
    // PAYMENT_OVERDUE — fatura vencida sem pagamento
    // =========================================================
    if (event === "PAYMENT_OVERDUE") {
      await downgradeToBasic(customerId);

      await sendPush(
        user.fcmToken,
        "Pagamento em atraso ⚠️",
        "Sua fatura venceu e seu plano foi rebaixado. Renove para recuperar o acesso."
      );

      console.log("⛔ Plano rebaixado por inadimplência:", user.id);
    }

    // =========================================================
    // PAYMENT_REFUNDED — pagamento estornado
    // =========================================================
    if (event === "PAYMENT_REFUNDED") {
      await updateUserByCustomerId(customerId, {
        planStatus: "refunded",
        nextPlanId: null,
      });

      await sendPush(
        user.fcmToken,
        "Estorno realizado",
        "O valor do seu pagamento foi estornado."
      );

      console.log("💸 Pagamento estornado:", payment.id);
    }

    // =========================================================
    // PAYMENT_DELETED — cobrança removida
    // =========================================================
    if (event === "PAYMENT_DELETED") {
      // Só altera o status se ainda estava pendente
      if (user.planStatus === "pending_payment") {
        await updateUserByCustomerId(customerId, {
          planStatus: user.planId && user.planId !== "nobreza" ? "active" : "inactive",
          subscriptionId: null,
          nextPlanId: null,
        });
      }
      console.log("🗑️ Cobrança deletada:", payment.id);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    return res.status(500).json({ error: "Webhook error" });
  }
}