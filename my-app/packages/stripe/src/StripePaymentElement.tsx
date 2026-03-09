import { useMemo, useState, type FormEvent } from "react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

interface StripePaymentElementProps {
  publishableKey: string;
  clientSecret: string;
  onSuccess?: (paymentIntentId: string) => void;
  onError?: (errorMessage: string) => void;
  buttonLabel?: string;
}

function CheckoutForm({ clientSecret, onSuccess, onError, buttonLabel }: Omit<StripePaymentElementProps, "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const card = elements.getElement(CardElement);
    if (!card) {
      setErrorMessage("Card input is not available.");
      setIsSubmitting(false);
      return;
    }

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card
      }
    });

    if (result.error) {
      const message = result.error.message ?? "Payment failed.";
      setErrorMessage(message);
      onError?.(message);
      setIsSubmitting(false);
      return;
    }

    if (result.paymentIntent) {
      onSuccess?.(result.paymentIntent.id);
    }

    setIsSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <CardElement options={{ hidePostalCode: true }} />
      </div>
      <button type="submit" disabled={!stripe || isSubmitting} style={{ padding: "10px 12px", borderRadius: 8 }}>
        {isSubmitting ? "Processing..." : buttonLabel ?? "Pay now"}
      </button>
      {errorMessage ? <p style={{ color: "#b91c1c", margin: 0 }}>{errorMessage}</p> : null}
    </form>
  );
}

export function StripePaymentElement(props: StripePaymentElementProps) {
  const { publishableKey, clientSecret, ...checkoutProps } = props;
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm clientSecret={clientSecret} {...checkoutProps} />
    </Elements>
  );
}
