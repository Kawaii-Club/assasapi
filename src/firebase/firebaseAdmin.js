import admin from "firebase-admin";
import fs from "fs";
import os from "os";
import path from "path";

if (!admin.apps.length) {
  const tmpFile = path.join(os.tmpdir(), "firebase-service-account.json");

  fs.writeFileSync(
    tmpFile,
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    { encoding: "utf-8" }
  );


  const serviceAccount = JSON.parse(
    fs.readFileSync(tmpFile, "utf-8")
  );
  console.log("🔑 Service Account JSON carregado do ambiente.",serviceAccount);
  console.log("🔑 Service Account carregado:", serviceAccount.project_id);
 
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

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
