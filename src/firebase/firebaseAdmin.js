import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'kawaii-clube-116a6',
  });
}

export const messaging = admin.messaging();
export default admin;