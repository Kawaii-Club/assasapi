// import admin from '../firebase/firebaseAdmin.js';
// export async function sendPushNotification({
//   token,
//   title,
//   body,
//   data = {},
// }) {
//   if (!token) return;

//   const message = {
//     token,
//     notification: {
//       title,
//       body,
//     },
//     data,
//   };

//   await admin.messaging().send(message);
// }
// import admin from '../firebase/firebaseAdmin.js';

// export async function sendPushNotification({
//   toUserId,
//   title,
//   body,
//   data = {},
// }) {
//   const db = admin.firestore();

//   // exemplo: buscar token do usuário
//   const userSnap = await db.collection('users').doc(toUserId).get();
//   if (!userSnap.exists) return;

//   const { fcmToken } = userSnap.data();
//   if (!fcmToken) return;

//   await admin.messaging().send({
//     token: fcmToken,
//     notification: { title, body },
//     data,
//   });
// }


import admin from "firebase-admin";



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


  const response = await admin.messaging().send(message);
  console.log('📲 Push enviado:', response);
  return response;
}