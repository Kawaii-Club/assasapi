import admin from '../firebase/firebaseAdmin.js';

export const sendNotification = async (req, res) => {
  try {
    const { token, title, body, data } = req.body;

    await admin.messaging().send({
      token,
      notification: { title, body },
      data,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar push' });
  }
};