import { Router } from "express";
import { createSubscriptionController } from "../controllers/subscription.controller.js";
import { createExternalCardSubscription } from "../controllers/externalcard.controller.js";
import { getUser } from "../services/user.service.js"; // ✅ Import correto

const router = Router();

// Rota padrão de assinatura (PIX ou cartão interno)
router.post("/create-subscription", createSubscriptionController);

// 🚀 Rota externa para cartão
router.post("/create-external-card", async (req, res) => {
  try {
    const { userId, planId, value, cycle } = req.body;

    if (!userId || !planId || !value || !cycle) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    // Busca o usuário para pegar o customerId
    const user = await getUser(userId);
    if (!user?.customerId) {
      return res.status(400).json({ error: "Usuário sem customerId" });
    }

    const result = await createExternalCardSubscription({
      customerId: user.customerId,
      userId,
      planId,
      value,
      cycle,
    });

    // Retornamos apenas o checkoutUrl
    return res.status(201).json({
      checkoutUrl: result?.url, // 🔥 chave que o Flutter espera
      ...result, // opcional, caso queira enviar mais infos
    });
  } catch (err) {
    console.error("❌ CREATE EXTERNAL CARD:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Erro ao criar pagamento externo",
      details: err.response?.data || err.message,
    });
  }
});

export default router;
