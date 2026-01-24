import { readFileSync } from "fs";
import admin from "firebase-admin";
import { sendPushNotification } from "./src/services/notification.service.js";

// Inicializa Firebase Admin (apenas para este script de teste)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(readFileSync("./serviceAccountKey.json", "utf8"))
    ),
  });
}

async function main() {
  try {
    await sendPushNotification({
      fcmToken: "eyVeku5DRYaAgaAeO6B_gw:APA91bEO2XDTlqw7f8s00cqnc6gMeTcnf2sRLweyOOGseWj4eGHTalAezvn45zCfeBxVaemzCnR8jP_snRjo3Z4nl2U3lQFf5dv_2-AiVVnohtqSm1LTMBQ",
      title: "Teste de Notificação",
      body: "Se você está vendo isso, a notificação funcionou!",
      data: { type: "test" },
    });

    console.log("✅ Notificação enviada com sucesso!");
  } catch (e) {
    console.error("❌ Erro ao enviar notificação:", e);
  }
}

main();