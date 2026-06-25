// =============================================================================
// English track — payments hook.
// -----------------------------------------------------------------------------
// A self-contained copy of the German App.tsx payment flow so the English
// dashboard can render the SHARED <BillingCard> with full parity: the (now
// equal) Pro/Max prices, the monthly/annual toggle, teacher promo codes, and
// Byl / dummy checkout with auto-confirmation. It calls the exact same backend
// endpoints, so the German track is untouched. Billing is server-owned, so
// confirmed updates are merged into local state only (never re-saved).
// =============================================================================
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { getAuthInstance, isFirebaseConfigured } from '../../frontend/src/firebase';
import { getMyPromo, redeemPromoCode, type MyPromo } from '../../frontend/src/promo';
import { PLANS, type BillingInterval } from '../../frontend/src/plans';
import type { UserProfile } from '../../frontend/src/profiles';
import type {
  PaymentMethodsResponse, DummyCheckoutResponse, BylCheckoutResponse,
} from '../../frontend/src/types';

type PaymentMessage = { type: 'info' | 'success' | 'error'; text: string } | null;

export function useEnglishPayments(
  currentUser: UserProfile | null,
  applyBilling: (billing: NonNullable<UserProfile['billing']>) => void,
) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodsResponse | null>(null);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month');
  const [bylCheckout, setBylCheckout] = useState<BylCheckoutResponse | null>(null);
  const [dummyInvoice, setDummyInvoice] = useState<DummyCheckoutResponse | null>(null);
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<PaymentMessage>(null);
  const [myPromo, setMyPromo] = useState<MyPromo | null>(null);
  const [manualPromoCode, setManualPromoCode] = useState('');
  const [manualPromoError, setManualPromoError] = useState<string | null>(null);
  const [manualPromoLoading, setManualPromoLoading] = useState(false);

  const getCurrentIdToken = async () => {
    if (!isFirebaseConfigured) throw new Error('Firebase тохиргоо дутуу байна.');
    const user = getAuthInstance().currentUser;
    if (!user) throw new Error('Төлбөр эхлүүлэхийн тулд дахин нэвтэрнэ үү.');
    return user.getIdToken();
  };

  const loadPaymentMethods = useCallback(async () => {
    setPaymentMethodsLoading(true);
    try {
      const response = await fetch('/api/payments/methods');
      if (!response.ok) throw new Error('Could not load payment methods.');
      setPaymentMethods(await response.json());
    } catch (err) {
      console.warn('Payment methods load failed:', err);
      setPaymentMessage({ type: 'error', text: 'Төлбөрийн сонголтуудыг ачаалж чадсангүй.' });
    } finally {
      setPaymentMethodsLoading(false);
    }
  }, []);

  const loadMyPromo = useCallback(async () => {
    try {
      const { promo } = await getMyPromo();
      setMyPromo(promo);
    } catch {
      setMyPromo(null);
    }
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.isGuest) return;
    loadPaymentMethods();
    loadMyPromo();
  }, [currentUser?.email, currentUser?.billing?.plan, currentUser?.isGuest, loadPaymentMethods, loadMyPromo]);

  const handleRedeemManualPromo = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualPromoCode.trim()) return;
    setManualPromoLoading(true);
    setManualPromoError(null);
    setPaymentMessage(null);
    try {
      const res = await redeemPromoCode(manualPromoCode.trim());
      if (res.redeemed) {
        setPaymentMessage({
          type: 'success',
          text: `Багш ${res.teacherName || ''}-ийн код холбогдлоо. (${res.discountPercent}% хямдрал эхний төлбөрт ажиллана.)`,
        });
        setManualPromoCode('');
        await loadMyPromo();
      } else if (res.already) {
        setManualPromoError('Энэ код аль хэдийн таны дансанд холбогдсон байна.');
      } else {
        setManualPromoError('Код холбож чадсангүй.');
      }
    } catch (err: any) {
      setManualPromoError(err?.message || 'Код холбоход алдаа гарлаа.');
    } finally {
      setManualPromoLoading(false);
    }
  };

  // 100%-off teacher code: server granted access for free (no checkout URL).
  const handleFreeGrant = (data: any): boolean => {
    if (!data || data.free !== true || data.url) return false;
    if (data.billing) applyBilling(data.billing);
    setBylCheckout(null);
    setDummyInvoice(null);
    setPaymentMessage({ type: 'success', text: 'Урамшууллын кодоор танд үнэгүй эрх нээгдлээ 🎉' });
    loadMyPromo();
    return true;
  };

  const startBylCheckout = async (planId: 'pro' | 'max') => {
    setPaymentActionLoading(true);
    setPaymentMessage(null);
    setDummyInvoice(null);
    try {
      const token = await getCurrentIdToken();
      const response = await fetch('/api/payments/byl/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: planId, interval: billingInterval }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Төлбөр эхлүүлэхэд алдаа гарлаа.');
      if (handleFreeGrant(data)) return;
      setBylCheckout(data);
      if (data.url) window.open(data.url, '_blank', 'noopener');
      setPaymentMessage({ type: 'info', text: 'Төлбөрийн хуудас нээгдлээ. QPay, SocialPay эсвэл Pocket-оор төлнө үү.' });
    } catch (err: any) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Төлбөр эхлүүлэхэд алдаа гарлаа.' });
    } finally {
      setPaymentActionLoading(false);
    }
  };

  const startDummyCheckout = async (planId: 'pro' | 'max') => {
    setPaymentActionLoading(true);
    setPaymentMessage(null);
    setBylCheckout(null);
    try {
      const token = await getCurrentIdToken();
      const response = await fetch('/api/payments/dummy/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: planId, interval: billingInterval }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Туршилтын нэхэмжлэл үүсгэхэд алдаа гарлаа.');
      if (handleFreeGrant(data)) return;
      setDummyInvoice(data);
      setPaymentMessage({ type: 'info', text: 'Туршилтын нэхэмжлэл үүслээ. "Төлбөр төлөх (туршилт)" товчоор баталгаажуулна уу.' });
    } catch (err: any) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Туршилтын нэхэмжлэл үүсгэхэд алдаа гарлаа.' });
    } finally {
      setPaymentActionLoading(false);
    }
  };

  const payDummyInvoice = async () => {
    if (!dummyInvoice) return;
    setPaymentStatusLoading(true);
    setPaymentMessage(null);
    try {
      const token = await getCurrentIdToken();
      const response = await fetch(`/api/payments/dummy/invoices/${encodeURIComponent(dummyInvoice.senderInvoiceNo)}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Туршилтын төлбөр амжилтгүй боллоо.');
      if (data.billing) applyBilling(data.billing);
      setDummyInvoice(null);
      setPaymentMessage({ type: 'success', text: `Туршилтын төлбөр амжилттай. ${PLANS[dummyInvoice.plan].name} багц идэвхтэй боллоо!` });
    } catch (err: any) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Туршилтын төлбөр амжилтгүй боллоо.' });
    } finally {
      setPaymentStatusLoading(false);
    }
  };

  const startCheckout = (planId: 'pro' | 'max') => {
    if (paymentMethods?.byl.status === 'ready') return startBylCheckout(planId);
    return startDummyCheckout(planId);
  };

  // Poll one Byl checkout. Manual "Одоо шалгах" uses silent=false; the auto-poll
  // loop below uses silent=true (no "not yet paid" noise every few seconds).
  const bylCheckoutRef = useRef<BylCheckoutResponse | null>(null);
  bylCheckoutRef.current = bylCheckout;
  const bylPollBusyRef = useRef(false);
  const pollBylInvoice = useCallback(async (silent: boolean): Promise<boolean> => {
    const checkout = bylCheckoutRef.current;
    if (!checkout || bylPollBusyRef.current) return false;
    bylPollBusyRef.current = true;
    if (!silent) { setPaymentStatusLoading(true); setPaymentMessage(null); }
    try {
      const token = await getCurrentIdToken();
      const response = await fetch(`/api/payments/byl/invoices/${encodeURIComponent(checkout.senderInvoiceNo)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Төлбөрийн төлөв шалгахад алдаа гарлаа.');
      if (data.paid || data.status === 'paid') {
        if (data.billing) applyBilling(data.billing);
        setBylCheckout(null);
        setPaymentMessage({ type: 'success', text: 'Төлбөр баталгаажлаа. Эрх идэвхтэй боллоо! 🎉' });
        return true;
      }
      if (!silent) setPaymentMessage({ type: 'info', text: 'Төлбөр хараахан баталгаажаагүй байна. Төлснөөс хойш хэдхэн секундэд автоматаар баталгаажна.' });
      return false;
    } catch (err: any) {
      if (!silent) setPaymentMessage({ type: 'error', text: err?.message || 'Төлбөрийн төлөв шалгахад алдаа гарлаа.' });
      return false;
    } finally {
      bylPollBusyRef.current = false;
      if (!silent) setPaymentStatusLoading(false);
    }
  }, [applyBilling]);

  // Auto-confirm: while a Byl checkout is open, poll every few seconds so paying
  // on the hosted page flips the plan without the user clicking "check".
  useEffect(() => {
    if (!bylCheckout) return;
    const t = setInterval(() => { pollBylInvoice(true); }, 4000);
    return () => clearInterval(t);
  }, [bylCheckout, pollBylInvoice]);

  const checkBylPaymentStatus = () => { pollBylInvoice(false); };

  return {
    paymentMethods, paymentMethodsLoading,
    billingInterval, setBillingInterval,
    bylCheckout, setBylCheckout,
    dummyInvoice, payDummyInvoice,
    paymentActionLoading, paymentStatusLoading,
    paymentMessage, setPaymentMessage,
    myPromo, manualPromoCode, setManualPromoCode,
    manualPromoError, manualPromoLoading, handleRedeemManualPromo,
    startCheckout, checkBylPaymentStatus,
  };
}
