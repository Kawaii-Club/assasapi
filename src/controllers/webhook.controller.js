import { updateUserByCustomerId, getUserByCustomerId } from "../services/user.service.js";
import admin from "firebase-admin";

const db = admin.firestore();

const PLAN_ORDER = { nobreza: 0, alteza: 1, majestade: 2 };

function planRank(planId) {
  return PLAN_ORDER[planId?.toLowerCase()] ?? -1;
}

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

function calcExpiresAt(startedAt, billingCycle) {
  const d = new Date(startedAt);
  const cycle = (billingCycle ?? "monthly").toLowerCase().trim();

  if (cycle === "yearly" || cycle === "anual") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

export async function asaasWebhook(req, res) {
  try {

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

      if (event === "SUBSCRIPTION_CREATED") {
        if (user.planStatus !== "active") {
          await updateUserByCustomerId(subscription.customer, {
            subscriptionId: subscription.id,
            planStatus: "pending_payment",
            subscriptionCreatedAt: new Date(),
          });
        } else {
          await updateUserByCustomerId(subscription.customer, {
            subscriptionId: subscription.id,
            subscriptionCreatedAt: new Date(),
          });
        }
        console.log("🆕 Assinatura criada:", user.id);
      }

      if (event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED") {
        if (user.planStatus === "active") {
          await downgradeToBasic(subscription.customer);
          await sendPush(
            user.fcmToken,
            "Assinatura encerrada",
            "Seu plano foi encerrado. Você pode reativar quando quiser.",
            { type: "subscription_cancelled" }
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

    const orderRef = db.collection("orders").doc(payment.id);
    const orderSnap = await orderRef.get();

    await orderRef.set({
      userId: user.id,
      customerId: payment.customer,
      subscriptionId: payment.subscription || null,
      paymentId: payment.id,
      billingType: payment.billingType,
      value: payment.value,
      status: payment.status?.toLowerCase(),
      eventType: event,
      dueDate: payment.dueDate,
      checkoutUrl: payment.invoiceUrl || null,
      pixCode: payment.pixQrCode || null,
      paidAt: payment.paymentDate || null,
      updatedAt: new Date(),
      ...(!orderSnap.exists && {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    }, { merge: true });

    console.log("💾 Order salva:", payment.id, "| status:", payment.status);

    // =========================================================
    // PAYMENT_CREATED
    // =========================================================
    if (event === "PAYMENT_CREATED") {
      if (user.planStatus !== "active") {
        await updateUserByCustomerId(customerId, {
          planStatus: "pending_payment",
        });
        console.log("🧾 Cobrança criada, status → pending_payment:", payment.id);
      } else {
        console.log("🧾 Cobrança criada para plano ativo (renovação), status mantido:", payment.id);
      }
    }

    // =========================================================
    // PAYMENT_DUE_DATE_WARNING
    // =========================================================
    if (event === "PAYMENT_DUE_DATE_WARNING") {
      await sendPush(
        user.fcmToken,
        "Fatura prestes a vencer",
        `Sua fatura vence em ${payment.dueDate}.`,
        { type: "payment_due", paymentId: payment.id }
      );
      console.log("🔔 Alerta de vencimento de fatura enviado:", payment.id);
    }

    // =========================================================
    // PAYMENT_CONFIRMED / RECEIVED
    // =========================================================
    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {

      // ── 🔍 DEBUG COMPLETO — remove após confirmar funcionamento ──
      console.log("🔍 PAYMENT_RECEIVED DEBUG:", JSON.stringify({
        paymentId:       payment.id,
        paymentSub:      payment.subscription,
        paymentDate:     payment.paymentDate,
        userSub:         user.subscriptionId,
        lastPaymentId:   user.lastPaymentId,
        userPlanId:      user.planId,
        nextPlanId:      user.nextPlanId,
        planStatus:      user.planStatus,
        billingCycle:    user.billingCycle,
        subMatch:        payment.subscription === user.subscriptionId,
        isDuplicate:     user.lastPaymentId === payment.id,
        newPlan:         user?.nextPlanId ?? user?.planId,
        currentRank:     planRank(user.planId),
        newRank:         planRank(user?.nextPlanId ?? user?.planId),
        wouldDowngrade:  planRank(user?.nextPlanId ?? user?.planId) < planRank(user.planId),
      }, null, 2));

      // ── Proteção duplicidade ──
      if (user.lastPaymentId === payment.id) {
        console.log("🔁 [BLOQUEADO] Pagamento já processado:", payment.id);
        return res.status(200).json({ ignored: true });
      }

      // ── Proteção assinatura diferente ──
      if (
        user.subscriptionId &&
        payment.subscription &&
        payment.subscription !== user.subscriptionId
      ) {
        console.warn("⚠️ [BLOQUEADO] Assinatura diferente da atual:", {
          paymentSub: payment.subscription,
          userSub: user.subscriptionId,
        });
        return res.status(200).json({ ignored: true });
      }

      const newPlan = user?.nextPlanId ?? user?.planId;

      // ── Proteção anti-downgrade ──
      if (
        user.planId &&
        newPlan &&
        planRank(newPlan) < planRank(user.planId)
      ) {
        console.warn("⚠️ [BLOQUEADO] Downgrade acidental:", {
          current: user.planId,
          next: newPlan,
        });
        await updateUserByCustomerId(customerId, { nextPlanId: null });
        return res.status(200).json({ ignored: true });
      }

      const startedAt = payment.paymentDate
        ? new Date(payment.paymentDate)
        : new Date();

      const expiresAt = calcExpiresAt(startedAt, user.billingCycle || "monthly");

      console.log(`⏳ Ativando plano: ${newPlan} | De: ${startedAt.toISOString()} | Até: ${expiresAt.toISOString()}`);

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
        expirationAlertSent_30d: null,
        expirationAlertSent_15d: null,
        expirationAlertSent_7d: null,
        expirationAlertSent_1d: null,
      });

      await sendPush(
        user.fcmToken,
        "Pagamento confirmado ✅",
        `Seu plano ${newPlan} está ativo até ${expiresAt.toLocaleDateString("pt-BR")}.`,
        { type: "payment_confirmed" }
      );

      console.log(`✅ [SUCESSO] Plano ativado: ${newPlan} | Expira: ${expiresAt.toISOString()}`);
    }

    // =========================================================
    // PAYMENT_OVERDUE
    // =========================================================
    if (event === "PAYMENT_OVERDUE") {
      await downgradeToBasic(customerId);
      await sendPush(
        user.fcmToken,
        "Pagamento em atraso ⚠️",
        "Sua fatura venceu e seu plano foi rebaixado. Renove para recuperar o acesso.",
        { type: "payment_overdue" }
      );
      console.log("⛔ Plano rebaixado por inadimplência:", user.id);
    }

    // =========================================================
    // PAYMENT_REFUNDED
    // =========================================================
    if (event === "PAYMENT_REFUNDED") {
      await updateUserByCustomerId(customerId, {
        planStatus: "refunded",
        nextPlanId: null,
      });
      await sendPush(
        user.fcmToken,
        "Pagamento estornado",
        "O valor do seu pagamento foi devolvido.",
        { type: "payment_refunded" }
      );
      console.log("💸 Pagamento estornado:", payment.id);
    }

    // =========================================================
    // PAYMENT_DELETED
    // =========================================================
    if (event === "PAYMENT_DELETED") {
      if (user.planStatus === "pending_payment") {
        await updateUserByCustomerId(customerId, {
          planStatus: user.planId && user.planId !== "nobreza"
            ? "active"
            : "inactive",
          subscriptionId: null,
          nextPlanId: null,
        });
        console.log("🗑️ Cobrança deletada, pendência limpa:", payment.id);
      } else {
        console.log("🗑️ Cobrança deletada (plano ativo mantido):", payment.id);
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    return res.status(500).json({ error: "Webhook error" });
  }
}