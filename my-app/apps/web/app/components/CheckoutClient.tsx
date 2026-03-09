"use client";

import { useEffect, useState } from "react";
import { StripePaymentElement } from "@my-app/stripe";
import type { PaymentIntentResponse } from "@my-app/types";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export function CheckoutClient() {
  const [clientSecret, setClientSecret] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    async function createIntent() {
      const response = await fetch(`${apiBaseUrl}/api/create-payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1999, currency: "usd" })
      });

      if (!response.ok) {
        setMessage("Failed to initialize payment intent.");
        return;
      }

      const data = (await response.json()) as PaymentIntentResponse;
      setClientSecret(data.clientSecret);
    }

    if (publishableKey) {
      createIntent().catch(() => {
        setMessage("Failed to initialize payment intent.");
      });
    }
  }, []);

  if (!publishableKey) {
    return <p>Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.</p>;
  }

  if (message) {
    return <p>{message}</p>;
  }

  if (!clientSecret) {
    return <p>Preparing secure checkout...</p>;
  }

  return (
    <StripePaymentElement
      publishableKey={publishableKey}
      clientSecret={clientSecret}
      onSuccess={(id) => setMessage(`Payment succeeded: ${id}`)}
      onError={(error) => setMessage(error)}
      buttonLabel="Pay from Web"
    />
  );
}
