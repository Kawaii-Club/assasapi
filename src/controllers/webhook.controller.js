import { updateUserByCustomerId, getUserByCustomerId } from "../services/user.service.js";
import admin from "firebase-admin";

const db = admin.firestore();

export async function asaasWebhook(req, res) {
  try {
    // ✅ valida webhook
    if (req.headers["asaas-access-token"] !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: "Invalid webhook" });
    }

    const { event, payment } = req.body;

    console.log("🔥 WEBHOOK:", event);

    if (!payment?.customer) {
      return res.status(200).json({ ignored: true });
    }

    const customerId = payment.customer;

    // busca usuário
    const user = await getUserByCustomerId(customerId);

    if (!user) return res.status(200).json({ ignored: true });

    // ========================
    // PAGAMENTO CONFIRMADO
    // ========================
    if (event === "PAYMENT_CONFIRMED") {

      // evita duplicação
      if (user.planStatus === "active") {
        return res.json({ ignored: "already active" });
      }

      await updateUserByCustomerId(customerId, {
        planStatus: "active",
        subscriptionId: payment.subscription || null,
        planId: payment.description?.replace("Plano ", "") || null,
      });

      // salva histórico
      await db.collection("orders").add({
        userId: user.id,
        customerId,
        subscriptionId: payment.subscription,
        planName: payment.description,
        price: payment.value,
        paymentMethod: payment.billingType,
        paymentId: payment.id, // importante
        status: payment.status,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("✅ Plano ativado:", user.id);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    return res.status(500).json({ error: "Webhook error" });
  }
}