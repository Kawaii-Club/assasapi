import admin from "firebase-admin";

const db = admin.firestore();

export async function checkExpiringSubscriptions(req, res) {

  try {

    const now = new Date();
    const in3Days = new Date();
    in3Days.setDate(now.getDate() + 3);

    const nowTimestamp = admin.firestore.Timestamp.fromDate(now);
    const limitTimestamp = admin.firestore.Timestamp.fromDate(in3Days);

    console.log("⏱ Agora:", now.toISOString());
    console.log("📅 Limite (3 dias):", in3Days.toISOString());

    const snapshot = await db
      .collection("users")
      .where("planStatus", "==", "active")
      .where("subscriptionExpiresAt", ">=", nowTimestamp)
      .where("subscriptionExpiresAt", "<=", limitTimestamp)
      .get();

    console.log("👥 usuários encontrados:", snapshot.size);

    for (const doc of snapshot.docs) {

      const user = doc.data();

      // segurança extra caso campo não exista
      if (!user.subscriptionExpiresAt) continue;

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

      console.log("🔔 Notificação enviada:", doc.id);

    }

    return res.json({
      success: true,
      usersChecked: snapshot.size
    });

  } catch (err) {

    console.error("❌ erro ao verificar expiração:", err);

    return res.status(500).json({
      error: err.message
    });

  }

}