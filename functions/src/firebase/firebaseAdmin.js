import admin from 'firebase-admin';

function getProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    null
  );
}

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT inválido:', error.message);
    return null;
  }
}

function initializeFirebaseAdmin() {
  if (admin.apps.length) return;

  const serviceAccount = getServiceAccount();
  const projectId = getProjectId();

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId || undefined,
    });
    return;
  }

  const options = {};
  if (projectId) options.projectId = projectId;

  admin.initializeApp(options);
}

initializeFirebaseAdmin();

// Exportar referências do Firestore e Cloud Messaging
export const db = admin.firestore();
export const messaging = admin.messaging();

export default admin;
