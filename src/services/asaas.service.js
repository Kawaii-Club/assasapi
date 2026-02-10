import { getAsaasClient } from "../config/asaas.js";
export async function createSubscription(data) {
  const asaas = getAsaasClient(); 
  const response = await asaas.post("/subscriptions", data);
  return response.data;
}
export async function createCustomer(data) {
  const asaas = getAsaasClient();
  const response = await asaas.post("/customers", data);
  return response.data;
}

export async function getSubscription(subscriptionId) {
  const asaas = getAsaasClient();
  const response = await asaas.get(`/subscriptions/${subscriptionId}`);
  return response.data;
}

export async function cancelSubscription(subscriptionId) {
  const asaas = getAsaasClient();
  const response = await asaas.delete(`/subscriptions/${subscriptionId}`);
  return response.data;
}

export async function getSubscriptionPayments(subscriptionId) {
  const asaas = getAsaasClient();
  const response = await asaas.get(`/subscriptions/${subscriptionId}/payments`);
  return response.data; 
}