# Mongolia Payment Provider Decision

Research date: 2026-06-09

This app currently has the right downstream data model for paid access:

- `payments` collection for revenue records.
- `users/{uid}.billing` for plan/status/MRR fields.
- Express API routes that can host server-side payment creation and webhooks.

There is no Stripe checkout implementation in the current codebase. The safest
shape is therefore:

1. Create a payment invoice from the backend.
2. Redirect or deeplink the user to the provider checkout/QR page.
3. Receive a provider callback/webhook on the backend.
4. Verify the callback signature/checksum.
5. Write a paid record to Firestore and update `users/{uid}.billing`.

## Recommendation

Use **QPay direct** as the first Mongolia payment integration.

QPay is the best default for a Mongolia-first launch because it has the broadest
local coverage and fits the way Mongolian users already pay online: dynamic QR,
deeplink, bank-app payment, card payment, and subscription payment. QPay's site
lists 2.8M+ users, 200K+ merchants, 12 banks, 11 wallets, and 3 international
payment options. Their developer documentation exposes token auth, invoice
creation, QR response data, and callback URLs.

For this app, QPay direct means fewer middle layers and a straightforward backend
flow: `POST /api/payments/qpay/checkout` creates an invoice, and
`POST /api/payments/qpay/webhook` confirms it and updates Firestore.

## Provider Comparison

| Provider | Best fit | Notes |
| --- | --- | --- |
| QPay direct | Default first integration for Mongolia | Broadest QR/bank-app reach; supports dynamic QR, deeplink, card payment, and a subscription product. Requires merchant credentials from QPay. |
| Bonum Gateway | Automatic recurring card billing | Strong if card tokenization and scheduled recurring charges matter more than simplest local QR reach. Public API docs include invoice, card token, webhook, and checksum flows. |
| Byl | Fast hosted checkout for startups | Simple hosted checkout API, webhook, and support for QPay/SocialPay/Pocket/Golomt merchant. Adds a SaaS layer and monthly fee, but likely fastest to ship. |
| Golomt/SocialPay | Secondary method | Popular wallet/bank app, but direct merchant API documentation is less central than QPay/Bonum/Byl for this app's checkout needs. |
| MonPay | Secondary wallet/ecosystem | Has merchant/open API references and meaningful reach, but less compelling as the first single checkout integration unless user demand is specifically MonPay-heavy. |
| Toki Pay | Secondary wallet/ecosystem | Useful local wallet, but public merchant API evidence is weaker for this app than QPay/Bonum/Byl. |

## Subscription Strategy

The subscription price can stay undecided for now. Implementation can still be
designed around a plan object:

```json
{
  "plan": "Monthly",
  "amountMnt": 0,
  "currency": "MNT",
  "interval": "month"
}
```

Recommended rollout:

1. Start with QPay one-time monthly access invoices while pricing is being
   validated.
2. Store paid-through dates in Firestore, for example
   `billing.currentPeriodEnd`.
3. Move to QPay subscription payment or Bonum recurring card billing once price,
   cancellation policy, and user demand are clear.

## Firestore Records

Write a `payments/{paymentId}` document after verified payment:

```json
{
  "provider": "qpay",
  "providerPaymentId": "provider-payment-id",
  "providerInvoiceId": "provider-invoice-id",
  "amountCents": 290000,
  "currency": "MNT",
  "status": "paid",
  "customerEmail": "student@example.com",
  "userId": "firebase-uid",
  "plan": "Monthly",
  "createdAt": "2026-06-09T00:00:00.000Z"
}
```

Update `users/{uid}.billing`:

```json
{
  "plan": "Monthly",
  "status": "active",
  "monthlyAmountCents": 290000,
  "lifetimeValueCents": 290000,
  "currency": "MNT"
}
```

## Required Provider Details Before Coding

For QPay direct:

- Merchant username/client ID.
- Merchant password/client secret.
- `invoice_code` from QPay.
- Production base URL.
- Callback/webhook verification rules.
- Confirmation of whether the launch uses one-off invoices, QPay subscription,
  or card token payment.

For Bonum:

- Merchant access credentials.
- Webhook checksum key.
- Whether recurring card tokenization is approved for this business.

For Byl:

- Project ID.
- Bearer token.
- Webhook signing/verification rules.

## Sources

- QPay: https://qr.qpay.mn/
- QPay API docs: https://developer.qpay.mn/
- QPay subscription: https://qpay.mn/products/subscription
- Bonum Gateway: https://www.bonum.mn/gateway
- Bonum API docs: https://psp.bonum.mn/bonum-gateway-apis.html
- Byl: https://byl.mn/
- Golomt SocialPay: https://www.golomtbank.com/en/socialpay
- MonPay: https://www.monpay.mn/en
