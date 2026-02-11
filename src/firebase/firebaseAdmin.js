import admin from 'firebase-admin';
import fs from 'fs';
import os from 'os';
import path from 'path';

if (!admin.apps.length) {
  // Cria um arquivo temporário com a Service Account do env
  const tmpFile = path.join(os.tmpdir(), 'firebase-service-account.json');
  fs.writeFileSync(tmpFile, process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  admin.initializeApp({
    credential: admin.credential.cert(tmpFile),
    projectId: 'kawaii-clube-116a6',
  });

  console.log(
    "🔥 FIREBASE_SERVICE_ACCOUNT exists?",
    !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  );
}

export const db = admin.firestore();       // ✅ Firestore
export const messaging = admin.messaging();
export default admin;
