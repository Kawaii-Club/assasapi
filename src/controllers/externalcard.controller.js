import axios from "axios";
import dotenv from "dotenv";

dotenv.config(); 

const ASAAS_API_URL = process.env.ASAAS_API_URL;
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

if (!ASAAS_API_URL || !ASAAS_API_KEY) {
  throw new Error("ASAAS_API_URL ou ASAAS_API_KEY não definidos");
}

export async function createExternalCardSubscription({
  customerId,
  userId,
  planId,
  value,
  cycle,
}) {
  const response = await axios.post(
    `${ASAAS_API_URL}/paymentLinks`,
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
        access_token: ASAAS_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}
