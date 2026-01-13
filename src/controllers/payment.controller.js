import {
  createCustomer,
  createPayment,
  payWithCreditCard,
  getPayment,
  getPixQrCode,
} from "../services/asaas.service.js";


/* ============================
   CREATE PAYMENT
============================ */
export async function createPaymentController(req, res) {
  try {
    const {
      billingType,
      customerData,
      description,
      value,
      creditCard,
      creditCardHolderInfo,
    } = req.body;

    const numericValue = Number(value);
    if (isNaN(numericValue)) {
      return res.status(400).json({ error: "Valor inválido" });
    }

    const customerId = await createCustomer(customerData);

    const payment = await createPayment({
      billingType,
      customerId,
      description,
      value: numericValue,
    });

    // CARTÃO
    if (billingType === "CREDIT_CARD") {
      const result = await payWithCreditCard(payment.id, {
        creditCard,
        creditCardHolderInfo,
      });

      return res.json({
        success: true,
        paymentId: payment.id,
        status: result.status,
      });
    }

// PIX
if (billingType === "PIX") {
  const pix = await getPixQrCode(payment.id);

  return res.json({
    success: true,
    paymentId: payment.id,
    status: payment.status,
    pixQrCode: pix.payload,
    pixImage: pix.encodedImage,
  });
}


    res.status(400).json({ error: "Tipo de pagamento inválido" });
  } catch (err) {
    console.error("❌ CREATE PAYMENT:", err.response?.data || err.message);
    res.status(500).json({ error: "Erro ao criar pagamento" });
  }
}

/* ============================
   CONFIRM PAYMENT
============================ */
export async function confirmPaymentController(req, res) {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId obrigatório" });
    }

    const payment = await getPayment(paymentId);

    if (!["CONFIRMED", "RECEIVED"].includes(payment.status)) {
      return res.json({
        status: "pending",
        paymentStatus: payment.status,
      });
    }

    res.json({
      status: "success",
      paymentStatus: payment.status,
    });
  } catch (err) {
    console.error("❌ CONFIRM PAYMENT:", err.message);
    res.status(500).json({ error: "Erro ao confirmar pagamento" });
  }
}
