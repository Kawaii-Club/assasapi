import { getUser, updateUser } from "../services/user.service.js";
import {
  createSubscription,
  createCustomer,
  getSubscriptionPayments,
} from "../services/asaas.service.js";
import { todayPlus } from "../utils/date.js";

export async function createSubscriptionController(req, res) {
  try {
    const {
      userId,
      planId,
      value,
      cycle,       
      billingType,  
      creditCard,
      creditCardHolderInfo,
      remoteIp,
    } = req.body;

    // =========================
    // 1️⃣ Campos obrigatórios principais
    // =========================
    const missingFields = [];
    if (!userId) missingFields.push("userId");
    if (!planId || !planId.trim()) missingFields.push("planId");
    if (value == null) missingFields.push("value");
    if (!cycle) missingFields.push("cycle");
    if (!billingType) missingFields.push("billingType");

    if (missingFields.length > 0) {
      console.log("❌ Campos obrigatórios faltando no request:", missingFields);
      return res.status(400).json({
        error: "Campos obrigatórios faltando",
        missingFields,
      });
    }

    // =========================
    // 2️⃣ Buscar usuário
    // =========================
    const user = await getUser(userId);
    console.log("👤 USER:", user);

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Checa dados obrigatórios do usuário
    const missingUserFields = [];
    if (!user.email) missingUserFields.push("email");
    if (!user.cpf) missingUserFields.push("cpf");

    if (missingUserFields.length > 0) {
      console.log("❌ Dados obrigatórios do usuário faltando:", missingUserFields);
      return res.status(400).json({
        error: "Usuário sem dados obrigatórios",
        missingFields: missingUserFields,
      });
    }

    // =========================
    // 3️⃣ Cria customer se não existir
    // =========================
    if (!user.customerId) {
      const customer = await createCustomer({
        name: user.name,
        email: user.email,
        cpfCnpj: user.cpf,
        phone: user.phone,
        externalReference: userId,
      });

      await updateUser(userId, { customerId: customer.id });
      user.customerId = customer.id;
      console.log("💳 Novo customer criado:", customer.id);
    }

    const nextDueDate = cycle === "YEARLY" ? todayPlus(365) : todayPlus(30);

    const payload = {
      customer: user.customerId,
      billingType,
      value,
      cycle,
      nextDueDate,
      description: `Plano ${planId}`,
      externalReference: userId,
    };

    // =========================
    // 4️⃣ Validação do cartão de crédito
    // =========================
    if (billingType === "CREDIT_CARD") {
      const missingCardFields = [];

      const requiredCard = ["number", "holderName", "expiryMonth", "expiryYear", "ccv"];
      requiredCard.forEach(f => {
        if (!creditCard?.[f]) missingCardFields.push(`creditCard.${f}`);
      });

      const requiredHolder = ["name", "email", "cpfCnpj", "postalCode", "addressNumber", "phone"];
      requiredHolder.forEach(f => {
        if (!creditCardHolderInfo?.[f]) missingCardFields.push(`creditCardHolderInfo.${f}`);
      });

      if (!remoteIp) missingCardFields.push("remoteIp");

      if (missingCardFields.length > 0) {
        console.log("❌ Campos de cartão de crédito faltando:", missingCardFields);
        return res.status(400).json({
          error: "Dados do cartão ou IP ausentes",
          missingFields: missingCardFields,
        });
      }

      payload.creditCard = creditCard;
      payload.creditCardHolderInfo = creditCardHolderInfo;
      payload.remoteIp = remoteIp;
    }

    // =========================
    // 5️⃣ Cria assinatura
    // =========================
    const subscription = await createSubscription(payload);
    let qrCode = null;
    let pixCode = null;

    if (billingType === "PIX") {
      const payments = await getSubscriptionPayments(subscription.id);
      console.log("💳 Pagamentos da assinatura:", payments);

      const pixPayment = payments.data.find(p => p.billingType === "PIX");
      console.log("💳 Pagamento PIX encontrado:", pixPayment);

      qrCode = pixPayment?.invoiceUrl || null;
      pixCode = `Link de pagamento: ${pixPayment?.invoiceUrl}`;
      console.log("💳 QR Code:", qrCode);
      console.log("💳 Código PIX:", pixCode);
      await updateUser(userId, { pixQrCode: qrCode });
    }

    await updateUser(userId, {
      subscriptionId: subscription.id,
      planId,
      planStatus: billingType === "PIX" ? "pending" : "active",
    });

    return res.json({
      success: true,
      subscription,
      qrCode,
      pixCode,
    });
  } catch (err) {
    console.error("❌ CREATE SUBSCRIPTION:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Erro ao criar assinatura",
    });
  }
}
