import { onCall, HttpsError } from "firebase-functions/v2/https"; // Importação v2
import { getAuth } from "firebase-admin/auth";
import { db, messaging } from "./src/firebase/firebaseAdmin.js";
import { getUser, updateUser } from "./src/services/user.service.js";
import { 
  createSubscription as createAsaasSubscription, 
  createCustomer, 
  getSubscriptionPayments 
} from "./src/services/asaas.service.js";
import { todayPlus } from "./src/utils/date.js";
import { ASAAS_KEY, ASAAS_URL, getAsaasClient } from './src/config/asaas.js';

export const sendNotification = onCall(async (request) => {
  const { token, title, body, payload } = request.data;

  try {
    if (!token || !title || !body) {
      throw new HttpsError("invalid-argument", "Dados incompletos.");
    }

    const message = {
      token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(payload || {}).map(([k, v]) => [k, String(v)])
      ),
    };

    const response = await messaging.send(message);
    console.log("Sucesso no envio:", response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error("ERRO FINAL NOTIFICAÇÃO:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message);
  }
});

export const createSubscription = onCall(
  {
    secrets: [ASAAS_KEY, ASAAS_URL],
    timeoutSeconds: 120,
  },
  async (request) => {

    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated", 
        "O usuário precisa estar autenticado."
      );
    }

    try {
      const currentKey = ASAAS_KEY.value();
      const currentUrl = ASAAS_URL.value();

      const {
        userId,
        planId,
        value,
        cycle,
        billingType,
        creditCard,
        creditCardHolderInfo,
        remoteIp,
      } = request.data;

      if (!userId || !planId || value == null || !cycle || !billingType) {
        throw new HttpsError("invalid-argument", "Dados obrigatórios faltando.");
      }

      const user = await getUser(userId);
      if (!user) {
        throw new HttpsError("not-found", "Usuário não encontrado.");
      }

      if (!user.customerId) {
        const customer = await createCustomer({
          name: user.name,
          email: user.email,
          cpfCnpj: user.cpf,
          phone: user.phone,
          externalReference: userId,
          asaasKey: currentKey,
          asaasUrl: currentUrl,
        });
        await updateUser(userId, { customerId: customer.id });
        user.customerId = customer.id;
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

      if (billingType === "CREDIT_CARD") {
        if (!creditCard || !creditCardHolderInfo || !remoteIp) {
          throw new HttpsError("invalid-argument", "Dados do cartão incompletos.");
        }
        payload.creditCard = creditCard;
        payload.creditCardHolderInfo = creditCardHolderInfo;
        payload.remoteIp = remoteIp;
      }

   
      const subscription = await createAsaasSubscription({ 
        ...payload, 
        asaasKey: currentKey, 
        asaasUrl: currentUrl 
      });

      let qrCode = null;
      let pixCode = null;

      if (billingType === "PIX") {
        const payments = await getSubscriptionPayments(subscription.id, currentKey, currentUrl);
        const pixPayment = payments.data.find(p => p.billingType === "PIX");
        qrCode = pixPayment?.invoiceUrl || null;
        pixCode = `Link: ${pixPayment?.invoiceUrl}`;
        await updateUser(userId, { pixQrCode: qrCode });
      }

      await updateUser(userId, {
        subscriptionId: subscription.id,
        planId,
        planStatus: billingType === "PIX" ? "pending" : "active",
      });

      return { 
        success: true, 
        subscription, 
        qrCode, 
        pixCode 
      };

    } catch (err) {
      console.error("❌ ERRO ASSINATURA:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError(
        "internal", 
        err.response?.data?.errors?.[0]?.description || err.message
      );
    }
  }
);