import admin from "firebase-admin";

const db = admin.firestore();

export async function checkExpiringSubscriptions(req, res) {
  const { userId } = req.params;

  console.log("👤 verificando usuário:", userId);

  try {
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const user = userDoc.data();

    const expiresAt = user.planExpiresAt?.toDate
      ? user.planExpiresAt.toDate()
      : new Date(user.planExpiresAt);

    const now = new Date();

    const daysLeft = Math.max(
      0,
      Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
    );

    console.log("👤 usuário:", userId);
    console.log("📅 expira em:", expiresAt);
    console.log("⏳ dias restantes:", daysLeft);

    return res.json({
      planId: user.planId || "gratuito",
      daysLeft,
      subscriptionId: user.subscriptionId || user.lastSubscriptionId || null,
      planStatus: user.planStatus || "inactive",
    });

  } catch (error) {
    console.error("❌ erro:", error);
    res.status(500).json({ error: "Erro interno" });
  }
}