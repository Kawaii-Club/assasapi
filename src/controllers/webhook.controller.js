import { updateUserByCustomerId } from "../services/user.service.js";

export async function asaasWebhook(req, res) {
  const event = req.body;

  try {
    const eventType = event.event;
    const payment = event.payment;

    if (
      eventType === "PAYMENT_CONFIRMED" ||
      eventType === "SUBSCRIPTION_CREATED"
    ) {
      const customerId = payment.customer;
      const userId = payment.externalReference;

      await updateUserByCustomerId(customerId, {
        planStatus: "active",
        subscriptionId: payment.subscription || null,
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    return res.status(500).json({ error: "Webhook error" });
  }
}
