import admin from "firebase-admin";

const db = admin.firestore();

export async function checkExpiringSubscriptions(req, res) {
  const { userId } = req.params;

  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "Usuário não encontrado" });

    const user = userDoc.data();

    const expiresAt = user.planExpiresAt?.toDate?.()
      ? user.planExpiresAt.toDate()
      : user.planExpiresAt
        ? new Date(user.planExpiresAt)
        : null;

    const now = new Date();
    const isExpired = expiresAt && now > expiresAt;

    // 🔥 Se expirou e ainda não está no básico, faz downgrade
    if (isExpired && user.planId !== "nobreza") {
      await db.collection("users").doc(userId).update({
        planId: "nobreza",
        nextPlanId: null,
        planStatus: "active",   // ativo no básico
        subscriptionId: null,
        planStartedAt: null,
        planExpiresAt: null,
      });
      console.log("👑 Plano expirado, voltou para Nobreza:", userId);

      return res.json({
        planId: "nobreza",
        daysLeft: 0,
        subscriptionId: null,
        planStatus: "active",
      });
    }

    const daysLeft = expiresAt
      ? Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)))
      : 0;

    return res.json({
      planId: user.planId || "nobreza",
      daysLeft,
      subscriptionId: user.subscriptionId || null,
      planStatus: user.planStatus || "active",
    });

  } catch (error) {
    console.error("❌ erro:", error);
    res.status(500).json({ error: "Erro interno" });
  }
}