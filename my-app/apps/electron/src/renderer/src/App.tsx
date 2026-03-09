import { useEffect, useState } from "react";
import { StripePaymentElement } from "@my-app/stripe";
import type { PaymentIntentResponse } from "@my-app/types";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const publishableKey = import.meta.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export function App() {
  const [clientSecret, setClientSecret] = useState("");
  const [message, setMessage] = useState("");

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

  return (
    <main className="container">
      <h1>Electron Checkout</h1>
      <p>
        Shared Stripe UI comes from <code>@my-app/stripe</code>.
      </p>

      {!publishableKey ? <p>Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.</p> : null}
      {message ? <p>{message}</p> : null}

      {publishableKey && !message && clientSecret ? (
        <StripePaymentElement
          publishableKey={publishableKey}
          clientSecret={clientSecret}
          onSuccess={(id) => setMessage(`Payment succeeded: ${id}`)}
          onError={(error) => setMessage(error)}
          buttonLabel="Pay from Desktop"
        />
      ) : null}

      {publishableKey && !message && !clientSecret ? <p>Preparing secure checkout...</p> : null}
    </main>
  );
}
