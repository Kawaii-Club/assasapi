import axios from "axios";
import dotenv from "dotenv";

dotenv.config(); // garante que o .env seja carregado

const ASAAS_URL = process.env.ASAAS_API_URL;
const ASAAS_KEY = process.env.ASAAS_API_KEY;

if (!ASAAS_URL || !ASAAS_KEY) {
  throw new Error("ASAAS_URL ou ASAAS_KEY não definidos");
}

export async function createExternalCardSubscription({
  customerId,
  userId,
  planId,
  value,
  cycle,
}) {
  const response = await axios.post(
    `${ASAAS_URL}/paymentLinks`,
    {
      name: `Plano ${planId}`,
      description: `Assinatura ${planId}`,
      billingType: "CREDIT_CARD",
      chargeType: "RECURRENT",
      value,
      cycle,
      customer: customerId,
      externalReference: userId,
    },
    {
      headers: {
        access_token: ASAAS_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}
