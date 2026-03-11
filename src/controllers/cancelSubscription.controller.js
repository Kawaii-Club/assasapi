import axios from "axios";
import admin from "firebase-admin";

const db = admin.firestore();

export async function cancelSubscription(req, res) {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: "subscriptionId é obrigatório" });
    }

    // cancelar no Asaas
    await axios.delete(
      `https://api-sandbox.asaas.com/v3/subscriptions/${subscriptionId}`,
      {
        headers: {
          access_token: process.env.ASAAS_API_KEY,
        },
      }
    );

    // atualizar Firestore
    const users = await db
      .collection("users")
      .where("subscriptionId", "==", subscriptionId)
      .get();

    for (const doc of users.docs) {
      await doc.ref.update({
        planStatus: "cancelled",
        planExpiresAt: admin.firestore.FieldValue.delete(),
      });
    }

    res.json({
      success: true,
      message: "Assinatura cancelada",
    });

  } catch (error) {
    console.error("❌ Erro cancelando assinatura:", error?.response?.data || error);
    res.status(500).json({
      error: "Erro ao cancelar assinatura",
    });
  }
}