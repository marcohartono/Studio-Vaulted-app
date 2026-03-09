export interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

export interface CreatePaymentIntentRequest {
  amount?: number;
  currency?: string;
}
