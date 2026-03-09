import "dotenv/config";
import cors from "cors";
import express from "express";
import Stripe from "stripe";
import type { CreatePaymentIntentRequest, PaymentIntentResponse } from "@my-app/types";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/create-payment-intent", async (req, res) => {
  if (!stripe) {
    res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
    return;
  }

  const { amount = 1999, currency = "usd" } = (req.body ?? {}) as CreatePaymentIntentRequest;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true }
    });

    const payload: PaymentIntentResponse = {
      clientSecret: paymentIntent.client_secret ?? "",
      paymentIntentId: paymentIntent.id
    };

    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create payment intent";
    res.status(500).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
