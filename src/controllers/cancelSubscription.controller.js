import axios from "axios";
import admin from "firebase-admin";

const db = admin.firestore();

export async function cancelSubscription(req, res) {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: "subscriptionId é obrigatório" });
    }

    console.log("🛑 Cancelando assinatura:", subscriptionId);

    // cancelar no Asaas
    await axios.delete(
      `https://api-sandbox.asaas.com/v3/subscriptions/${subscriptionId}`,
      {
        headers: {
          access_token: process.env.ASAAS_API_KEY,
        },
      }
    );

    // encontrar usuário no Firestore
    const users = await db
      .collection("users")
      .where("subscriptionId", "==", subscriptionId)
      .get();

    for (const doc of users.docs) {
      await doc.ref.update({
        planStatus: "cancelled",
        nextPlanId: "nobreza", // downgrade quando expirar
      });
    }

    res.json({
      success: true,
      message: "Assinatura cancelada. O plano permanece ativo até expirar.",
    });

  } catch (error) {
    console.error("❌ ERRO AO CANCELAR SUBSCRIPTION:", error.response?.data || error);

    res.status(500).json({
      error: "Erro ao cancelar assinatura",
      details: error.response?.data || error.message,
    });
  }
}