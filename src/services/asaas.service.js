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

export async function updateSubscriptionAsaas(id, data) {
  const asaas = getAsaasClient();
  const res = await asaas.put(`/subscriptions/${id}`, data);
  return res.data;
}

export async function deleteSubscriptionAsaas(id) {
  const asaas = getAsaasClient();
  const res = await asaas.delete(`/subscriptions/${id}`);
  return res.data;
}

export async function getSubscriptionPayments(id) {
  const asaas = getAsaasClient();
  const res = await asaas.get(`/subscriptions/${id}/payments`);
  return res.data;
}