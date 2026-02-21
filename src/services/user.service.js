import { db } from "../firebase/firebaseAdmin.js";

export async function getUser(userId) {
  const doc = await db.collection("users").doc(userId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function updateUser(userId, data) {
  await db.collection("users").doc(userId).update(data);
}
export async function updateUserByCustomerId(customerId, data) {
  const snapshot = await db
    .collection("users")
    .where("customerId", "==", customerId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const docRef = snapshot.docs[0].ref;

  await docRef.update(data);

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data(),
    ...data,
  };
}
export async function getUserByCustomerId(customerId) {
  const snapshot = await db
    .collection("users")
    .where("customerId", "==", customerId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data(),
  };
}