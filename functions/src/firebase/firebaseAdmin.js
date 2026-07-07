import admin from 'firebase-admin';

// Inicializar Firebase Admin com credenciais padrão
if (!admin.apps.length) {
  admin.initializeApp();
}

// Exportar referências do Firestore e Cloud Messaging
export const db = admin.firestore();
export const messaging = admin.messaging();

export default admin;
