import express from "express";
import cors from "cors";

import debugRoutes from "./routes/debug.routes.js";
import paymentsRoutes from "./routes/payment.routes.js";
import connectionRoutes from "./routes/connection.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { sendPushNotification } from "./services/notification.service.js"; // ✅ IMPORT ADICIONADO
const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

// 🤝 CONEXÕES
app.use("/api/connections", connectionRoutes);

// 🔔 DEBUG
app.use("/api/debug", debugRoutes);

// 🔔 NOTIFICAÇÕES
app.use("/api/notifications", notificationRoutes);

// 💳 PAGAMENTOS
app.use("/api/payments", paymentsRoutes);

// ⚡ ROTA DE TESTE DE NOTIFICAÇÃO
app.post("/test-notification", async (req, res) => {
  try {
    const { fcmToken } = req.body;


    await sendPushNotification({
      fcmToken,
      title: "Teste de Notificação",
      body: "Se você está vendo isso, a notificação funcionou!",
      data: { type: "test" },
    });


    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao enviar notificação" });
  }
});


export default app; // ✅ exporta app