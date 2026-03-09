import { CheckoutClient } from "./components/CheckoutClient";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px", fontFamily: "sans-serif" }}>
      <h1>Web Checkout</h1>
      <p>This payment form is shared from <code>@my-app/stripe</code>.</p>
      <CheckoutClient />
    </main>
  );
}
