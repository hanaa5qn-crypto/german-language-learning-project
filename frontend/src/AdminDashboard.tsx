import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, BarChart3, Clock, CreditCard, DollarSign,
  Flame, GraduationCap, Loader2, LogOut, RefreshCw, Search, ShieldCheck,
  TrendingUp, UserCheck, Users
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
  paymentAmountCents,
  isPaidPayment,
  monthlyValueCents,
  lifetimeValueCents,
} from './adminMetrics';

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
  const [dataError, setDataError] = useState('');
  const [queryText, setQueryText] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

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
      const [userSnap, paymentSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'payments')).catch(() => null),
      ]);

      setCustomers(userSnap.docs.map((doc) => ({ id: doc.id, profile: doc.data() as UserProfile })));
      setPayments(paymentSnap ? paymentSnap.docs.map((doc) => doc.data() as PaymentRecord) : []);
      setLastLoadedAt(new Date());
    } catch (err) {
      console.error('Admin dashboard load failed:', err);
      setDataError('Could not load dashboard data. Check that your admin email is allowlisted in Firestore rules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthedAdmin) loadDashboard();
  }, [isAuthedAdmin]);

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
          <KpiCard label="Customers" value={String(metrics.totalCustomers)} detail={`${metrics.active7d} active in the last 7 days`} icon={Users} tone="bg-blue-50 text-blue-700" />
          <KpiCard label="Gross Revenue" value={formatMoney(metrics.grossRevenueCents, metrics.currency)} detail={`${metrics.paidCustomers} paid customers`} icon={DollarSign} tone="bg-emerald-50 text-emerald-700" />
          <KpiCard label="MRR" value={formatMoney(metrics.mrrCents, metrics.currency)} detail={`${formatMoney(metrics.arpuCents, metrics.currency)} ARPU`} icon={CreditCard} tone="bg-violet-50 text-violet-700" />
          <KpiCard label="Engagement" value={`${metrics.avgProgress}%`} detail={`${metrics.active30d} active in the last 30 days`} icon={Activity} tone="bg-amber-50 text-amber-700" />
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
                      <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-xs font-black">
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
      </main>
    </div>
  );
}
