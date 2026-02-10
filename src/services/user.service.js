import { db } from "../firebase/firebaseAdmin.js";

export async function getUser(userId) {
  const doc = await db.collection("users").doc(userId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function updateUser(userId, data) {
  await db.collection("users").doc(userId).update(data);
}
