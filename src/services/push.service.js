import admin, { db, messaging } from '../firebase/firebaseAdmin.js';

export async function sendPush({ toUserId, title, body, data }) {
  const userSnap = await db
    .collection('users')
    .doc(toUserId)
    .get();

  const token = userSnap.data()?.fcmToken;
  if (!token) return;

  await messaging.send({
    token,
    notification: { title, body },
    data: data ?? {},
  });
}
