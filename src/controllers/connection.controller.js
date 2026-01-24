import { createConnectionRequest } from '../services/connection.service.js';
import { sendPushNotification } from '../services/notification.service.js';

export async function requestConnection(req, res) {
  try {
    const fromUserId = req.user.uid;
    const { toUserId } = req.body;

    if (!toUserId) {
      return res.status(400).json({ error: 'toUserId_required' });
    }

    if (fromUserId === toUserId) {
      return res.status(400).json({ error: 'invalid_target' });
    }

    // 1️⃣ cria solicitação
    const requestId = await createConnectionRequest({
      fromUserId,
      toUserId,
    });

    // 2️⃣ push
    await sendPushNotification({
      toUserId,
      title: 'Nova solicitação de conexão',
      body: 'Você recebeu uma nova solicitação',
      data: {
        type: 'connection_request',
        requestId,
      },
    });

    res.json({ ok: true, requestId });
  } catch (e) {
    console.error('❌ requestConnection', e);
    res.status(500).json({ error: 'internal_error' });
  }
}
