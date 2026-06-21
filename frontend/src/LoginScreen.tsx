import React, { useState } from 'react';
import {
  Mail, Lock, User as UserIcon, ArrowRight, ArrowLeft, Target, Sparkles,
  GraduationCap, Headphones, Loader2, AlertCircle, CheckCircle, Swords,
} from 'lucide-react';
import { signUpWithProfile, logInWithEmail, sendResetEmail } from './auth';
import { isFirebaseConfigured } from './firebase';
import { track } from './analytics';

type Mode = 'login' | 'signup';

// Turn raw Firebase error codes into friendly Mongolian messages.
function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/configuration-not-found':
    case 'auth/operation-not-allowed':
      return 'Firebase Authentication дээр Email/Password нэвтрэлтийг Enable хийгээгүй байна.';
    case 'auth/unauthorized-domain':
      return 'Энэ Vercel домэйн Firebase дээр зөвшөөрөгдөөгүй байна. Firebase Authentication → Settings → Authorized domains хэсэгт Vercel домэйноо нэмнэ үү.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key':
      return 'Firebase web config буруу байна. frontend/src/firebaseConfig.ts доторх apiKey болон projectId-оо шалгана уу.';
    case 'auth/invalid-email':
      return 'Зөв имэйл хаяг оруулна уу (жишээ: нэр@gmail.com).';
    case 'auth/email-already-in-use':
      return 'Энэ имэйл аль хэдийн бүртгэлтэй байна. Доорх "Нэвтрэх" хэсгээр орно уу.';
    case 'auth/weak-password':
      return 'Нууц үг хэт богино байна. Дор хаяж 6 тэмдэгт оруулна уу.';
    case 'auth/missing-password':
      return 'Нууц үгээ оруулна уу.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Имэйл эсвэл нууц үг буруу байна. Дахин шалгана уу.';
    case 'auth/too-many-requests':
      return 'Хэт олон оролдлого хийсэн байна. Түр хүлээгээд дахин оролдоно уу.';
    case 'auth/network-request-failed':
      return 'Сүлжээний алдаа гарлаа. Интернэт холболтоо шалгана уу.';
    case 'permission-denied':
      return 'Firestore зөвшөөрөл хаалттай байна. Firestore database үүсгэсэн эсэх болон firestore.rules publish хийсэн эсэхээ шалгана уу.';
    case 'failed-precondition':
      return 'Firestore database эсвэл индексийн тохиргоо дутуу байна. Firebase Console дээр Firestore Database үүсгэсэн эсэхээ шалгана уу.';
    case 'unavailable':
      return 'Firebase түр холбогдохгүй байна. Түр хүлээгээд дахин оролдоно уу.';
    default:
      return code ? `Алдаа гарлаа (${code}). Firebase тохиргоогоо шалгаад дахин оролдоно уу.` : 'Алдаа гарлаа. Дахин оролдоно уу.';
  }
}

// Урилгын линкээр (тулаан эсвэл referral) ирсэн зочинд харуулах контекст.
export interface InviteContext {
  kind: 'duel' | 'ref';
  challengerName?: string;
}

interface LoginScreenProps {
  inviteContext?: InviteContext;
  /** Optional: return to the marketing landing page. */
  onBack?: () => void;
}

/**
 * Full-screen sign up / log in screen backed by Firebase Authentication.
 * On success, App's auth listener picks up the new session and swaps this
 * screen out — so there's no success callback to wire up here.
 */
export default function LoginScreen({ inviteContext, onBack }: LoginScreenProps = {}) {
  // Урилгаар ирсэн зочин ихэвчлэн шинэ хэрэглэгч тул бүртгүүлэх горимоор эхэлнэ.
  const [mode, setMode] = useState<Mode>(inviteContext ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [level, setLevel] = useState('A1');
  const [goal, setGoal] = useState('Унших / Сургууль орон');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  const handleForgotPassword = async () => {
    setError('');
    setInfo('');
    if (!isFirebaseConfigured) {
      setError('Firebase тохиргоо хийгдээгүй байна. firebaseConfig.ts файлд тохиргоогоо оруулна уу.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Нууц үгээ сэргээхийн тулд эхлээд имэйл хаягаа оруулна уу.');
      return;
    }
    setResetLoading(true);
    try {
      await sendResetEmail(email);
      setInfo(`Нууц үг сэргээх холбоосыг ${email.trim()} хаяг руу илгээлээ. Имэйлээ (мөн спам хавтсаа) шалгаад, холбоос дээр дарж шинэ нууц үгээ тохируулна уу.`);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        setError('Энэ имэйл хаягаар бүртгэл олдсонгүй. Эхлээд "Бүртгүүлэх" хэсгээр бүртгүүлнэ үү.');
      } else {
        setError(friendlyAuthError(err));
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setInfo('');

    if (!isFirebaseConfigured) {
      setError('Firebase тохиргоо хийгдээгүй байна. firebaseConfig.ts файлд тохиргоогоо оруулна уу.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Зөв имэйл хаяг оруулна уу (жишээ: нэр@gmail.com).');
      return;
    }
    if (password.length < 6) {
      setError('Нууц үг дор хаяж 6 тэмдэгт байх ёстой.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Өөрийн нэрээ оруулна уу.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUpWithProfile(email, password, name, level, goal);
        track('signup'); // new account created → funnel conversion
      } else {
        await logInWithEmail(email, password);
      }
      // Success → App's auth listener unmounts this screen. Keep the button in
      // its loading state until that happens.
    } catch (err) {
      console.error('Authentication request failed:', err);
      setError(friendlyAuthError(err));
      setSubmitting(false);
    }
  };

  const isSignup = mode === 'signup';

  return (
    <div className="bg-background text-white font-sans min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden w-full select-none">
      {/* Glow ambient background effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-900/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-teal-900/10 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="w-full max-w-5xl relative z-10 my-8">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Нүүр хуудас
          </button>
        )}
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-black font-space tracking-tight mb-2 flex items-center justify-center gap-3">
            <img src="/favicon.svg" alt="" className="w-10 h-10 md:w-12 md:h-12" />
            <span><span className="text-primary">Vivid</span> Lingua</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-md mx-auto font-medium">
            Герман хэл сурах ухаалаг платформ. Бүртгүүлж нэвтэрснээр таны явц хадгалагдаж, аль ч төхөөрөмжөөс үргэлжлүүлэн суралцах боломжтой.
          </p>
        </div>

        {inviteContext && (
          <div className="max-w-2xl mx-auto mb-6 text-amber-200 text-sm font-bold bg-amber-950/40 p-4 rounded-xl border border-amber-500/40 flex items-start gap-3 animate-fade-in">
            <Swords className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-300" />
            <span>
              {inviteContext.kind === 'duel'
                ? `🎮 ${inviteContext.challengerName || 'Найз тань'} таныг герман хэлний тулаанд урьж байна — бүртгүүлээд яг ижил 10 асуултад хариулж өрсөлдөөрэй!`
                : '🎁 Найз тань таныг урьсан байна — бүртгүүлмэгц танд 3 өдрийн үнэгүй Pro эрх, та хоёуланд Streak Freeze шагнал очно!'}
            </span>
          </div>
        )}

        {!isFirebaseConfigured && (
          <div className="max-w-2xl mx-auto mb-6 text-amber-300 text-xs font-bold bg-amber-950/40 p-4 rounded-xl border border-amber-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>
              Firebase тохиргоо хараахан хийгдээгүй байна. <code className="text-teal-400 font-mono bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">frontend/src/firebaseConfig.ts</code> файлд
              Firebase project-ийнхээ тохиргоог оруулсны дараа бүртгэл, нэвтрэлт идэвхжинэ.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: value props */}
          <div className="lg:col-span-6 bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md block-shadow flex flex-col justify-center">
            <h2 className="text-xl font-extrabold mb-6 flex items-center gap-2 text-amber-300">
              <Sparkles className="w-5 h-5 text-amber-400" /> Яагаад бүртгүүлэх вэ?
            </h2>
            <ul className="space-y-5">
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <Target className="w-4.5 h-4.5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Таны явц хадгалагдана</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Streak, дуусгасан хичээл, ахиц бүгд автоматаар хадгалагдана.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-4.5 h-4.5 text-teal-300" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Аль ч төхөөрөмжөөс</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Утас, зөөврийн компьютер — хаанаас ч нэг бүртгэлээр үргэлжлүүлнэ.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
                  <Headphones className="w-4.5 h-4.5 text-teal-300" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Хувийн зөвлөмж</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Таны зорилгод тохирсон унших, сонсох, ярих, бичих дасгалууд.</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Right Column: auth form */}
          <div className="lg:col-span-6 bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md block-shadow flex flex-col justify-between">
            {/* Mode toggle */}
            <div className="flex bg-slate-900/60 border border-white/10 rounded-xl p-1 mb-6">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  !isSignup ? 'bg-primary text-on-primary' : 'text-slate-400 hover:text-white'
                }`}
              >
                Нэвтрэх
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  isSignup ? 'bg-primary text-on-primary' : 'text-slate-400 hover:text-white'
                }`}
              >
                Бүртгүүлэх
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Имэйл хаяг</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="нэр@gmail.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); setInfo(''); }}
                    className="w-full bg-slate-900 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-colors text-sm font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Нууц үг</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    placeholder="Дор хаяж 6 тэмдэгт"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); setInfo(''); }}
                    className="w-full bg-slate-900 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-colors text-sm font-semibold"
                  />
                </div>
                {!isSignup && (
                  <div className="flex justify-end mt-1.5">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                      className="text-xs font-bold text-amber-300 hover:text-amber-200 disabled:opacity-60 flex items-center gap-1.5"
                    >
                      {resetLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                      Нууц үгээ мартсан уу?
                    </button>
                  </div>
                )}
              </div>

              {isSignup && (
                <div className="space-y-4 pt-4 border-t border-white/5 animate-fade-in">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Таны нэр</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Бат, Номин..."
                        value={name}
                        onChange={(e) => { setName(e.target.value); setError(''); }}
                        className="w-full bg-slate-900 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-colors text-sm font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Зорилтот түвшин</label>
                      <select
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors text-sm font-semibold cursor-pointer"
                      >
                        <option value="A1">A1 (Анхан)</option>
                        <option value="A2">A2 (Суурь)</option>
                        <option value="B1">B1 (Дунд)</option>
                        <option value="B2">B2 (Ахисан дунд)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Суралцах чиглэл</label>
                      <select
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors text-sm font-semibold cursor-pointer"
                      >
                        <option value="Унших / Сургууль орон">Их сургууль / Шалгалт</option>
                        <option value="Ажил / Мэргэжил">Ажил / Мэргэжил</option>
                        <option value="Аялал / Сонирхол">Аялал / Сонирхол</option>
                        <option value="Ерөнхий сургалт">Ерөнхий сургалт</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-red-400 text-xs font-bold bg-red-950/40 p-3 rounded-lg border border-red-500/30 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="min-w-0 break-words">{error}</span>
                </div>
              )}

              {info && (
                <div className="text-teal-300 text-xs font-bold bg-teal-950/40 p-3 rounded-lg border border-teal-500/30 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {info}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary hover:bg-surface-tint disabled:opacity-60 disabled:cursor-not-allowed text-on-primary font-bold py-3.5 px-6 rounded-xl border border-primary/30 block-shadow transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-99 mt-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Түр хүлээнэ үү...</span>
                  </>
                ) : (
                  <>
                    <span>{isSignup ? 'Бүртгүүлээд нэвтрэх' : 'Нэвтрэх'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-500 pt-1">
                {isSignup ? 'Аль хэдийн бүртгэлтэй юу? ' : 'Шинэ хэрэглэгч үү? '}
                <button
                  type="button"
                  onClick={() => switchMode(isSignup ? 'login' : 'signup')}
                  className="text-amber-300 font-bold hover:text-amber-200"
                >
                  {isSignup ? 'Нэвтрэх' : 'Бүртгүүлэх'}
                </button>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
