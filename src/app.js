import express from "express";
import cors from "cors";

import debugRoutes from "./routes/debug.routes.js";
import paymentsRoutes from "./routes/payment.routes.js";
import connectionRoutes from "./routes/connection.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { sendPushNotification } from "./services/notification.service.js";
import { asaasWebhook } from "./controllers/webhook.controller.js";
import { checkExpiringSubscriptions } from "./controllers/checkExpiring.controller.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { requireActiveSubscription } from "./middlewares/subscription.middleware.js";
import {
  cancelSubscription,
  cancelPendingPayment,
  checkPlanExpirations,
} from "./controllers/subscription.controller.js";

const app = express();

// =========================
// MIDDLEWARES GLOBAIS
// =========================

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

// =========================
// HEALTH CHECK
// =========================

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

// =========================
// WEBHOOK ASAAS
// Deve ficar antes de qualquer middleware de auth
// =========================

app.post("/api/webhook/asaas", asaasWebhook);

// =========================
// PAGAMENTOS / ASSINATURAS
// =========================

app.use("/api", paymentsRoutes);

app.post("/api/cancel-subscription", cancelSubscription);
app.post("/api/cancel-pending-payment", cancelPendingPayment);

// =========================
// CRON — alertas de expiração de plano
// Chamar diariamente: 0 9 * * *
// Ex: curl https://seudominio.com/api/cron/check-expirations
// =========================

app.get("/api/cron/check-expirations", checkPlanExpirations); // ✅ FIX: era "router", trocado para "app"

// =========================
// CHECK DE ASSINATURA (usado pelo Flutter)
// =========================

app.post("/api/subscriptions/check-expiring/:userId", checkExpiringSubscriptions);

// =========================
// CONEXÕES (rota pública + rota protegida)
// =========================

app.use("/api/connections", connectionRoutes);

app.get("/api/connections",
  authMiddleware,
  requireActiveSubscription,
  connectionRoutes
);

// =========================
// NOTIFICAÇÕES
// =========================

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

// =========================
// DEBUG (manter por último)
// =========================

app.use("/api/debug", debugRoutes);

export default app;