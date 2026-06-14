import type { Express, Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  firebaseAdminMissingMessage,
  getFirebaseAdmin,
  verifyFirebaseBearer,
} from '../lib/firebaseAdmin';
import {
  BylConfigError,
  bylPaymentFromCheckout,
  createBylCheckout,
  getBylCheckout,
  getBylConfigState,
  isBylCheckoutPaid,
  verifyBylWebhookSignature,
  type BylWebhookEvent,
  type PaymentRecord,
} from '../lib/payments/byl';
import {
  getPaidPlans,
  parsePaidPlanId,
  parseBillingInterval,
  placementCreditGrant,
  hasPlacementCredit,
  type BillingInterval,
} from '../lib/plans';

// Per-user checkout rate limit: max 5 invoice creations per hour. Backed by
// Firestore (collection `rateLimits`) so the cap holds across serverless
// instances — an in-memory Map resets on every cold start and counts
// per-instance, letting the limit be exceeded by N× on Vercel/Fluid Compute.
const CHECKOUT_MAX = 5;
const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;

// Atomically increments the caller's hourly counter and reports whether they
// are now over the cap. Fails open: if Firestore is unreachable we let the
// request through rather than block a paying customer over a limiter hiccup.
async function checkoutRateLimited(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const ref = db.collection('rateLimits').doc(`checkout_${uid}`);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const data = snap.data();
      if (!data || now > Number(data.resetTime ?? 0)) {
        tx.set(ref, { count: 1, resetTime: now + CHECKOUT_WINDOW_MS });
        return false;
      }
      const count = Number(data.count ?? 0) + 1;
      tx.set(ref, { count }, { merge: true });
      return count > CHECKOUT_MAX;
    });
  } catch (err) {
    console.warn('checkout rate-limit check failed (fail-open):', err);
    return false;
  }
}

interface PendingInvoice {
  provider: 'byl' | 'dummy';
  providerInvoiceId: string;
  senderInvoiceNo: string;
  userId: string;
  customerEmail: string;
  customerName?: string;
  plan: string;
  interval?: BillingInterval; // older invoices predate annual billing → month
  // 'subscription' (default) renews access; 'placement' is a one-off purchase
  // that unlocks the placement-test result for the user.
  product?: 'subscription' | 'placement';
  amountMnt: number;
  amountCents: number;
  currency: 'MNT';
  status: 'pending' | 'paid' | 'failed';
}

// The dummy provider activates a real subscription with no real payment, so it
// must never be reachable in production. Enabled only when ALLOW_DUMMY_PAYMENTS
// is explicitly set (dev/preview). Unset in prod → endpoints 404.
function dummyPaymentsEnabled(): boolean {
  return process.env.ALLOW_DUMMY_PAYMENTS === '1';
}

// One-off price for revealing the placement test result.
const PLACEMENT_RESULT_PRICE_MNT = 5000;
const PLACEMENT_PLAN_NAME = 'Placement result';

function amountMntToCents(amountMnt: number): number {
  return Math.round(amountMnt * 100);
}

function sanitizeDocId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
}

function senderInvoiceNoFor(uid: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `vl_${Date.now()}_${uid.slice(0, 12)}_${suffix}`.slice(0, 45);
}

function appBaseUrl(req: Request): string {
  const fromEnv = process.env.APP_BASE_URL || process.env.APP_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`;

  const proto = req.headers['x-forwarded-proto']?.toString().split(',')[0] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function publicInvoicePayload(invoice: PendingInvoice, payment?: PaymentRecord | null) {
  return {
    provider: invoice.provider,
    senderInvoiceNo: invoice.senderInvoiceNo,
    providerInvoiceId: invoice.providerInvoiceId,
    status: invoice.status,
    plan: invoice.plan,
    amountMnt: invoice.amountMnt,
    currency: invoice.currency,
    paid: invoice.status === 'paid',
    payment: payment ? {
      paymentId: payment.payment_id,
      paymentStatus: payment.payment_status,
      paymentDate: payment.payment_date,
      paymentAmount: payment.payment_amount,
      transactionType: payment.transaction_type,
    } : null,
  };
}

async function activatePaidInvoice(
  invoiceRef: FirebaseFirestore.DocumentReference,
  invoice: PendingInvoice,
  paidPayment: PaymentRecord,
) {
  const admin = getFirebaseAdmin();
  if (!admin) throw new Error(firebaseAdminMissingMessage());

  const now = new Date();
  const isPlacement = invoice.product === 'placement';
  // Dummy activations grant real access for testing but represent no real
  // money, so they must never feed revenue metrics — even when dev/preview
  // tests hit the same Firestore the prod admin dashboard reads. Keep their
  // revenue contribution at 0 and flag the payment doc as non-revenue.
  const isDummy = invoice.provider === 'dummy';
  const revenueCents = isDummy ? 0 : invoice.amountCents;
  const currentPeriodEnd = addMonths(now, invoice.interval === 'year' ? 12 : 1).toISOString();
  const paymentId = String(paidPayment.payment_id || invoice.providerInvoiceId);
  const paymentRef = admin.db.collection('payments').doc(sanitizeDocId(`${invoice.provider}_${paymentId}`));
  const userRef = admin.db.collection('users').doc(invoice.userId);

  await admin.db.runTransaction(async (tx) => {
    // Idempotency: webhook + frontend poll race on the same paid checkout.
    // Without this read both transactions would re-grant credits / re-inflate
    // lifetime value. Re-reading inside the tx makes activation run once.
    const current = await tx.get(invoiceRef);
    if (current.get('status') === 'paid') return;

    tx.set(paymentRef, {
      provider: invoice.provider,
      providerPaymentId: paymentId,
      providerInvoiceId: invoice.providerInvoiceId,
      senderInvoiceNo: invoice.senderInvoiceNo,
      amountCents: invoice.amountCents,
      amountMnt: invoice.amountMnt,
      currency: invoice.currency,
      status: 'paid',
      customerEmail: invoice.customerEmail,
      userId: invoice.userId,
      plan: invoice.plan,
      product: invoice.product ?? 'subscription',
      revenue: !isDummy,
      createdAt: paidPayment.payment_date || now.toISOString(),
      providerPayment: paidPayment,
    }, { merge: true });

    if (isPlacement) {
      // One-off purchase: unlock the placement result without touching the
      // subscription plan/status. Revenue still counts toward lifetime value.
      tx.set(userRef, {
        placement: { unlocked: true, unlockedBy: invoice.provider },
        billing: {
          lifetimeValueCents: FieldValue.increment(revenueCents),
          currency: invoice.currency,
          provider: invoice.provider,
        },
      }, { merge: true });
    } else {
      tx.set(userRef, {
        // Each subscription purchase includes one free placement-test reveal.
        placementCredits: FieldValue.increment(placementCreditGrant(invoice.product)),
        billing: {
          plan: invoice.plan,
          status: 'active',
          interval: invoice.interval ?? 'month',
          monthlyAmountCents: revenueCents,
          lifetimeValueCents: FieldValue.increment(revenueCents),
          currency: invoice.currency,
          provider: invoice.provider,
          currentPeriodEnd,
        },
      }, { merge: true });
    }

    tx.set(invoiceRef, {
      status: 'paid',
      paidAt: FieldValue.serverTimestamp(),
      paymentId,
      ...(isPlacement ? {} : { currentPeriodEnd }),
      updatedAt: FieldValue.serverTimestamp(),
      providerPayment: paidPayment,
    }, { merge: true });
  });

  if (isPlacement) {
    return {
      plan: invoice.plan,
      status: 'paid',
      currency: invoice.currency,
      provider: invoice.provider,
    };
  }

  return {
    plan: invoice.plan,
    status: 'active',
    interval: invoice.interval ?? 'month',
    monthlyAmountCents: invoice.amountCents,
    currency: invoice.currency,
    provider: invoice.provider,
    currentPeriodEnd,
  };
}

// Asks Byl for the checkout's real status and activates the plan if paid.
// Used by both the polling endpoint and the webhook, so a forged webhook body
// can never activate anything — Byl's API is always the source of truth.
async function checkAndMaybeActivate(invoiceRef: FirebaseFirestore.DocumentReference, invoice: PendingInvoice) {
  const checkout = await getBylCheckout(invoice.providerInvoiceId);
  const paidPayment = isBylCheckoutPaid(checkout) ? bylPaymentFromCheckout(checkout) : null;
  const billing = paidPayment ? await activatePaidInvoice(invoiceRef, invoice, paidPayment) : null;
  const status: PendingInvoice['status'] = paidPayment ? 'paid' : invoice.status;

  return {
    ...publicInvoicePayload({ ...invoice, status }, paidPayment),
    billing,
  };
}

function paymentMethodsPayload() {
  const byl = getBylConfigState();
  const plans = getPaidPlans();
  const adminReady = Boolean(getFirebaseAdmin());
  const bylMissing = [...byl.missing];
  if (!adminReady) bylMissing.push('Firebase Admin credentials');
  const bylReady = bylMissing.length === 0;
  const dummyOn = dummyPaymentsEnabled();

  return {
    primary: bylReady ? 'byl' : (dummyOn ? 'dummy' : 'byl'),
    plans,
    byl: {
      id: 'byl',
      name: 'Byl',
      status: bylReady ? 'ready' : 'needs_config',
      missing: bylMissing,
      supports: ['QPay', 'SocialPay', 'Pocket', 'Golomt merchant'],
      apiBaseUrl: byl.apiBaseUrl,
    },
    dummy: {
      id: 'dummy',
      name: 'Туршилтын төлбөр (симуляци)',
      status: dummyOn ? (adminReady ? 'ready' : 'needs_config') : 'disabled',
      missing: dummyOn && !adminReady ? ['Firebase Admin credentials'] : [],
      supports: ['instant simulated payment for testing'],
    },
    alternatives: [
      {
        id: 'bonum',
        name: 'Bonum Gateway',
        status: 'planned',
        supports: ['Apple Pay', 'Google Pay', 'cards', 'QPay'],
        note: 'Best next option for Apple Pay / Google Pay and card-wallet coverage in Mongolia.',
      },
    ],
  };
}

export function registerPaymentsRoute(app: Express) {
  app.get('/api/payments/methods', (_req, res) => {
    res.json(paymentMethodsPayload());
  });

  app.post('/api/payments/byl/checkout', async (req, res) => {
    const admin = getFirebaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: firebaseAdminMissingMessage(), methods: paymentMethodsPayload() });
    }

    const user = await verifyFirebaseBearer(req);
    if (!user) {
      return res.status(401).json({ error: 'Sign in again before starting payment.' });
    }

    if (await checkoutRateLimited(admin.db, user.uid)) {
      res.setHeader('Retry-After', '3600');
      return res.status(429).json({ error: 'Хэт олон нэхэмжлэл үүсгэлээ. Нэг цагийн дараа дахин оролдоно уу.' });
    }

    const product: 'subscription' | 'placement' =
      req.body?.product === 'placement' ? 'placement' : 'subscription';

    let planLabel: string;
    let interval: BillingInterval | null = null;
    let amountMnt: number;
    let description: string;
    if (product === 'placement') {
      planLabel = PLACEMENT_PLAN_NAME;
      amountMnt = PLACEMENT_RESULT_PRICE_MNT;
      description = 'Placement test result - Vivid Lingua';
    } else {
      const planId = parsePaidPlanId(req.body?.plan);
      if (!planId) {
        return res.status(400).json({ error: 'Багцаа сонгоно уу (pro эсвэл max).', methods: paymentMethodsPayload() });
      }
      interval = parseBillingInterval(req.body?.interval);
      const plan = getPaidPlans()[planId];
      amountMnt = interval === 'year' ? plan.yearAmountMnt : plan.amountMnt;
      planLabel = planId;
      description = `${plan.name} ${interval === 'year' ? 'annual' : 'monthly'} access - Vivid Lingua`;
    }

    const senderInvoiceNo = senderInvoiceNoFor(user.uid);

    try {
      const checkout = await createBylCheckout({
        amountMnt,
        itemName: description,
        clientReferenceId: senderInvoiceNo,
        customerEmail: user.email,
        successUrl: appBaseUrl(req),
        cancelUrl: appBaseUrl(req),
      });

      if (!checkout.id || !checkout.url) {
        return res.status(502).json({ error: 'Byl did not return a checkout id/url.', checkout });
      }

      const amountCents = amountMntToCents(amountMnt);
      await admin.db.collection('paymentInvoices').doc(senderInvoiceNo).set({
        provider: 'byl',
        providerInvoiceId: String(checkout.id),
        senderInvoiceNo,
        userId: user.uid,
        customerEmail: user.email ?? '',
        customerName: user.name ?? '',
        plan: planLabel,
        product,
        ...(interval ? { interval } : {}),
        amountMnt,
        amountCents,
        currency: 'MNT',
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        bylCheckout: { id: checkout.id, url: checkout.url, status: checkout.status ?? 'open' },
      });

      return res.status(201).json({
        provider: 'byl',
        senderInvoiceNo,
        providerInvoiceId: String(checkout.id),
        plan: planLabel,
        product,
        ...(interval ? { interval } : {}),
        amountMnt,
        currency: 'MNT',
        url: checkout.url,
      });
    } catch (err) {
      if (err instanceof BylConfigError) {
        return res.status(503).json({ error: err.message, missing: err.missing });
      }

      console.error('Byl checkout failed:', err);
      return res.status(502).json({ error: 'Byl checkout failed. Check the Byl token and project id.' });
    }
  });

  app.get('/api/payments/byl/invoices/:senderInvoiceNo', async (req, res) => {
    const admin = getFirebaseAdmin();
    if (!admin) return res.status(503).json({ error: firebaseAdminMissingMessage() });

    const user = await verifyFirebaseBearer(req);
    if (!user) return res.status(401).json({ error: 'Sign in again before checking payment.' });

    const invoiceRef = admin.db.collection('paymentInvoices').doc(sanitizeDocId(req.params.senderInvoiceNo));
    const snap = await invoiceRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Payment invoice was not found.' });

    const invoice = snap.data() as PendingInvoice;
    if (invoice.userId !== user.uid) return res.status(403).json({ error: 'This payment belongs to a different user.' });
    if (invoice.status === 'paid') return res.json(publicInvoicePayload(invoice));

    try {
      return res.json(await checkAndMaybeActivate(invoiceRef, invoice));
    } catch (err) {
      console.error('Byl invoice check failed:', err);
      return res.status(502).json({ error: 'Could not check Byl payment status.' });
    }
  });

  // Spend one of the caller's free placement credits (granted by a
  // subscription purchase) to unlock their placement-test reveal without
  // paying the one-off fee. The decrement + unlock run in a single transaction
  // so a credit can never be spent twice.
  app.post('/api/payments/placement/redeem-credit', async (req: Request, res: Response) => {
    const admin = getFirebaseAdmin();
    if (!admin) return res.status(503).json({ error: firebaseAdminMissingMessage() });

    let user;
    try {
      user = await verifyFirebaseBearer(req);
    } catch {
      user = null;
    }
    if (!user) return res.status(401).json({ error: 'Нэвтэрч орно уу.' });

    const userRef = admin.db.collection('users').doc(user.uid);
    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.data() ?? {};
        const credits = Number(data.placementCredits) || 0;
        if (!hasPlacementCredit(credits)) return { ok: false as const };
        tx.set(userRef, {
          placementCredits: FieldValue.increment(-1),
          placement: { unlocked: true, unlockedBy: 'subscription' },
        }, { merge: true });
        return { ok: true as const, remainingCredits: credits - 1 };
      });

      if (!result.ok) {
        return res.status(402).json({ error: 'Үнэгүй үнэлгээний эрх үлдсэнгүй. Дахин нээхэд төлбөр шаардлагатай.' });
      }
      return res.json({ unlocked: true, unlockedBy: 'subscription', remainingCredits: result.remainingCredits });
    } catch (err) {
      console.error('Placement credit redeem failed:', err);
      return res.status(502).json({ error: 'Эрх ашиглахад алдаа гарлаа. Дахин оролдоно уу.' });
    }
  });

  // Byl POSTs invoice.paid / checkout.completed events here, signed with
  // HMAC-SHA256 in the Byl-Signature header. The payload only tells us which
  // invoice to look at — activation always re-checks Byl's API, so even an
  // unsigned/forged request cannot unlock anything that was not really paid.
  app.post('/api/payments/byl/webhook', async (req: Request, res: Response) => {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body ?? {});
    const verified = verifyBylWebhookSignature(rawBody, req.header('Byl-Signature'));
    if (verified === false) {
      return res.status(401).json({ error: 'Invalid Byl webhook signature.' });
    }

    const admin = getFirebaseAdmin();
    if (!admin) return res.status(503).json({ error: firebaseAdminMissingMessage() });

    const event = (req.body ?? {}) as BylWebhookEvent;
    const object = event.data?.object ?? {};
    const clientReferenceId = String(object.client_reference_id ?? '');
    const objectId = String(object.id ?? '');

    try {
      let invoiceRef = clientReferenceId
        ? admin.db.collection('paymentInvoices').doc(sanitizeDocId(clientReferenceId))
        : null;
      let invoiceSnap = invoiceRef ? await invoiceRef.get() : null;

      if ((!invoiceSnap || !invoiceSnap.exists) && objectId) {
        const matches = await admin.db.collection('paymentInvoices')
          .where('providerInvoiceId', '==', objectId)
          .limit(1)
          .get();
        invoiceSnap = matches.docs[0] ?? null;
        invoiceRef = invoiceSnap?.ref ?? null;
      }

      if (!invoiceRef || !invoiceSnap?.exists) {
        return res.status(404).json({ error: 'Matching pending invoice was not found.' });
      }

      const invoice = invoiceSnap.data() as PendingInvoice;
      const result = invoice.status === 'paid'
        ? publicInvoicePayload(invoice)
        : await checkAndMaybeActivate(invoiceRef, invoice);

      return res.json(result);
    } catch (err) {
      console.error('Byl webhook failed:', err);
      return res.status(502).json({ error: 'Byl webhook processing failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Dummy payment provider — same invoice/billing flow as Byl but the "payment"
  // is simulated with a second request. Lets the Mongolian-market checkout be
  // exercised end-to-end without real money.
  // ---------------------------------------------------------------------------
  app.post('/api/payments/dummy/checkout', async (req, res) => {
    if (!dummyPaymentsEnabled()) return res.status(404).json({ error: 'Not found.' });
    const admin = getFirebaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: firebaseAdminMissingMessage(), methods: paymentMethodsPayload() });
    }

    const user = await verifyFirebaseBearer(req);
    if (!user) {
      return res.status(401).json({ error: 'Sign in again before starting payment.' });
    }

    if (await checkoutRateLimited(admin.db, user.uid)) {
      res.setHeader('Retry-After', '3600');
      return res.status(429).json({ error: 'Хэт олон нэхэмжлэл үүсгэлээ. Нэг цагийн дараа дахин оролдоно уу.' });
    }

    const product: 'subscription' | 'placement' =
      req.body?.product === 'placement' ? 'placement' : 'subscription';

    let planLabel: string;
    let interval: BillingInterval | null = null;
    let amountMnt: number;
    if (product === 'placement') {
      planLabel = PLACEMENT_PLAN_NAME;
      amountMnt = PLACEMENT_RESULT_PRICE_MNT;
    } else {
      const planId = parsePaidPlanId(req.body?.plan);
      if (!planId) {
        return res.status(400).json({ error: 'Багцаа сонгоно уу (pro эсвэл max).' });
      }
      interval = parseBillingInterval(req.body?.interval);
      const plan = getPaidPlans()[planId];
      amountMnt = interval === 'year' ? plan.yearAmountMnt : plan.amountMnt;
      planLabel = planId;
    }

    const senderInvoiceNo = senderInvoiceNoFor(user.uid);
    const amountCents = amountMntToCents(amountMnt);

    await admin.db.collection('paymentInvoices').doc(senderInvoiceNo).set({
      provider: 'dummy',
      providerInvoiceId: `dummy_${senderInvoiceNo}`,
      senderInvoiceNo,
      userId: user.uid,
      customerEmail: user.email ?? '',
      customerName: user.name ?? '',
      plan: planLabel,
      product,
      ...(interval ? { interval } : {}),
      amountMnt,
      amountCents,
      currency: 'MNT',
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      provider: 'dummy',
      senderInvoiceNo,
      providerInvoiceId: `dummy_${senderInvoiceNo}`,
      plan: planLabel,
      product,
      ...(interval ? { interval } : {}),
      amountMnt,
      currency: 'MNT',
    });
  });

  app.post('/api/payments/dummy/invoices/:senderInvoiceNo/pay', async (req, res) => {
    if (!dummyPaymentsEnabled()) return res.status(404).json({ error: 'Not found.' });
    const admin = getFirebaseAdmin();
    if (!admin) return res.status(503).json({ error: firebaseAdminMissingMessage() });

    const user = await verifyFirebaseBearer(req);
    if (!user) return res.status(401).json({ error: 'Sign in again before paying.' });

    const invoiceRef = admin.db.collection('paymentInvoices').doc(sanitizeDocId(req.params.senderInvoiceNo));
    const snap = await invoiceRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Payment invoice was not found.' });

    const invoice = snap.data() as PendingInvoice;
    if (invoice.userId !== user.uid) return res.status(403).json({ error: 'This payment belongs to a different user.' });
    if (invoice.provider !== 'dummy') return res.status(400).json({ error: 'Энэ нэхэмжлэл туршилтын төлбөрийн нэхэмжлэл биш байна.' });
    if (invoice.status === 'paid') return res.json({ ...publicInvoicePayload(invoice), billing: null });

    const simulatedPayment: PaymentRecord = {
      payment_id: `dummy_${Date.now()}`,
      payment_status: 'PAID',
      payment_date: new Date().toISOString(),
      payment_amount: invoice.amountMnt,
      payment_currency: 'MNT',
      transaction_type: 'DUMMY_SIMULATION',
      object_id: invoice.providerInvoiceId,
      object_type: 'INVOICE',
    };

    try {
      const billing = await activatePaidInvoice(invoiceRef, invoice, simulatedPayment);
      return res.json({
        ...publicInvoicePayload({ ...invoice, status: 'paid' }, simulatedPayment),
        billing,
      });
    } catch (err) {
      console.error('Dummy payment activation failed:', err);
      return res.status(502).json({ error: 'Туршилтын төлбөрийг идэвхжүүлж чадсангүй.' });
    }
  });
}
