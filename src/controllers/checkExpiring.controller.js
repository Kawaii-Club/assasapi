import admin from "firebase-admin";

const db = admin.firestore();

export async function checkExpiringSubscriptions(req, res) {

  const { userId } = req.params;

  console.log("👤 verificando usuário:", userId);
  try {

    const { userId } = req.params;

    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "user not found" });
    }

    const user = userDoc.data();

    if (!user.subscriptionExpiresAt) {
      return res.json({
        expiringSoon: false,
        message: "Usuário não tem data de expiração"
      });
    }

    const now = new Date();
    const expires = user.subscriptionExpiresAt.toDate();

    const diffDays = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));

    console.log("👤 usuário:", userId);
    console.log("📅 expira em:", expires);
    console.log("⏳ dias restantes:", diffDays);

    return res.json({
      expiringSoon: diffDays <= 3,
      daysLeft: diffDays
    });

  } catch (err) {

    console.error("❌ erro:", err);

    return res.status(500).json({
      error: err.message
    });

  }

}