import express from "express";
import cors from "cors";

import debugRoutes from "./routes/debug.routes.js";
import paymentsRoutes from "./routes/payment.routes.js";
import connectionRoutes from "./routes/connection.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { sendPushNotification } from "./services/notification.service.js"; // ✅ IMPORT ADICIONADO
import { asaasWebhook } from "./controllers/webhook.controller.js";

import { authMiddleware } from "./middlewares/auth.middleware.js";
import { requireActiveSubscription } from "./middlewares/subscription.middleware.js";
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
app.use("/api", paymentsRoutes);


app.use("/api/connections", connectionRoutes);
app.post("/api/webhook/asaas", asaasWebhook);
app.get("/api/connections",
  authMiddleware,
  requireActiveSubscription,
  connectionRoutes
);
app.use("/api/debug", debugRoutes);


app.use("/api/notifications", notificationRoutes);


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


export default app; 