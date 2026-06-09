# Admin Dashboard

Open the production dashboard at:

```text
https://vivid-lingua.vercel.app/admin
```

## Admin login

The dashboard uses Firebase Authentication. The current admin allowlist is:

```text
hanaa5qn@gmail.com
```

Create a Firebase Authentication user with that email and a password, then use
those credentials on `/admin`.

If you want a different admin email, update both places:

- `frontend/src/AdminDashboard.tsx` → `ADMIN_EMAILS`
- `firestore.rules` → `isAdmin()`

Then redeploy Firestore rules and Vercel.

## Revenue data

Customer counts and activity metrics come from Firestore `users/{uid}` profile
documents.

Revenue cards read paid records from the Firestore `payments` collection. Until
Stripe or manual payment records are added, revenue will correctly show `$0`.
A payment document can use this shape:

```json
{
  "amountCents": 2900,
  "currency": "USD",
  "status": "paid",
  "customerEmail": "student@example.com",
  "plan": "Monthly",
  "createdAt": "2026-06-09T00:00:00.000Z"
}
```

MRR and paid-customer cards can also read optional billing fields stored on each
user profile:

```json
{
  "billing": {
    "plan": "Monthly",
    "status": "active",
    "monthlyAmountCents": 2900,
    "lifetimeValueCents": 8700,
    "currency": "USD"
  }
}
```
