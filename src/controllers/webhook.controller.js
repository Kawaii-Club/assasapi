// import { updateUserByCustomerId, getUserByCustomerId } from "../services/user.service.js";
// import admin from "firebase-admin";

// const db = admin.firestore();

// async function downgradeToBasic(customerId) {
//   await updateUserByCustomerId(customerId, {
//     planId: "nobreza",
//     nextPlanId: null,
//     planStatus: "active",
//     subscriptionId: null,
//     planStartedAt: null,
//     planExpiresAt: null,
//   });

//   console.log("👑 Usuário voltou para plano Nobreza:", customerId);
// }

// export async function asaasWebhook(req, res) {
//   try {

//     console.log("TOKEN DO RENDER:", process.env.ASAAS_WEBHOOK_TOKEN);

//     // ==============================
//     // 1️⃣ Validação de segurança
//     // ==============================

//     if (req.headers["asaas-access-token"] !== process.env.ASAAS_WEBHOOK_TOKEN) {
//       console.log("⛔ Token inválido");
//       return res.status(401).json({ error: "Invalid webhook" });
//     }

//     const { event, payment, subscription } = req.body;

//     console.log("🔥 EVENTO RECEBIDO:", event);

//     // ==============================
//     // 2️⃣ EVENTOS DE ASSINATURA
//     // ==============================

//     if (event?.startsWith("SUBSCRIPTION_")) {

//       if (!subscription?.customer) {
//         return res.status(200).json({ ignored: true });
//       }

//       const user = await getUserByCustomerId(subscription.customer);
//       if (!user) return res.status(200).json({ ignored: true });

//       const subscriptionRef = db.collection("subscriptions").doc(subscription.id);

//       await subscriptionRef.set({
//         userId: user.id,
//         customerId: subscription.customer,
//         subscriptionId: subscription.id,
//         status: subscription.status || null,
//         value: subscription.value || null,
//         billingType: subscription.billingType || null,
//         cycle: subscription.cycle || null,
//         nextDueDate: subscription.nextDueDate || null,
//         description: subscription.description || null,
//         updatedAt: new Date(),
//       }, { merge: true });

//       if (event === "SUBSCRIPTION_CREATED") {

//         await updateUserByCustomerId(subscription.customer, {
//           subscriptionId: subscription.id,
//           planStatus: "pending",
//           subscriptionCreatedAt: new Date(),
//         });

//         console.log("🆕 Assinatura criada:", user.id);
//       }

//       if (event === "SUBSCRIPTION_UPDATED") {
//         console.log("♻️ Assinatura atualizada:", subscription.id);
//       }

//       if (event === "SUBSCRIPTION_DELETED") {

//         await downgradeToBasic(subscription.customer);

//         console.log("❌ Assinatura cancelada:", user.id);
//       }

//       return res.status(200).json({ received: true });
//     }

//     // ==============================
//     // 3️⃣ EVENTOS DE PAGAMENTO
//     // ==============================

//     if (!payment?.customer || !payment?.id) {
//       return res.status(200).json({ ignored: true });
//     }

//     const customerId = payment.customer;

//     const user = await getUserByCustomerId(customerId);
//     if (!user) return res.status(200).json({ ignored: true });

//     // ==============================
//     // CRIAR SUBSCRIPTION AUTOMÁTICA
//     // (caso webhook de subscription não chegue)
//     // ==============================

//     if (payment.subscription) {

//       const subscriptionRef = db
//         .collection("subscriptions")
//         .doc(payment.subscription);

//       await subscriptionRef.set({
//         userId: user.id,
//         customerId: payment.customer,
//         subscriptionId: payment.subscription,
//         billingType: payment.billingType || null,
//         status: payment.status || "pending",
//         createdAt: admin.firestore.FieldValue.serverTimestamp(),
//         updatedAt: new Date()
//       }, { merge: true });

//       console.log("📦 Subscription registrada via payment:", payment.subscription);
//     }

//     // ==============================
//     // ALERTA DE VENCIMENTO
//     // ==============================

//     if (event === "PAYMENT_DUE_DATE_WARNING") {

//       if (!user?.fcmToken) return res.status(200).json({ ignored: true });

//       await admin.messaging().send({
//         token: user.fcmToken,
//         notification: {
//           title: "Fatura prestes a vencer",
//           body: `Sua fatura vence em ${payment.dueDate}`,
//         },
//         data: {
//           type: "payment_due",
//           paymentId: payment.id,
//           invoiceUrl: payment.invoiceUrl || "",
//         },
//       });

//       console.log("🔔 Notificação de vencimento enviada");
//     }

//     // ==============================
//     // SALVAR ORDER (PIX / BOLETO / CARTÃO)
//     // ==============================

//     const orderRef = db.collection("orders").doc(payment.id);

//     const orderSnapshot = await orderRef.get();
//     const isNewOrder = !orderSnapshot.exists;

//     await orderRef.set({
//       userId: user.id,
//       customerId: payment.customer,
//       subscriptionId: payment.subscription || null,
//       paymentId: payment.id,
//       billingType: payment.billingType,
//       value: payment.value,
//       status: payment.status,
//       dueDate: payment.dueDate,
//       checkoutUrl: payment.invoiceUrl || null,
//       pixCode: payment.pixQrCode || null,
//       paidAt: payment.paymentDate || null,
//       updatedAt: new Date(),
//       ...(isNewOrder && {
//         createdAt: admin.firestore.FieldValue.serverTimestamp(),
//       }),
//     }, { merge: true });

//     console.log("💾 Pedido salvo/atualizado:", payment.id);

//     // ==============================
//     // CONTROLE DE STATUS DO PLANO
//     // ==============================

//     if (event === "PAYMENT_CREATED") {
//       console.log("🧾 Pagamento criado:", payment.id);
//     }

//     if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {

//       const newPlan = user?.nextPlanId || user?.planId;

//       await updateUserByCustomerId(customerId, {
//         planId: newPlan,
//         nextPlanId: null,
//         planStatus: "active",
//         subscriptionId: payment.subscription || null,
//         planStartedAt: new Date(payment.paymentDate),
//         planExpiresAt: new Date(payment.dueDate),
//         lastPaymentAt: new Date(payment.paymentDate),
//       });

//       if (user?.fcmToken) {
//         await admin.messaging().send({
//           token: user.fcmToken,
//           notification: {
//             title: "Pagamento confirmado",
//             body: `Seu plano ${newPlan} foi ativado com sucesso 🎉`,
//           }
//         });
//       }

//       console.log("✅ Plano atualizado para:", newPlan);
//     }

//     if (event === "PAYMENT_OVERDUE" ||
//       event === "SUBSCRIPTION_DELETED" ||
//       event === "SUBSCRIPTION_INACTIVATED") {

//       await downgradeToBasic(customerId);

//       if (user?.fcmToken) {
//         await admin.messaging().send({
//           token: user.fcmToken,
//           notification: {
//             title: "Pagamento em atraso",
//             body: "Seu plano voltou para o plano básico",
//           }
//         });
//       }

//       console.log("⛔ Plano expirado:", user.id);
//     }

//     if (event === "PAYMENT_DELETED") {

//       await updateUserByCustomerId(customerId, {
//         planStatus: "canceled",
//       });

//       console.log("❌ Pagamento deletado:", user.id);
//     }

//     return res.status(200).json({ received: true });

//   } catch (err) {

//     console.error("❌ WEBHOOK ERROR:", err);

//     return res.status(500).json({ error: "Webhook error" });
//   }
// }