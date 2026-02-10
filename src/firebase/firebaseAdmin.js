import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'kawaii-clube-116a6',
    
  });
  console.log(
  "🔥 FIREBASE_SERVICE_ACCOUNT exists?",
  !!process.env.FIREBASE_SERVICE_ACCOUNT
);

}
export const db = admin.firestore();       // ✅ Firestore

export const messaging = admin.messaging();
export default admin;