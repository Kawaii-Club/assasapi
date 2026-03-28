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
    // SUBSCRIPTION EVENTS
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
        await updateUserByCustomerId(subscription.customer, {
          subscriptionId: subscription.id,
          planStatus: user.planStatus === "active" ? "active" : "pending_payment",
          subscriptionCreatedAt: new Date(),
        });
      }

      if (event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED") {
        if (user.planStatus === "active") {
          await downgradeToBasic(subscription.customer);
          await sendPush(
            user.fcmToken,
            "Assinatura encerrada",
            "Seu plano foi encerrado.",
            { type: "subscription_cancelled" }
          );
        }
      }

      return res.status(200).json({ received: true });
    }

    // =========================================================
    // PAYMENT EVENTS
    // =========================================================

    if (!payment?.customer || !payment?.id) {
      return res.status(200).json({ ignored: true });
    }

    const customerId = payment.customer;
    const user = await getUserByCustomerId(customerId);
    if (!user) return res.status(200).json({ ignored: true });

    // 🔥 SALVA ORDER (sempre)
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
      await updateUserByCustomerId(customerId, {
        planStatus: "pending_payment",
      });
      console.log("🧾 pending_payment:", payment.id);
    }

    // =========================================================
    // PAYMENT_CONFIRMED / RECEIVED
    // =========================================================

    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {

      console.log("💰 PAGAMENTO CONFIRMADO:", payment.id);

      // 🔥 FIX: só bloqueia duplicado se já estiver ACTIVE
      if (user.lastPaymentId === payment.id && user.planStatus === "active") {
        console.log("🔁 Já processado corretamente:", payment.id);
        return res.status(200).json({ ignored: true });
      }

      const newPlan = user?.nextPlanId ?? user?.planId;

      const startedAt = payment.paymentDate
        ? new Date(payment.paymentDate)
        : new Date();

      const expiresAt = calcExpiresAt(startedAt, user.billingCycle || "monthly");

      await updateUserByCustomerId(customerId, {
        planId: newPlan,
        nextPlanId: null,
        planStatus: "active", // 🔥 ESSENCIAL
        subscriptionId: payment.subscription || user.subscriptionId,
        billingCycle: user.billingCycle || "monthly",
        planStartedAt: startedAt,
        planExpiresAt: expiresAt,
        lastPaymentAt: startedAt,
        lastPaymentId: payment.id,
      });

      console.log("✅ Plano ATIVADO:", newPlan);
    }

    // =========================================================
    // PAYMENT_DELETED (FIX IMPORTANTE)
    // =========================================================

    if (event === "PAYMENT_DELETED") {
      await updateUserByCustomerId(customerId, {
        planStatus: user.planId && user.planId !== "nobreza"
          ? "active"
          : "inactive",
      });

      console.log("🗑️ Pendência limpa:", payment.id);
    }

    // =========================================================
    // PAYMENT_OVERDUE
    // =========================================================

    if (event === "PAYMENT_OVERDUE") {
      await downgradeToBasic(customerId);
      console.log("⛔ Plano rebaixado:", user.id);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err.message);
    return res.status(500).json({ error: "Webhook error" });
  }
}