// import { getUser, updateUser } from "../services/user.service.js";
// import {
//   createSubscription,
//   createCustomer,
//   getSubscriptionPayments,
// } from "../services/asaas.service.js";
// import { todayPlus } from "../utils/date.js";

// export async function createSubscriptionController(req, res) {
//   try {
//     const { userId, planId, value, cycle, billingType } = req.body;

//     // ================= VALIDAR REQUEST =================
//     const missingFields = [];

//     if (!userId) missingFields.push("userId");
//     if (!planId) missingFields.push("planId");
//     if (value === undefined || value === null) missingFields.push("value");
//     if (!cycle) missingFields.push("cycle");
//     if (!billingType) missingFields.push("billingType");

//     if (missingFields.length > 0) {
//       return res.status(400).json({
//         success: false,
//         error: "Campos obrigatórios faltando",
//         missingFields,
//       });
//     }

//     if (typeof value !== "number" || value <= 0) {
//       return res.status(400).json({
//         success: false,
//         error: "Valor inválido",
//       });
//     }

//     if (!["MONTHLY", "YEARLY"].includes(cycle)) {
//       return res.status(400).json({
//         success: false,
//         error: "Ciclo inválido",
//       });
//     }

//     if (!["PIX", "BOLETO", "CREDIT_CARD"].includes(billingType)) {
//       return res.status(400).json({
//         success: false,
//         error: "Tipo de pagamento inválido",
//       });
//     }

//     // ================= BUSCAR USUÁRIO =================
//     let user;

//     try {
//       user = await getUser(userId);
//     } catch (err) {
//       console.error("❌ ERRO AO BUSCAR USER:", err);
//       return res.status(500).json({
//         success: false,
//         error: "Erro ao buscar usuário",
//       });
//     }

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         error: "Usuário não encontrado",
//       });
//     }

//     if (!user.email || !user.cpf) {
//       return res.status(400).json({
//         success: false,
//         error: "Usuário sem email ou CPF",
//       });
//     }

//     // ================= CHECAR ASSINATURA ATIVA =================
//     if (user.subscriptionId && user.planStatus === "active") {

//       const payload = {
//         value,
//         cycle,
//         billingType,
//         description: `Plano ${planId}`,
//         updatePendingPayments: true
//       };

//       const updatedSubscription = await updateSubscription(
//         user.subscriptionId,
//         payload
//       );

//       await updateUser(userId, {
//         nextPlanId: planId
//       });

//       return res.json({
//         success: true,
//         message: "Assinatura atualizada",
//         subscriptionId: updatedSubscription.id
//       });
//     }
//     // ================= CRIAR CUSTOMER SE NÃO EXISTIR =================
//     try {
//       if (!user.customerId) {
//         const customer = await createCustomer({
//           name: user.name,
//           email: user.email,
//           cpfCnpj: user.cpf,
//           phone: user.phone,
//           externalReference: userId,
//         });

//         if (!customer?.id) {
//           throw new Error("Asaas não retornou customerId");
//         }

//         await updateUser(userId, { customerId: customer.id });
//         user.customerId = customer.id;

//         console.log("💳 Novo customer criado:", customer.id);
//       }
//     } catch (err) {
//       console.error("❌ ERRO AO CRIAR CUSTOMER:", err.response?.data || err);

//       return res.status(500).json({
//         success: false,
//         error: "Erro ao criar cliente no Asaas",
//       });
//     }

//     // ================= CRIAR ASSINATURA =================
//     let subscription;

//     try {
//       const nextDueDate =
//         cycle === "YEARLY" ? todayPlus(365) : todayPlus(30);

//       const payload = {
//         customer: user.customerId,
//         billingType,
//         value,
//         cycle,
//         nextDueDate,
//         description: `Plano ${planId}`,
//         externalReference: userId,
//       };

//       subscription = await createSubscription(payload);

//       if (!subscription?.id) {
//         throw new Error("Asaas não retornou subscriptionId");
//       }

//       console.log("✅ SUBSCRIPTION:", subscription.id);
//     } catch (err) {
//       console.error("❌ ERRO AO CRIAR SUBSCRIPTION:", err.response?.data || err);

//       return res.status(500).json({
//         success: false,
//         error: "Erro ao criar assinatura no Asaas",
//       });
//     }

//     // ================= PEGAR LINK DE PAGAMENTO =================
//     let checkoutUrl = null;
//     let pixCode = null;

//     try {
//       await new Promise(resolve => setTimeout(resolve, 1500));

//       const payments = await getSubscriptionPayments(subscription.id);

//       console.log("💰 PAYMENTS:", payments?.data);

//       if (payments?.data?.length > 0) {
//         const payment = payments.data[0];

//         checkoutUrl = payment?.invoiceUrl || null;
//         pixCode = payment?.pixQrCode || null;
//       }

//       if (!checkoutUrl) {
//         console.warn("⚠️ Nenhum invoiceUrl encontrado");
//       }

//     } catch (err) {
//       console.error("⚠️ ERRO AO BUSCAR PAYMENT:", err.response?.data || err);
//     }

//     // ================= ATUALIZA USER (SEM MUDAR PLANO AINDA) =================
//     try {
//       await updateUser(userId, {
//         subscriptionId: subscription.id,
//         subscriptionCreatedAt: new Date(),

//         // 👇 novo campo
//         nextPlanId: planId,

//         // plano atual permanece
//         planStatus: "pending_payment",
//       });

//     } catch (err) {
//       console.error("⚠️ ERRO AO ATUALIZAR USER:", err);
//     }

//     // ================= RESPONSE =================
//     return res.json({
//       success: true,
//       subscriptionId: subscription.id,
//       customerId: user.customerId,
//       planId,
//       status: "pending_payment",
//       checkoutUrl,
//       pixCode,
//     });

//   } catch (err) {

//     console.error("💥 ERRO FATAL:", err.response?.data || err.message);

//     return res.status(500).json({
//       success: false,
//       error: "Erro interno inesperado",
//     });
//   }
// }

// export async function updateSubscription(subscriptionId, payload) {
//   const response = await axios.put(
//     `https://api-sandbox.asaas.com/v3/subscriptions/${subscriptionId}`,
//     payload,
//     {
//       headers: {
//         access_token: process.env.ASAAS_API_KEY,
//         "Content-Type": "application/json",
//       },
//     }
//   );

//   return response.data;
// }

import axios from "axios";
import { getUser, updateUser } from "../services/user.service.js";
import {
  createSubscription,
  createCustomer,
  getSubscriptionPayments,
} from "../services/asaas.service.js";
import { todayPlus } from "../utils/date.js";

export async function createSubscriptionController(req, res) {
  try {
    const { userId, planId, value, cycle, billingType } = req.body;

    // ================= VALIDAR REQUEST =================
    const missingFields = [];

    if (!userId) missingFields.push("userId");
    if (!planId) missingFields.push("planId");
    if (value === undefined || value === null) missingFields.push("value");
    if (!cycle) missingFields.push("cycle");
    if (!billingType) missingFields.push("billingType");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Campos obrigatórios faltando",
        missingFields,
      });
    }

    if (typeof value !== "number" || value <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valor inválido",
      });
    }

    if (!["MONTHLY", "YEARLY"].includes(cycle)) {
      return res.status(400).json({
        success: false,
        error: "Ciclo inválido",
      });
    }

    if (!["PIX", "BOLETO", "CREDIT_CARD"].includes(billingType)) {
      return res.status(400).json({
        success: false,
        error: "Tipo de pagamento inválido",
      });
    }

    // ================= BUSCAR USUÁRIO =================
    let user;

    try {
      user = await getUser(userId);
    } catch (err) {
      console.error("❌ ERRO AO BUSCAR USER:", err);
      return res.status(500).json({
        success: false,
        error: "Erro ao buscar usuário",
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Usuário não encontrado",
      });
    }

    if (!user.email || !user.cpf) {
      return res.status(400).json({
        success: false,
        error: "Usuário sem email ou CPF",
      });
    }

    // =========================================================
    // CASO 1 — USUÁRIO JÁ POSSUI ASSINATURA (UPGRADE/DOWNGRADE)
    // =========================================================
    if (user.subscriptionId && user.planStatus === "active") {

      try {

        const isDowngrade =
          user.planPrice && value < user.planPrice;

        // ================= DOWNGRADE (próximo ciclo) =================
        if (isDowngrade) {

          await updateUser(userId, {
            nextPlanId: planId
          });

          return res.json({
            success: true,
            message: "Downgrade programado para o próximo ciclo"
          });

        }

        // ================= UPGRADE (imediato) =================

        const payload = {
          value,
          cycle,
          billingType,
          nextDueDate: todayPlus(0),
          description: `Plano ${planId}`,
          updatePendingPayments: true
        };

        const updatedSubscription = await updateSubscription(
          user.subscriptionId,
          payload
        );

        // salva plano futuro
        await updateUser(userId, {
          nextPlanId: planId
        });

        // aguarda Asaas gerar cobrança
        await new Promise(resolve => setTimeout(resolve, 1500));

        const payments = await getSubscriptionPayments(user.subscriptionId);

        let checkoutUrl = null;
        let pixCode = null;

        if (payments?.data?.length > 0) {
          const payment = payments.data[0];
          checkoutUrl = payment?.invoiceUrl || null;
          pixCode = payment?.pixQrCode || null;
        }

        return res.json({
          success: true,
          message: "Upgrade iniciado",
          subscriptionId: updatedSubscription.id,
          checkoutUrl,
          pixCode
        });

      } catch (err) {

        console.warn("⚠️ erro ao atualizar subscription:", err.response?.data || err);

        // fallback criando nova assinatura
        user.subscriptionId = null;
      }
    }

    // =========================================================
    // CASO 2 — CRIAR CUSTOMER SE NÃO EXISTIR
    // =========================================================

    try {
      if (!user.customerId) {

        const customer = await createCustomer({
          name: user.name,
          email: user.email,
          cpfCnpj: user.cpf,
          phone: user.phone,
          externalReference: userId,
        });

        if (!customer?.id) {
          throw new Error("Asaas não retornou customerId");
        }

        await updateUser(userId, { customerId: customer.id });
        user.customerId = customer.id;

        console.log("💳 Novo customer criado:", customer.id);
      }

    } catch (err) {

      console.error("❌ ERRO AO CRIAR CUSTOMER:", err.response?.data || err);

      return res.status(500).json({
        success: false,
        error: "Erro ao criar cliente no Asaas",
      });

    }

    // =========================================================
    // CASO 3 — CRIAR NOVA ASSINATURA
    // =========================================================

    let subscription;

    try {

      const nextDueDate =
        cycle === "YEARLY" ? todayPlus(365) : todayPlus(30);

      const payload = {
        customer: user.customerId,
        billingType,
        value,
        cycle,
        nextDueDate,
        description: `Plano ${planId}`,
        externalReference: userId,
      };

      subscription = await createSubscription(payload);

      if (!subscription?.id) {
        throw new Error("Asaas não retornou subscriptionId");
      }

      console.log("✅ SUBSCRIPTION:", subscription.id);

    } catch (err) {

      console.error("❌ ERRO AO CRIAR SUBSCRIPTION:", err.response?.data || err);

      return res.status(500).json({
        success: false,
        error: "Erro ao criar assinatura no Asaas",
      });

    }

    // =========================================================
    // BUSCAR COBRANÇA GERADA
    // =========================================================

    let checkoutUrl = null;
    let pixCode = null;

    try {

      await new Promise(resolve => setTimeout(resolve, 1500));

      const payments = await getSubscriptionPayments(subscription.id);

      if (payments?.data?.length > 0) {

        const payment = payments.data[0];

        checkoutUrl = payment?.invoiceUrl || null;
        pixCode = payment?.pixQrCode || null;

      }

    } catch (err) {

      console.error("⚠️ ERRO AO BUSCAR PAYMENT:", err.response?.data || err);

    }

    // =========================================================
    // ATUALIZA USER
    // =========================================================

    try {

      await updateUser(userId, {

        subscriptionId: subscription.id,
        subscriptionCreatedAt: new Date(),

        nextPlanId: planId,

        planStatus: "pending_payment",

      });

    } catch (err) {

      console.error("⚠️ ERRO AO ATUALIZAR USER:", err);

    }

    return res.json({
      success: true,
      subscriptionId: subscription.id,
      customerId: user.customerId,
      planId,
      status: "pending_payment",
      checkoutUrl,
      pixCode,
    });

  } catch (err) {

    console.error("💥 ERRO FATAL:", err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      error: "Erro interno inesperado",
    });

  }
}

// =========================================================
// ATUALIZAR SUBSCRIPTION ASAAS
// =========================================================

export async function updateSubscription(subscriptionId, payload) {

  const response = await axios.put(
    `https://api-sandbox.asaas.com/v3/subscriptions/${subscriptionId}`,
    payload,
    {
      headers: {
        access_token: process.env.ASAAS_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;

}

