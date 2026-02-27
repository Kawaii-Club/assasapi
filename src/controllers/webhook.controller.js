import { updateUserByCustomerId, getUserByCustomerId } from "../services/user.service.js";
import admin from "firebase-admin";

const db = admin.firestore();

export async function asaasWebhook(req, res) {
  try {
    if (req.headers["asaas-access-token"] !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: "Invalid webhook" });
    }

    const { event, payment } = req.body;

    console.log("🔥 WEBHOOK:", event);

    if (!payment?.customer || !payment?.id) {
      return res.status(200).json({ ignored: true });
    }

    const customerId = payment.customer;
    const user = await getUserByCustomerId(customerId);
    if (!user) return res.status(200).json({ ignored: true });

    const orderRef = db.collection("orders").doc(payment.id);

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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // ============================
    // CONTROLE DE STATUS
    // ============================

    if (event === "PAYMENT_CONFIRMED") {

      await updateUserByCustomerId(customerId, {
        planStatus: "active",
        subscriptionId: payment.subscription || null,
        subscriptionExpiresAt: new Date(payment.dueDate),
      });

      console.log("✅ Plano ativado:", user.id);
    }

    if (event === "PAYMENT_OVERDUE") {

      await updateUserByCustomerId(customerId, {
        planStatus: "expired",
      });

      console.log("⛔ Plano expirado:", user.id);
    }

    if (event === "PAYMENT_DELETED" || event === "SUBSCRIPTION_DELETED") {

      await updateUserByCustomerId(customerId, {
        planStatus: "canceled",
      });

      console.log("❌ Plano cancelado:", user.id);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    return res.status(500).json({ error: "Webhook error" });
  }
}