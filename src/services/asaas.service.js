import { asaas } from "../config/asaas.js";

/* ============================
   CUSTOMER
============================ */
export async function createCustomer({ name, email, cpfCnpj }) {
  const { data } = await asaas.post("/customers", {
    name,
    email,
    cpfCnpj,
  });
  return data.id;
}

/* ============================
   CREATE PAYMENT
============================ */
export async function createPayment({
  billingType,
  customerId,
  description,
  value,
}) {
  const payload = {
    billingType,
    customer: customerId,
    description,
    value: Number(value.toFixed(2)),
    dueDate: new Date(Date.now() + 86400000)
      .toISOString()
      .split("T")[0],
  };

  const { data } = await asaas.post("/payments", payload);
  return data;
}

/* ============================
   CREDIT CARD
============================ */
export async function payWithCreditCard(paymentId, cardData) {
  const { data } = await asaas.post(
    `/payments/${paymentId}/payWithCreditCard`,
    cardData
  );
  return data;
}

/* ============================
   GET PAYMENT
============================ */
export async function getPayment(paymentId) {
  const { data } = await asaas.get(`/payments/${paymentId}`);
  return data;
}
/* ============================
   PIX QR CODE
============================ */
export async function getPixQrCode(paymentId) {
  const { data } = await asaas.get(
    `/payments/${paymentId}/pixQrCode`
  );

  return data;
}
