import { Router } from "express";
import {
  createPaymentController,
  confirmPaymentController,
} from "../controllers/payment.controller.js";

const router = Router();

router.post("/create-payment", createPaymentController);
router.post("/confirm-payment", confirmPaymentController);

export default router;
