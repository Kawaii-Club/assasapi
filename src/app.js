import express from "express";
import cors from "cors";
import paymentsRoutes from "./routes/payment.routes.js";
const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

app.use("/api/payments", paymentsRoutes);

export default app;
