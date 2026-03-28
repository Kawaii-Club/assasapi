import { getAsaasClient } from "../config/asaas.js";

export async function createSubscription(data) {
  const asaas = getAsaasClient();
  const res = await asaas.post("/subscriptions", data);
  return res.data;
}

export async function createCustomer(data) {
  const asaas = getAsaasClient();
  const res = await asaas.post("/customers", data);
  return res.data;
}

export async function getSubscriptionPayments(subscriptionId) {
  const asaas = getAsaasClient();
  const res = await asaas.get(`/subscriptions/${subscriptionId}/payments`);
  return res.data;
}