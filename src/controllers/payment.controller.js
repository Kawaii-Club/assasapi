// import { getUser, updateUser } from "../services/user.service.js";
// import {
//   createSubscription,
//   createCustomer,
//   getSubscriptionPayments,
// } from "../services/asaas.service.js";
// import { todayPlus } from "../utils/date.js";

// export async function createSubscriptionController(req, res) {
//   try {
//     const {
//       userId,
//       planId,
//       value,
//       cycle,
//       billingType,
//       creditCard,
//       creditCardHolderInfo,
//       remoteIp,
//     } = req.body;

//     // =========================
//     // 1️⃣ Validação
//     // =========================
//     if (!userId || !planId || value == null || !cycle || !billingType) {
//       return res.status(400).json({ error: "Campos obrigatórios faltando" });
//     }

//     // =========================
//     // 2️⃣ Usuário
//     // =========================
//     const user = await getUser(userId);
//     if (!user) {
//       return res.status(404).json({ error: "Usuário não encontrado" });
//     }

//     let customerId = user.customerId;

//     // =========================
//     // 3️⃣ Criar customer
//     // =========================
//     if (!customerId) {
//       const name = user.name || creditCardHolderInfo?.name;
//       const cpfCnpj = user.cpf || creditCardHolderInfo?.cpfCnpj;
//       const email = user.email || creditCardHolderInfo?.email;

//       if (!name || !cpfCnpj) {
//         return res.status(400).json({
//           error: "Usuário sem nome ou CPF para criar customer",
//         });
//       }

//       const customer = await createCustomer({
//         name,
//         cpfCnpj,
//         email,
//         externalReference: userId,
//       });

//       customerId = customer.id;
//       await updateUser(userId, { customerId });
//     }

//     // =========================
//     // 4️⃣ Assinatura
//     // =========================
//     const nextDueDate =
//       cycle === "YEARLY" ? todayPlus(365) : todayPlus(30);

//     const payload = {
//       customer: customerId,
//       billingType,
//       value,
//       cycle,
//       nextDueDate,
//       description: `Plano ${planId}`,
//       externalReference: userId,
//     };

//     if (billingType === "CREDIT_CARD") {
//       payload.creditCard = creditCard;
//       payload.creditCardHolderInfo = creditCardHolderInfo;
//       payload.remoteIp = remoteIp;
//     }

//     console.log("📤 Payload Asaas:", payload);

//     const subscription = await createSubscription(payload);

//     // =========================
//     // 5️⃣ PIX
//     // =========================
//     let pix = null;

//     if (billingType === "PIX") {
//       const payments = await getSubscriptionPayments(subscription.id);

//       console.log("💰 Payments Asaas:", payments.data);

//       const payment = payments.data?.[0]; // sempre vem 1

//       if (payment) {
//         pix = {
//           paymentId: payment.id,
//           invoiceUrl: payment.invoiceUrl, // 🔗 link do PIX
//           qrCode: payment.pixTransaction?.qrCode || null,
//           payload: payment.pixTransaction?.payload || null,
//           status: payment.status,
//         };
//       }
//     }

//     // =========================
//     // 6️⃣ Atualiza usuário
//     // =========================
//     await updateUser(userId, {
//       subscriptionId: subscription.id,
//       planId,
//       planStatus: billingType === "PIX" ? "pending" : "active",
//     });

//     // =========================
//     // 7️⃣ Response
//     // =========================
//     return res.status(201).json({
//       success: true,
//       subscriptionId: subscription.id,
//       status: subscription.status,
//       pix,
//     });
//   } catch (err) {
//     console.error("❌ CREATE SUBSCRIPTION:", err.response?.data || err.message);
//     return res.status(500).json({
//       error: "Erro ao criar assinatura",
//       details: err.response?.data || err.message,
//     });
//   }
// }


import {
  createSubscription,
  createCustomer,
  getSubscriptionPayments,
} from "../services/asaas.service.js";
import { todayPlus } from "../utils/date.js";
import { createExternalCardSubscription } from "./externalcard.controller.js";

export async function createSubscriptionController(req, res) {
  try {
    const {
      userId,
      planId,
      value,
      cycle,
      billingType, // PIX | CREDIT_CARD | CREDIT_CARD_EXTERNAL
      creditCard,
      creditCardHolderInfo,
      remoteIp,
    } = req.body;

    // =========================
    // 1️⃣ Validação
    // =========================
    if (!userId || !planId || value == null || !cycle || !billingType) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    // =========================
    // 2️⃣ Usuário
    // =========================
    const user = await getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    let customerId = user.customerId;

    // =========================
    // 3️⃣ Customer
    // =========================
    if (!customerId) {
      const name = user.name || creditCardHolderInfo?.name;
      const cpfCnpj = user.cpf || creditCardHolderInfo?.cpfCnpj;
      const email = user.email || creditCardHolderInfo?.email;

      if (!name || !cpfCnpj) {
        return res.status(400).json({
          error: "Usuário sem nome ou CPF para criar customer",
        });
      }

      const customer = await createCustomer({
        name,
        cpfCnpj,
        email,
        externalReference: userId,
      });

      customerId = customer.id;
      await updateUser(userId, { customerId });
    }

    // =====================================================
    // 🔥 CARTÃO EXTERNO (CHECKOUT ASAAS)
    // =====================================================
    if (billingType === "CREDIT_CARD_EXTERNAL") {
      const paymentLink = await createExternalCardSubscription({
        customerId,
        userId,
        planId,
        value,
        cycle,
      });

      await updateUser(userId, {
        planId,
        planStatus: "pending",
        paymentLinkId: paymentLink.id,
      });

      return res.status(201).json({
        success: true,
        checkoutUrl: paymentLink.url, // 🔗 ABRE NO FLUTTER
        customerId,
      });
    }

    // =====================================================
    // PIX ou CARTÃO INTERNO
    // =====================================================
    const nextDueDate =
      cycle === "YEARLY" ? todayPlus(365) : todayPlus(30);

    const payload = {
      customer: customerId,
      billingType,
      value,
      cycle,
      nextDueDate,
      description: `Plano ${planId}`,
      externalReference: userId,
    };

    if (billingType === "CREDIT_CARD") {
      payload.creditCard = creditCard;
      payload.creditCardHolderInfo = creditCardHolderInfo;
      payload.remoteIp = remoteIp;
    }

    const subscription = await createSubscription(payload);

    let pix = null;

    if (billingType === "PIX") {
      const payments = await getSubscriptionPayments(subscription.id);
      const payment = payments.data?.[0];

      if (payment) {
        pix = {
          paymentId: payment.id,
          invoiceUrl: payment.invoiceUrl,
          qrCode: payment.pixTransaction?.qrCode || null,
          payload: payment.pixTransaction?.payload || null,
          status: payment.status,
        };
      }
    }

    await updateUser(userId, {
      subscriptionId: subscription.id,
      planId,
      planStatus: billingType === "PIX" ? "pending" : "active",
    });

    return res.status(201).json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      pix,
    });
  } catch (err) {
    console.error("❌ CREATE SUBSCRIPTION:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Erro ao criar assinatura",
      details: err.response?.data || err.message,
    });
  }
}
