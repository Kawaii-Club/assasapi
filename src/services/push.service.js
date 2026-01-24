import { admin } from '../firebase/firebaseAdmin.js';

export async function sendPush({ toUserId, title, body, data }) {
  const userSnap = await admin.firestore()
    .collection('users')
    .doc(toUserId)
    .get();

  const token = userSnap.data()?.fcmToken;
  if (!token) return;

  await admin.messaging().send({
    token,
    notification: { title, body },
    data: data ?? {},
  });
}
