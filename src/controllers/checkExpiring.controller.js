import admin from "firebase-admin";

const db = admin.firestore();

export async function checkExpiringSubscriptions(req, res) {

  try {

    const now = new Date();
    const in3Days = new Date();
    in3Days.setDate(now.getDate() + 3);
   console.log("⏱ Agora:", now.toISOString());
    console.log("📅 Limite (3 dias):", in3Days.toISOString());
    const snapshot = await db.collection("users")
      .where("planStatus", "==", "active")
      .where("subscriptionExpiresAt", "<=", in3Days)
      .get();

    for (const doc of snapshot.docs) {

      const user = doc.data();

      if (!user.fcmToken) continue;

      await admin.messaging().send({
        token: user.fcmToken,
        notification: {
          title: "Seu plano vai expirar em breve ⏳",
          body: "Renove sua assinatura para não perder seus benefícios.",
        },
        data: {
          type: "subscription_expiring"
        }
      });

      console.log("🔔 Notificação enviada:", user.id);

    }

    return res.json({ success: true });

  } catch (err) {

    console.error("❌ erro ao verificar expiração:", err);

    return res.status(500).json({ error: "internal error" });
  }

}