import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, BarChart3, Clock, CreditCard, DollarSign,
  Flame, Gift, GraduationCap, Loader2, LogOut, Plus, RefreshCw, Search, ShieldCheck,
  Tag, TrendingUp, UserCheck, UserPlus, Users
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser
} from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { getAuthInstance, getDb, isFirebaseConfigured } from './firebase';
import { UserProfile } from './profiles';
import {
  type PaymentRecord,
  type TrialInfo,
  type PaidPromoInfo,
  paymentAmountCents,
  isPaidPayment,
  monthlyValueCents,
  lifetimeValueCents,
  trialInfo,
  paidPromoInfo,
} from './adminMetrics';
import {
  type TeacherCodeView,
  adminListTeacherCodes,
  adminCreateTeacherCode,
  adminToggleTeacherCode,
} from './promo';

const ADMIN_EMAILS = ['hanaa5qn@gmail.com', 'yubndaayubnda@gmail.com'];

interface CustomerRow {
  id: string;
  profile: UserProfile;
}

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { seconds?: number; toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === 'function') return maybeTimestamp.toDate();
    if (typeof maybeTimestamp.seconds === 'number') return new Date(maybeTimestamp.seconds * 1000);
  }
  return null;
}

function formatDate(value: unknown): string {
  const date = parseDate(value);
  if (!date) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// Багшийн комисс/хямдрал бүгд төгрөгөөр: cents → ₮.
function formatMnt(cents: number): string {
  return (cents / 100).toLocaleString() + '₮';
}

interface CommissionRecord {
  teacherCode: string;
  teacherName: string;
  studentId: string;
  studentEmail: string;
  plan: string;
  interval: string;
  grossAmountCents: number;
  netPaidCents: number;
  discountPercent: number;
  commissionPercent: number;
  commissionCents: number;
  status: 'owed' | 'paid';
  createdAt: unknown;
  paymentId: string;
}

// One day of anonymous traffic counters, written by /api/track. doc id = date.
interface AnalyticsDay {
  date: string; // YYYY-MM-DD (UTC)
  visitors: number;
  guestStarts: number;
  signupClicks: number;
  signups: number;
}

function parseAnalyticsDay(id: string, raw: Record<string, unknown>): AnalyticsDay {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    date: typeof raw.date === 'string' ? raw.date : id,
    visitors: num(raw.visitors),
    guestStarts: num(raw.guestStarts),
    signupClicks: num(raw.signupClicks),
    signups: num(raw.signups),
  };
}

function totalStudyHours(profile: UserProfile): number {
  return Object.values(profile.studySecondsByDate ?? {}).reduce((sum, seconds) => sum + seconds, 0) / 3600;
}

function isRecent(value: unknown, days: number): boolean {
  const date = parseDate(value);
  if (!date) return false;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function lastMonthKeys(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }).map((_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return monthKey(date);
  });
}

function shortMonthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(year, month - 1, 1));
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p>
        <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="w-5 h-5" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsDay[]>([]);
  const [dataError, setDataError] = useState('');
  const [queryText, setQueryText] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  // Багш / Promo кодын төлөв
  const [teacherCodes, setTeacherCodes] = useState<TeacherCodeView[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [createForm, setCreateForm] = useState({
    code: '',
    teacherName: '',
    teacherContact: '',
    discountPercent: '',
    commissionPercent: '',
  });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [togglingCode, setTogglingCode] = useState<string | null>(null);

  const isAuthedAdmin = isAdminEmail(authUser?.email);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthLoading(false);
      return;
    }

    return onAuthStateChanged(getAuthInstance(), (user) => {
      setAuthUser(user);
      if (user?.email) setEmail(user.email);
      setAuthLoading(false);
    });
  }, []);

  const loadDashboard = async () => {
    if (!isAuthedAdmin) return;
    setLoading(true);
    setDataError('');
    try {
      const db = getDb();
      const [userSnap, paymentSnap, analyticsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'payments')).catch(() => null),
        getDocs(collection(db, 'analytics')).catch(() => null),
      ]);

      setCustomers(userSnap.docs.map((doc) => ({ id: doc.id, profile: doc.data() as UserProfile })));
      setPayments(paymentSnap ? paymentSnap.docs.map((doc) => doc.data() as PaymentRecord) : []);
      setAnalytics(
        analyticsSnap
          ? analyticsSnap.docs
              .map((doc) => parseAnalyticsDay(doc.id, doc.data() as Record<string, unknown>))
              .sort((a, b) => a.date.localeCompare(b.date))
          : [],
      );
      setLastLoadedAt(new Date());
    } catch (err) {
      console.error('Admin dashboard load failed:', err);
      setDataError('Could not load dashboard data. Check that your admin email is allowlisted in Firestore rules.');
    } finally {
      setLoading(false);
    }
  };

  const loadPromo = async () => {
    if (!isAuthedAdmin) return;
    setPromoLoading(true);
    setPromoError('');
    try {
      const db = getDb();
      const [codesResult, commissionSnap] = await Promise.all([
        adminListTeacherCodes(),
        getDocs(collection(db, 'commissions')).catch(() => null),
      ]);
      setTeacherCodes(codesResult.codes);
      setCommissions(commissionSnap ? commissionSnap.docs.map((doc) => doc.data() as CommissionRecord) : []);
    } catch (err) {
      console.error('Teacher codes load failed:', err);
      setPromoError(err instanceof Error ? err.message : 'Багшийн кодуудыг ачаалж чадсангүй.');
    } finally {
      setPromoLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthedAdmin) {
      loadDashboard();
      loadPromo();
    }
  }, [isAuthedAdmin]);

  const handleCreateCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError('');

    const code = createForm.code.trim();
    const teacherName = createForm.teacherName.trim();
    const teacherContact = createForm.teacherContact.trim();
    const discountPercent = Number(createForm.discountPercent);
    const commissionPercent = Number(createForm.commissionPercent);

    if (!code) {
      setCreateError('Код хоосон байж болохгүй.');
      return;
    }
    if (!teacherName) {
      setCreateError('Багшийн нэрийг оруулна уу.');
      return;
    }
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      setCreateError('Хямдрал 0-100 хооронд байх ёстой.');
      return;
    }
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      setCreateError('Комисс 0-100 хооронд байх ёстой.');
      return;
    }

    setCreating(true);
    try {
      await adminCreateTeacherCode({
        code,
        teacherName,
        teacherContact: teacherContact || undefined,
        discountPercent,
        commissionPercent,
      });
      setCreateForm({ code: '', teacherName: '', teacherContact: '', discountPercent: '', commissionPercent: '' });
      await loadPromo();
    } catch (err) {
      console.error('Create teacher code failed:', err);
      setCreateError(err instanceof Error ? err.message : 'Код үүсгэж чадсангүй.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleCode = async (code: string, nextActive: boolean) => {
    setTogglingCode(code);
    setPromoError('');
    try {
      const updated = await adminToggleTeacherCode(code, nextActive);
      setTeacherCodes((prev) => prev.map((c) => (c.code === code ? updated : c)));
    } catch (err) {
      console.error('Toggle teacher code failed:', err);
      setPromoError(err instanceof Error ? err.message : 'Кодын төлөв шинэчилж чадсангүй.');
    } finally {
      setTogglingCode(null);
    }
  };

  const metrics = useMemo(() => {
    const totalCustomers = customers.length;
    const active7d = customers.filter((c) => isRecent(c.profile.lastActiveAt, 7)).length;
    const active30d = customers.filter((c) => isRecent(c.profile.lastActiveAt, 30)).length;
    const avgProgress = totalCustomers
      ? Math.round(customers.reduce((sum, c) => sum + (c.profile.progress ?? 0), 0) / totalCustomers)
      : 0;
    const avgStudyHours = totalCustomers
      ? customers.reduce((sum, c) => sum + totalStudyHours(c.profile), 0) / totalCustomers
      : 0;
    const paidPayments = payments.filter(isPaidPayment);
    const currency = paidPayments[0]?.currency ?? customers.find((c) => c.profile.billing?.currency)?.profile.billing?.currency ?? 'USD';
    const grossRevenueCents = paidPayments.reduce((sum, p) => sum + paymentAmountCents(p), 0);
    const mrrCents = customers.reduce((sum, c) => sum + monthlyValueCents(c.profile), 0);
    const paidCustomers = customers.filter((c) => monthlyValueCents(c.profile) > 0 || lifetimeValueCents(c.profile) > 0).length;
    const arpuCents = paidCustomers ? Math.round(grossRevenueCents / paidCustomers) : 0;

    const revenueMonths = lastMonthKeys(6);
    const revenueByMonth = revenueMonths.map((key) => {
      const cents = paidPayments.reduce((sum, payment) => {
        const date = parseDate(payment.createdAt);
        return date && monthKey(date) === key ? sum + paymentAmountCents(payment) : sum;
      }, 0);
      return { key, label: shortMonthLabel(key), cents };
    });

    return {
      totalCustomers,
      active7d,
      active30d,
      avgProgress,
      avgStudyHours,
      grossRevenueCents,
      mrrCents,
      paidCustomers,
      arpuCents,
      currency,
      revenueByMonth,
    };
  }, [customers, payments]);

  const filteredCustomers = useMemo(() => {
    const query = queryText.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(({ profile }) => (
      profile.name.toLowerCase().includes(query) ||
      profile.email.toLowerCase().includes(query) ||
      profile.targetLevel.toLowerCase().includes(query) ||
      (profile.billing?.plan ?? '').toLowerCase().includes(query)
    ));
  }, [customers, queryText]);

  const topCustomers = useMemo(() => {
    return [...customers]
      .sort((a, b) => (b.profile.progress ?? 0) - (a.profile.progress ?? 0))
      .slice(0, 5);
  }, [customers]);

  // Everyone on a 3-day free Pro trial, with the reason (new signup vs invited).
  // Active (still has access) first, then by soonest expiry.
  const trialUsers = useMemo(() => {
    const rows = customers
      .map(({ id, profile }) => ({ id, profile, trial: trialInfo(profile) }))
      .filter((row): row is { id: string; profile: UserProfile; trial: TrialInfo } => row.trial !== null);
    rows.sort((a, b) =>
      Number(b.trial.active) - Number(a.trial.active) || a.trial.daysLeft - b.trial.daysLeft);
    return rows;
  }, [customers]);

  const trialSummary = useMemo(() => {
    const active = trialUsers.filter((r) => r.trial.active);
    return {
      active: active.length,
      signup: active.filter((r) => r.trial.reason === 'signup').length,
      referral: active.filter((r) => r.trial.reason === 'referral').length,
      other: active.filter((r) => r.trial.reason === 'other').length,
    };
  }, [trialUsers]);

  // Everyone who bought full access or redeemed a promo code. Paying customers
  // first (highest lifetime value), then promo-only redeemers.
  const paidPromoUsers = useMemo(() => {
    const rows = customers
      .map(({ id, profile }) => ({ id, profile, info: paidPromoInfo(profile) }))
      .filter((row): row is { id: string; profile: UserProfile; info: PaidPromoInfo } => row.info !== null);
    rows.sort((a, b) =>
      Number(b.info.paid) - Number(a.info.paid) || b.info.ltvCents - a.info.ltvCents);
    return rows;
  }, [customers]);

  const paidPromoSummary = useMemo(() => ({
    paid: paidPromoUsers.filter((r) => r.info.paid).length,
    promo: paidPromoUsers.filter((r) => r.info.usedPromo).length,
  }), [paidPromoUsers]);

  // Багш тус бүрийн төлсөн/өр комиссыг commissions docs-оос нэгтгэх.
  const commissionByCode = useMemo(() => {
    const map = new Map<string, { owedCents: number; paidCents: number }>();
    for (const c of commissions) {
      const entry = map.get(c.teacherCode) ?? { owedCents: 0, paidCents: 0 };
      if (c.status === 'paid') entry.paidCents += c.commissionCents ?? 0;
      else entry.owedCents += c.commissionCents ?? 0;
      map.set(c.teacherCode, entry);
    }
    return map;
  }, [commissions]);

  // Traffic + signup-funnel rollups from the per-day analytics counters.
  const traffic = useMemo(() => {
    const byDate = new Map<string, AnalyticsDay>(analytics.map((d) => [d.date, d] as const));
    const dayKey = (offset: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - offset);
      return d.toISOString().slice(0, 10);
    };
    const todayStr = dayKey(0);

    // Zero-filled last-14-day series so the bar chart has no gaps.
    const series = Array.from({ length: 14 }, (_, i) => {
      const date = dayKey(13 - i);
      const row = byDate.get(date);
      return { date, label: date.slice(5), visitors: row?.visitors ?? 0 };
    });

    const sumSince = (days: number, field: keyof AnalyticsDay) => {
      const cutoff = dayKey(days - 1);
      return analytics.reduce((sum, d) => (d.date >= cutoff ? sum + (d[field] as number) : sum), 0);
    };
    const total = (field: keyof AnalyticsDay) =>
      analytics.reduce((sum, d) => sum + (d[field] as number), 0);

    const visitorsTotal = total('visitors');
    const signupsTotal = total('signups');
    return {
      hasData: analytics.length > 0,
      visitorsToday: byDate.get(todayStr)?.visitors ?? 0,
      visitors7d: sumSince(7, 'visitors'),
      visitors30d: sumSince(30, 'visitors'),
      visitorsTotal,
      guestStartsTotal: total('guestStarts'),
      signupClicksTotal: total('signupClicks'),
      signupsTotal,
      // What share of all visitors became accounts. The headline number behind
      // "signups are stuck" — measure it instead of guessing.
      conversionPct: visitorsTotal > 0 ? Math.round((signupsTotal / visitorsTotal) * 1000) / 10 : 0,
      series,
      maxVisitors: Math.max(...series.map((s) => s.visitors), 1),
    };
  }, [analytics]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    try {
      const cred = await signInWithEmailAndPassword(getAuthInstance(), email.trim(), password);
      if (!isAdminEmail(cred.user.email)) {
        await signOut(getAuthInstance());
        setLoginError('This account is not allowed to access the admin dashboard.');
      }
    } catch (err) {
      console.error('Admin login failed:', err);
      setLoginError('Login failed. Check the admin email and password.');
    }
  };

  const maxRevenue = Math.max(...metrics.revenueByMonth.map((m) => m.cents), 1);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!authUser || !isAuthedAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white text-slate-950 border border-slate-200 rounded-lg p-6 shadow-xl">
          <div className="w-12 h-12 rounded-lg bg-slate-950 text-white flex items-center justify-center mb-5">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black">Admin Login</h1>
          <p className="text-sm text-slate-500 font-semibold mt-1">Vivid Lingua operations dashboard</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-950"
              />
            </div>
          </div>

          {loginError && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs font-bold flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full mt-5 bg-slate-950 text-white rounded-lg py-3 text-sm font-black hover:bg-slate-800 transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Vivid Lingua Admin</p>
            <h1 className="text-2xl font-black">Business Dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadDashboard}
              disabled={loading}
              className="px-3 py-2 bg-slate-950 text-white rounded-lg text-xs font-black flex items-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </button>
            <button
              onClick={() => signOut(getAuthInstance())}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black flex items-center gap-2 hover:bg-slate-50"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {dataError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm font-bold flex gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{dataError}</span>
          </div>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Customers" value={String(metrics.totalCustomers)} detail={`${metrics.active7d} active in the last 7 days`} icon={Users} tone="bg-teal-50 text-teal-700" />
          <KpiCard label="Gross Revenue" value={formatMoney(metrics.grossRevenueCents, metrics.currency)} detail={`${metrics.paidCustomers} paid customers`} icon={DollarSign} tone="bg-teal-50 text-teal-700" />
          <KpiCard label="MRR" value={formatMoney(metrics.mrrCents, metrics.currency)} detail={`${formatMoney(metrics.arpuCents, metrics.currency)} ARPU`} icon={CreditCard} tone="bg-amber-50 text-amber-700" />
          <KpiCard label="Engagement" value={`${metrics.avgProgress}%`} detail={`${metrics.active30d} active in the last 30 days`} icon={Activity} tone="bg-amber-50 text-amber-700" />
        </section>

        {/* Site traffic + signup funnel — how many people actually reach the
            site, and where they drop before creating an account. */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black">Site Traffic & Signup Funnel</h2>
              <p className="text-xs text-slate-500 font-semibold">
                Anonymous visitor counts (unique per browser/day) and how many convert to accounts
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-slate-400" />
          </div>

          {!traffic.hasData ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm font-semibold text-slate-500 flex gap-2">
              <Clock className="w-5 h-5 shrink-0 text-slate-400" />
              <span>No traffic recorded yet. Counts appear here as visitors arrive (tracking is live on every page load).</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
                <KpiCard label="Visitors Today" value={String(traffic.visitorsToday)} detail={`${traffic.visitors7d} in the last 7 days`} icon={TrendingUp} tone="bg-blue-50 text-blue-700" />
                <KpiCard label="Visitors (30d)" value={String(traffic.visitors30d)} detail={`${traffic.visitorsTotal} all time`} icon={Users} tone="bg-sky-50 text-sky-700" />
                <KpiCard label="Guest Tries" value={String(traffic.guestStartsTotal)} detail="entered the no-account guest mode" icon={Activity} tone="bg-amber-50 text-amber-700" />
                <KpiCard label="Signups" value={String(traffic.signupsTotal)} detail={`${traffic.signupClicksTotal} clicked sign up`} icon={UserPlus} tone="bg-emerald-50 text-emerald-700" />
                <KpiCard label="Visitor → Signup" value={`${traffic.conversionPct}%`} detail="of all visitors created an account" icon={UserCheck} tone="bg-violet-50 text-violet-700" />
              </div>

              {/* Daily visitors, last 14 days */}
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Daily visitors · last 14 days</p>
                <div className="h-40 flex items-end gap-1.5 border-b border-slate-200 pb-2">
                  {traffic.series.map((day) => (
                    <div key={day.date} className="flex-1 h-full flex flex-col justify-end items-center gap-1.5" title={`${day.date}: ${day.visitors} visitors`}>
                      <div className="text-[10px] font-black text-slate-500">{day.visitors || ''}</div>
                      <div
                        className="w-full rounded-t-md bg-blue-600 min-h-[2px]"
                        style={{ height: `${Math.max(2, (day.visitors / traffic.maxVisitors) * 120)}px` }}
                      />
                      <div className="text-[9px] font-bold text-slate-400">{day.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Funnel: where people drop between landing and account */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Visitors', value: traffic.visitorsTotal, tone: 'text-blue-700' },
                  { label: 'Guest tries', value: traffic.guestStartsTotal, tone: 'text-amber-700' },
                  { label: 'Signup clicks', value: traffic.signupClicksTotal, tone: 'text-sky-700' },
                  { label: 'Signups', value: traffic.signupsTotal, tone: 'text-emerald-700' },
                ].map((step, i, arr) => {
                  const prev = i > 0 ? arr[i - 1].value : 0;
                  const pct = i > 0 && prev > 0 ? Math.round((step.value / prev) * 100) : null;
                  return (
                    <div key={step.label} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{step.label}</p>
                      <p className={`mt-1 text-2xl font-black ${step.tone}`}>{step.value}</p>
                      {pct !== null && <p className="text-[11px] font-semibold text-slate-400">{pct}% of previous step</p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-black">Revenue Trend</h2>
                <p className="text-xs text-slate-500 font-semibold">Paid payment records, last 6 months</p>
              </div>
              <BarChart3 className="w-5 h-5 text-slate-400" />
            </div>
            <div className="h-64 flex items-end gap-3 border-b border-slate-200 pb-2">
              {metrics.revenueByMonth.map((month) => (
                <div key={month.key} className="flex-1 h-full flex flex-col justify-end items-center gap-2">
                  <div className="text-[11px] font-black text-slate-500">{formatMoney(month.cents, metrics.currency)}</div>
                  <div
                    className="w-full rounded-t-md bg-slate-950 min-h-[4px]"
                    style={{ height: `${Math.max(4, (month.cents / maxRevenue) * 190)}px` }}
                  />
                  <div className="text-xs font-bold text-slate-500">{month.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-black">Top Learners</h2>
                <p className="text-xs text-slate-500 font-semibold">Highest progress</p>
              </div>
              <TrendingUp className="w-5 h-5 text-slate-400" />
            </div>
            <div className="space-y-3">
              {topCustomers.map(({ id, profile }, index) => (
                <div key={id} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black">{index + 1}</span>
                  <img src={profile.avatar} alt="" className="w-9 h-9 rounded-full bg-slate-200" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black truncate">{profile.name}</p>
                    <p className="text-xs text-slate-500 font-semibold truncate">{profile.email}</p>
                  </div>
                  <span className="text-sm font-black">{profile.progress ?? 0}%</span>
                </div>
              ))}
              {topCustomers.length === 0 && <p className="text-sm font-semibold text-slate-500">No customers yet.</p>}
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black flex items-center gap-2">
                <Gift className="w-5 h-5 text-teal-500" />
                Free trial access (3-day Pro)
              </h2>
              <p className="text-xs text-slate-500 font-semibold">
                Who currently has free Pro access and why — auto-granted on signup or earned by an invite.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-black bg-teal-50 text-teal-700 px-2.5 py-1 rounded-md">
                <Clock className="w-3.5 h-3.5" /> {trialSummary.active} active
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-black bg-teal-50 text-teal-700 px-2.5 py-1 rounded-md">
                <UserPlus className="w-3.5 h-3.5" /> {trialSummary.signup} new signup
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-black bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md">
                <Gift className="w-3.5 h-3.5" /> {trialSummary.referral} invited
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Reason</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Days left</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Ends</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trialUsers.map(({ id, profile, trial }) => (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <img src={profile.avatar} alt="" className="w-10 h-10 rounded-full bg-slate-200" />
                        <div className="min-w-0">
                          <p className="font-black text-slate-950 truncate">{profile.name}</p>
                          <p className="text-xs text-slate-500 font-semibold truncate">{profile.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black ${
                        trial.reason === 'referral'
                          ? 'bg-amber-50 text-amber-700'
                          : trial.reason === 'signup'
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {trial.reason === 'referral' ? <Gift className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                        {trial.reasonLabel}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-black">
                      {trial.active ? `${trial.daysLeft} day${trial.daysLeft === 1 ? '' : 's'}` : '—'}
                    </td>
                    <td className="px-5 py-4 text-xs font-bold text-slate-600">
                      {trial.endsAt ? formatDate(trial.endsAt.toISOString()) : 'No end date'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-black px-2.5 py-1 rounded-md ${
                        trial.active ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {trial.active ? 'Active' : 'Expired'}
                      </span>
                    </td>
                  </tr>
                ))}
                {trialUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
                      No one is on a free trial right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-slate-400" />
                Paid &amp; promo customers
              </h2>
              <p className="text-xs text-slate-500 font-semibold">
                Everyone who bought full access or redeemed a promo code — paying customers first.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-black bg-teal-50 text-teal-700 px-2.5 py-1 rounded-md">
                <DollarSign className="w-3.5 h-3.5" /> {paidPromoSummary.paid} paid
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-black bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md">
                <Tag className="w-3.5 h-3.5" /> {paidPromoSummary.promo} promo code
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Plan</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Promo code</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">LTV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paidPromoUsers.map(({ id, profile, info }) => (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <img src={profile.avatar} alt="" className="w-10 h-10 rounded-full bg-slate-200" />
                        <div className="min-w-0">
                          <p className="font-black text-slate-950 truncate">{profile.name}</p>
                          <p className="text-xs text-slate-500 font-semibold truncate">{profile.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {info.paid && (
                          <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 px-2.5 py-1 rounded-md text-xs font-black">
                            <DollarSign className="w-3.5 h-3.5" /> Paid
                          </span>
                        )}
                        {info.usedPromo && (
                          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md text-xs font-black">
                            <Tag className="w-3.5 h-3.5" /> Promo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-black bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md">
                        {info.paid ? `${info.plan || 'Paid'} / ${profile.billing?.status ?? ''}` : 'Free'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {info.usedPromo ? (
                        <div className="text-xs font-bold text-slate-600">
                          <p className="font-black text-slate-950">{info.promoCode}</p>
                          <p>
                            {info.teacherName ?? '—'}
                            {info.discountPercent != null && ` · -${info.discountPercent}%`}
                          </p>
                          <p className={info.firstPaymentDone ? 'text-teal-600' : 'text-slate-400'}>
                            {info.firstPaymentDone ? 'Discount used' : 'Discount unused'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-black">
                      {formatMoney(info.ltvCents, profile.billing?.currency ?? metrics.currency)}
                    </td>
                  </tr>
                ))}
                {paidPromoUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
                      No paying or promo customers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black">Customers</h2>
              <p className="text-xs text-slate-500 font-semibold">
                {lastLoadedAt ? `Updated ${lastLoadedAt.toLocaleTimeString()}` : 'Ready'}
              </p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="Search customers"
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-950"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Level</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Progress</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Activity</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Plan</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">LTV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map(({ id, profile }) => (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <img src={profile.avatar} alt="" className="w-10 h-10 rounded-full bg-slate-200" />
                        <div className="min-w-0">
                          <p className="font-black text-slate-950 truncate">{profile.name}</p>
                          <p className="text-xs text-slate-500 font-semibold truncate">{profile.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 px-2.5 py-1 rounded-md text-xs font-black">
                        <GraduationCap className="w-3.5 h-3.5" />
                        {profile.targetLevel}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="w-32">
                        <div className="flex justify-between text-xs font-black mb-1">
                          <span>{profile.progress ?? 0}%</span>
                          <span>{profile.completedLessons ?? 0}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-950 rounded-full" style={{ width: `${profile.progress ?? 0}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                        <span className="inline-flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-orange-500" /> {profile.streak ?? 0} day streak</span>
                        <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> {totalStudyHours(profile).toFixed(1)} hours</span>
                        <span className="inline-flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5 text-slate-400" /> {formatDate(profile.lastActiveAt)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-black bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md">
                        {profile.billing?.plan ?? 'Free'} / {profile.billing?.status ?? 'free'}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-black">
                      {formatMoney(lifetimeValueCents(profile), profile.billing?.currency ?? metrics.currency)}
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
                      No customers match the current search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black flex items-center gap-2">
                <Tag className="w-5 h-5 text-slate-400" />
                Teachers / Promo codes
              </h2>
              <p className="text-xs text-slate-500 font-semibold">Багш нар, хямдрал, комиссын удирдлага</p>
            </div>
            <button
              onClick={loadPromo}
              disabled={promoLoading}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black flex items-center gap-2 hover:bg-slate-50 disabled:opacity-60 self-start md:self-auto"
            >
              {promoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Шинэчлэх
            </button>
          </div>

          {promoError && (
            <div className="mx-5 mt-5 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs font-bold flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{promoError}</span>
            </div>
          )}

          <form onSubmit={handleCreateCode} className="p-5 border-b border-slate-200 bg-slate-50/60">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Шинэ код үүсгэх</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Код</label>
                <input
                  value={createForm.code}
                  onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="BAGSH10"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-950"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Багш</label>
                <input
                  value={createForm.teacherName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, teacherName: e.target.value }))}
                  placeholder="Багшийн нэр"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-950"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Холбоо барих</label>
                <input
                  value={createForm.teacherContact}
                  onChange={(e) => setCreateForm((f) => ({ ...f, teacherContact: e.target.value }))}
                  placeholder="Сонголтоор"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-950"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Хямдрал %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={createForm.discountPercent}
                  onChange={(e) => setCreateForm((f) => ({ ...f, discountPercent: e.target.value }))}
                  placeholder="0–100"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-950"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Комисс %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={createForm.commissionPercent}
                  onChange={(e) => setCreateForm((f) => ({ ...f, commissionPercent: e.target.value }))}
                  placeholder="0–100"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-950"
                />
              </div>
            </div>

            {createError && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs font-bold flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={creating}
              className="mt-4 px-4 py-2.5 bg-slate-950 text-white rounded-lg text-sm font-black flex items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Код үүсгэх
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Code</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Багш</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Хямдрал %</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Комисс %</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Холбосон</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Төлсөн</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Өр (комисс)</th>
                  <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider">Идэвхтэй</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teacherCodes.map((tc) => {
                  const breakdown = commissionByCode.get(tc.code);
                  return (
                    <tr key={tc.code} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <span className="font-black bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md text-xs">{tc.code}</span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-950 truncate">{tc.teacherName}</p>
                        {tc.teacherContact && (
                          <p className="text-xs text-slate-500 font-semibold truncate">{tc.teacherContact}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 font-black">{tc.discountPercent}%</td>
                      <td className="px-5 py-4 font-black">{tc.commissionPercent}%</td>
                      <td className="px-5 py-4 font-bold text-slate-600">{tc.redeemCount}</td>
                      <td className="px-5 py-4 font-bold text-slate-600">{tc.paidConversions}</td>
                      <td className="px-5 py-4 font-black">
                        {formatMnt(tc.commissionAccruedCents)}
                        {breakdown && (breakdown.owedCents > 0 || breakdown.paidCents > 0) && (
                          <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                            өр {formatMnt(breakdown.owedCents)} · төлсөн {formatMnt(breakdown.paidCents)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleCode(tc.code, !tc.active)}
                          disabled={togglingCode === tc.code}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${tc.active ? 'bg-teal-500' : 'bg-slate-300'}`}
                          aria-label={tc.active ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${tc.active ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {teacherCodes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
                      {promoLoading ? 'Ачаалж байна…' : 'Одоогоор багшийн код алга байна.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
