import type { Express, Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  firebaseAdminMissingMessage,
  getFirebaseAdmin,
  verifyFirebaseBearer,
} from '../lib/firebaseAdmin';
import {
  checkQPayInvoice,
  createQPayInvoice,
  findPaidQPayPayment,
  getPaymentPlan,
  getQPayConfigState,
  getQPayPayment,
  QPayConfigError,
  type QPayPaymentCheckResponse,
  type QPayPaymentRow,
} from '../lib/payments/qpay';

interface PendingInvoice {
  provider: 'qpay';
  providerInvoiceId: string;
  senderInvoiceNo: string;
  userId: string;
  customerEmail: string;
  customerName?: string;
  plan: string;
  // 'subscription' (default) renews monthly access; 'placement' is a one-off
  // purchase that unlocks the placement-test result for the user.
  product?: 'subscription' | 'placement';
  amountMnt: number;
  amountCents: number;
  currency: 'MNT';
  status: 'pending' | 'paid' | 'failed';
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

function callbackUrlFor(req: Request, senderInvoiceNo: string): string {
  const configured = process.env.QPAY_CALLBACK_URL;
  const url = new URL(configured || `${appBaseUrl(req)}/api/payments/qpay/webhook`);
  url.searchParams.set('sender_invoice_no', senderInvoiceNo);
  return url.toString();
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function publicInvoicePayload(invoice: PendingInvoice, check?: QPayPaymentCheckResponse, payment?: QPayPaymentRow | null) {
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
    check: check ? {
      count: check.count ?? 0,
      paidAmount: check.paid_amount ?? 0,
    } : null,
  };
}

async function activatePaidInvoice(
  invoiceRef: FirebaseFirestore.DocumentReference,
  invoice: PendingInvoice,
  paidPayment: QPayPaymentRow,
) {
  const admin = getFirebaseAdmin();
  if (!admin) throw new Error(firebaseAdminMissingMessage());

  const now = new Date();
  const isPlacement = invoice.product === 'placement';
  const currentPeriodEnd = addMonths(now, 1).toISOString();
  const paymentId = String(paidPayment.payment_id || invoice.providerInvoiceId);
  const paymentRef = admin.db.collection('payments').doc(sanitizeDocId(`qpay_${paymentId}`));
  const userRef = admin.db.collection('users').doc(invoice.userId);

  await admin.db.runTransaction(async (tx) => {
    tx.set(paymentRef, {
      provider: 'qpay',
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
      createdAt: paidPayment.payment_date || now.toISOString(),
      qpay: paidPayment,
    }, { merge: true });

    if (isPlacement) {
      // One-off purchase: unlock the placement result without touching the
      // subscription plan/status. Revenue still counts toward lifetime value.
      tx.set(userRef, {
        placement: { unlocked: true, unlockedBy: 'qpay' },
        billing: {
          lifetimeValueCents: FieldValue.increment(invoice.amountCents),
          currency: invoice.currency,
          provider: 'qpay',
        },
      }, { merge: true });
    } else {
      tx.set(userRef, {
        billing: {
          plan: invoice.plan,
          status: 'active',
          monthlyAmountCents: invoice.amountCents,
          lifetimeValueCents: FieldValue.increment(invoice.amountCents),
          currency: invoice.currency,
          provider: 'qpay',
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
      qpayPayment: paidPayment,
    }, { merge: true });
  });

  if (isPlacement) {
    return {
      plan: invoice.plan,
      status: 'paid',
      currency: invoice.currency,
      provider: 'qpay',
    };
  }

  return {
    plan: invoice.plan,
    status: 'active',
    monthlyAmountCents: invoice.amountCents,
    currency: invoice.currency,
    provider: 'qpay',
    currentPeriodEnd,
  };
}

async function checkAndMaybeActivate(invoiceRef: FirebaseFirestore.DocumentReference, invoice: PendingInvoice) {
  const check = await checkQPayInvoice(invoice.providerInvoiceId);
  const paidPayment = findPaidQPayPayment(check);
  const billing = paidPayment ? await activatePaidInvoice(invoiceRef, invoice, paidPayment) : null;
  const status: PendingInvoice['status'] = paidPayment ? 'paid' : invoice.status;

  return {
    ...publicInvoicePayload({ ...invoice, status }, check, paidPayment),
    billing,
  };
}

function paymentMethodsPayload() {
  const qpay = getQPayConfigState();
  const plan = getPaymentPlan();
  const adminReady = Boolean(getFirebaseAdmin());
  const qpayMissing = [...qpay.missing];
  if (!plan.amountMnt) qpayMissing.push('QPAY_MONTHLY_AMOUNT_MNT');
  if (!adminReady) qpayMissing.push('Firebase Admin credentials');

  return {
    primary: 'qpay',
    plan,
    qpay: {
      id: 'qpay',
      name: 'QPay',
      status: qpayMissing.length === 0 ? 'ready' : 'needs_config',
      missing: qpayMissing,
      supports: ['QR', 'bank app deeplinks', 'card payment through QPay rails'],
      apiBaseUrl: qpay.apiBaseUrl,
    },
    alternatives: [
      {
        id: 'bonum',
        name: 'Bonum Gateway',
        status: 'planned',
        supports: ['Apple Pay', 'Google Pay', 'cards', 'QPay'],
        note: 'Best next option for Apple Pay / Google Pay and card-wallet coverage in Mongolia.',
      },
      {
        id: 'byl',
        name: 'Byl',
        status: 'planned',
        supports: ['QPay', 'SocialPay', 'Pocket', 'Golomt merchant'],
        note: 'Hosted checkout aggregator option if speed matters more than direct integration.',
      },
    ],
  };
}

export function registerPaymentsRoute(app: Express) {
  app.get('/api/payments/methods', (_req, res) => {
    res.json(paymentMethodsPayload());
  });

  app.post('/api/payments/qpay/checkout', async (req, res) => {
    const admin = getFirebaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: firebaseAdminMissingMessage(), methods: paymentMethodsPayload() });
    }

    const user = await verifyFirebaseBearer(req);
    if (!user) {
      return res.status(401).json({ error: 'Sign in again before starting payment.' });
    }

    const product: 'subscription' | 'placement' =
      req.body?.product === 'placement' ? 'placement' : 'subscription';

    let planName: string;
    let amountMnt: number;
    if (product === 'placement') {
      planName = PLACEMENT_PLAN_NAME;
      amountMnt = PLACEMENT_RESULT_PRICE_MNT;
    } else {
      const plan = getPaymentPlan();
      if (!plan.amountMnt) {
        return res.status(503).json({
          error: 'Subscription price is not configured yet. Set QPAY_MONTHLY_AMOUNT_MNT before taking live payments.',
          methods: paymentMethodsPayload(),
        });
      }
      planName = plan.plan;
      amountMnt = plan.amountMnt;
    }

    const senderInvoiceNo = senderInvoiceNoFor(user.uid);
    const description = product === 'placement'
      ? 'Placement test result - Vivid Lingua'
      : `${planName} access - Vivid Lingua`;

    try {
      const qpayInvoice = await createQPayInvoice({
        senderInvoiceNo,
        receiverCode: user.uid,
        receiverName: user.name,
        receiverEmail: user.email,
        description,
        amountMnt,
        callbackUrl: callbackUrlFor(req, senderInvoiceNo),
      });

      if (!qpayInvoice.invoice_id) {
        return res.status(502).json({ error: 'QPay did not return an invoice_id.', qpayInvoice });
      }

      const amountCents = amountMntToCents(amountMnt);
      await admin.db.collection('paymentInvoices').doc(senderInvoiceNo).set({
        provider: 'qpay',
        providerInvoiceId: qpayInvoice.invoice_id,
        senderInvoiceNo,
        userId: user.uid,
        customerEmail: user.email ?? '',
        customerName: user.name ?? '',
        plan: planName,
        product,
        amountMnt,
        amountCents,
        currency: 'MNT',
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        qpayInvoice,
      });

      return res.status(201).json({
        provider: 'qpay',
        senderInvoiceNo,
        providerInvoiceId: qpayInvoice.invoice_id,
        plan: planName,
        product,
        amountMnt,
        currency: 'MNT',
        qrText: qpayInvoice.qr_text,
        qrImage: qpayInvoice.qr_image,
        shortUrl: qpayInvoice.qPay_shortUrl || qpayInvoice.qpay_short_url,
        urls: qpayInvoice.urls ?? [],
      });
    } catch (err) {
      if (err instanceof QPayConfigError) {
        return res.status(503).json({ error: err.message, missing: err.missing });
      }

      console.error('QPay checkout failed:', err);
      return res.status(502).json({ error: 'QPay checkout failed. Check merchant credentials and QPay status.' });
    }
  });

  app.get('/api/payments/qpay/invoices/:senderInvoiceNo', async (req, res) => {
    const admin = getFirebaseAdmin();
    if (!admin) return res.status(503).json({ error: firebaseAdminMissingMessage() });

    const user = await verifyFirebaseBearer(req);
    if (!user) return res.status(401).json({ error: 'Sign in again before checking payment.' });

    const invoiceRef = admin.db.collection('paymentInvoices').doc(req.params.senderInvoiceNo);
    const snap = await invoiceRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Payment invoice was not found.' });

    const invoice = snap.data() as PendingInvoice;
    if (invoice.userId !== user.uid) return res.status(403).json({ error: 'This payment belongs to a different user.' });
    if (invoice.status === 'paid') return res.json(publicInvoicePayload(invoice));

    try {
      return res.json(await checkAndMaybeActivate(invoiceRef, invoice));
    } catch (err) {
      console.error('QPay invoice check failed:', err);
      return res.status(502).json({ error: 'Could not check QPay payment status.' });
    }
  });

  app.post('/api/payments/qpay/webhook', async (req, res) => {
    const admin = getFirebaseAdmin();
    if (!admin) return res.status(503).json({ error: firebaseAdminMissingMessage() });

    const senderInvoiceNo = String(req.query.sender_invoice_no || req.body?.sender_invoice_no || '');
    const paymentId = String(req.query.payment_id || req.body?.payment_id || '');
    let invoiceRef = senderInvoiceNo ? admin.db.collection('paymentInvoices').doc(senderInvoiceNo) : null;
    let invoiceSnap = invoiceRef ? await invoiceRef.get() : null;

    try {
      if ((!invoiceSnap || !invoiceSnap.exists) && paymentId) {
        const payment = await getQPayPayment(paymentId);
        const providerInvoiceId = String(payment.object_id || req.body?.invoice_id || '');
        if (providerInvoiceId) {
          const matches = await admin.db.collection('paymentInvoices')
            .where('providerInvoiceId', '==', providerInvoiceId)
            .limit(1)
            .get();
          invoiceSnap = matches.docs[0] ?? null;
          invoiceRef = invoiceSnap?.ref ?? null;
        }
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
      console.error('QPay webhook failed:', err);
      return res.status(502).json({ error: 'QPay webhook processing failed.' });
    }
  });
}
