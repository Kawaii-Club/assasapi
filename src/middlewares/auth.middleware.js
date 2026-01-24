// import { admin } from '../firebase/firebaseAdmin.js';

// export async function authMiddleware(req, res, next) {
//   const authHeader = req.headers.authorization;
//   if (!authHeader) {
//     return res.status(401).json({ error: 'unauthorized' });
//   }

//   const token = authHeader.replace('Bearer ', '');

//   try {
//     const decoded = await admin.auth().verifyIdToken(token);
//     req.user = decoded;
//     next();
//   } catch {
//     res.status(401).json({ error: 'invalid_token' });
//   }
// }



import admin from '../firebase/firebaseAdmin.js';

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}