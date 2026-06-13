import crypto from 'crypto';

// Byl (byl.mn) — Mongolian hosted-checkout aggregator covering QPay, SocialPay,
// Pocket and Golomt merchant rails behind one Bearer-token API.
// Docs: https://byl.mn/docs/api/

export interface BylCheckout {
  id?: number | string;
  url?: string;
  status?: string; // open | complete | expired
  mode?: string;
  amount_subtotal?: number;
  amount_total?: number;
  customer_email?: string;
  client_reference_id?: string;
  expires_at?: string;
  [key: string]: unknown;
}

export interface BylWebhookEvent {
  id?: number | string;
  project_id?: number | string;
  type?: string; // invoice.paid | checkout.completed
  object?: string;
  data?: { object?: Record<string, unknown> };
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// Provider-agnostic payment record persisted on activation. Mirrors the field
// names already stored in Firestore payment docs so historical QPay/dummy
// records and new Byl records share one shape.
export interface PaymentRecord {
  payment_id?: string;
  payment_status?: string;
  payment_date?: string;
  payment_amount?: string | number;
  payment_currency?: string;
  transaction_type?: string;
  object_id?: string;
  object_type?: string;
  [key: string]: unknown;
}

export class BylConfigError extends Error {
  constructor(public missing: string[]) {
    super(`Byl is not configured: ${missing.join(', ')}`);
  }
}

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

// The merchant token was first stored as QPAY_API_TOKEN before we learned it
// is a Byl token; accept both names so neither environment breaks.
function bylToken(): string {
  return env('BYL_TOKEN') || env('QPAY_API_TOKEN');
}

function bylApiBaseUrl(): string {
  const base = env('BYL_API_BASE_URL') || 'https://byl.mn/api/v1';
  return base.replace(/\/+$/, '');
}

export function getBylConfigState() {
  const missing: string[] = [];
  if (!bylToken()) missing.push('BYL_TOKEN');
  if (!env('BYL_PROJECT_ID')) missing.push('BYL_PROJECT_ID');

  return {
    configured: missing.length === 0,
    missing,
    apiBaseUrl: bylApiBaseUrl(),
  };
}

function projectPath(path: string): string {
  const state = getBylConfigState();
  if (!state.configured) throw new BylConfigError(state.missing);
  return `/projects/${encodeURIComponent(env('BYL_PROJECT_ID'))}${path}`;
}

async function bylRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${bylApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bylToken()}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const detail = typeof body === 'object' && body !== null ? JSON.stringify(body) : text;
    throw new Error(`Byl request ${path} failed (${response.status}): ${detail}`);
  }

  // Byl wraps payloads as { data: {...} }.
  const data = (body as { data?: T })?.data;
  return (data ?? body) as T;
}

export async function createBylCheckout(input: {
  amountMnt: number;
  itemName: string;
  clientReferenceId: string;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<BylCheckout> {
  return bylRequest<BylCheckout>(projectPath('/checkouts'), {
    method: 'POST',
    body: JSON.stringify({
      ...(input.successUrl ? { success_url: input.successUrl } : {}),
      ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      client_reference_id: input.clientReferenceId,
      items: [
        {
          price_data: {
            unit_amount: input.amountMnt,
            product_data: { name: input.itemName.slice(0, 255) },
          },
          quantity: 1,
        },
      ],
    }),
  });
}

export async function getBylCheckout(checkoutId: string): Promise<BylCheckout> {
  return bylRequest<BylCheckout>(projectPath(`/checkouts/${encodeURIComponent(checkoutId)}`), { method: 'GET' });
}

export function isBylCheckoutPaid(checkout: BylCheckout): boolean {
  return String(checkout.status ?? '').toLowerCase() === 'complete';
}

export function bylPaymentFromCheckout(checkout: BylCheckout): PaymentRecord {
  return {
    payment_id: `byl_${checkout.id}`,
    payment_status: 'PAID',
    payment_date: new Date().toISOString(),
    payment_amount: checkout.amount_total,
    payment_currency: 'MNT',
    transaction_type: 'BYL_CHECKOUT',
    object_id: String(checkout.id ?? ''),
    object_type: 'CHECKOUT',
  };
}

// Byl signs webhook bodies with HMAC-SHA256 in the Byl-Signature header.
// Returns null when no secret is configured (verification not possible) —
// callers must then treat the payload as untrusted and re-check via the API.
export function verifyBylWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean | null {
  const secret = env('BYL_WEBHOOK_SECRET');
  if (!secret) return null;
  if (!signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = Buffer.from(signature.trim());
  const want = Buffer.from(expected);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
