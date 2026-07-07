
import admin, { messaging } from "../firebase/firebaseAdmin.js";

export async function sendPushNotification({
  fcmToken,
  title,
  body,
  data,
}) {
  const message = {
    token: fcmToken,
    notification: {
      title,
      body,
    },
    data: data
      ? Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      )
      : {},
  };


  const response = await messaging.send(message);
  console.log('📲 Push enviado:', response);
  return response;
}