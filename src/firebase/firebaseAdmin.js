import admin from "firebase-admin";
import fs from "fs";
import os from "os";
import path from "path";

if (!admin.apps.length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT não definida");
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("🔥 Firebase Admin inicializado:", serviceAccount.project_id);
}

export const db = admin.firestore();
export const messaging = admin.messaging();
export default admin;
// import admin from "firebase-admin";

// if (!admin.apps.length) {
//   admin.initializeApp({
//     projectId: "kawaii-clube-116a6",
//   });
// }

// export const db = admin.firestore();
// export const messaging = admin.messaging();
// export default admin;
