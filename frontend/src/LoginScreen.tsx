import React, { useState } from 'react';
import {
  Mail, Lock, User as UserIcon, ArrowRight, Target, Sparkles,
  GraduationCap, Headphones, Loader2, AlertCircle, CheckCircle,
} from 'lucide-react';
import { signUpWithProfile, logInWithEmail, sendResetEmail } from './auth';
import { isFirebaseConfigured } from './firebase';

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

/**
 * Full-screen sign up / log in screen backed by Firebase Authentication.
 * On success, App's auth listener picks up the new session and swaps this
 * screen out — so there's no success callback to wire up here.
 */
export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
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
    <div className="bg-[#020205] text-white font-sans min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden w-full select-none">
      {/* Glow ambient background effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="w-full max-w-5xl relative z-10 my-8">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-black font-space tracking-tight mb-2">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Vivid</span> Lingua
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-md mx-auto font-medium">
            Герман хэл сурах ухаалаг платформ. Бүртгүүлж нэвтэрснээр таны явц хадгалагдаж, аль ч төхөөрөмжөөс үргэлжлүүлэн суралцах боломжтой.
          </p>
        </div>

        {!isFirebaseConfigured && (
          <div className="max-w-2xl mx-auto mb-6 text-amber-300 text-xs font-bold bg-amber-950/40 p-4 rounded-xl border border-amber-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>
              Firebase тохиргоо хараахан хийгдээгүй байна. <code className="text-amber-200">frontend/src/firebaseConfig.ts</code> файлд
              Firebase project-ийнхээ тохиргоог оруулсны дараа бүртгэл, нэвтрэлт идэвхжинэ.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: value props */}
          <div className="lg:col-span-6 bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md block-shadow flex flex-col justify-center">
            <h2 className="text-xl font-extrabold mb-6 flex items-center gap-2 text-purple-300">
              <Sparkles className="w-5 h-5 text-purple-400" /> Яагаад бүртгүүлэх вэ?
            </h2>
            <ul className="space-y-5">
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  <Target className="w-4.5 h-4.5 text-purple-300" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Таны явц хадгалагдана</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Streak, дуусгасан хичээл, ахиц бүгд автоматаар хадгалагдана.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-4.5 h-4.5 text-blue-300" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Аль ч төхөөрөмжөөс</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Утас, зөөврийн компьютер — хаанаас ч нэг бүртгэлээр үргэлжлүүлнэ.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                  <Headphones className="w-4.5 h-4.5 text-emerald-300" />
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
                  !isSignup ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Нэвтрэх
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  isSignup ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white' : 'text-slate-400 hover:text-white'
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
                    className="w-full bg-slate-900 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-sm font-semibold"
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
                    className="w-full bg-slate-900 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-sm font-semibold"
                  />
                </div>
                {!isSignup && (
                  <div className="flex justify-end mt-1.5">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                      className="text-xs font-bold text-purple-300 hover:text-purple-200 disabled:opacity-60 flex items-center gap-1.5"
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
                        className="w-full bg-slate-900 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-sm font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Зорилтот түвшин</label>
                      <select
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm font-semibold cursor-pointer"
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
                        className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm font-semibold cursor-pointer"
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
                <div className="text-emerald-300 text-xs font-bold bg-emerald-950/40 p-3 rounded-lg border border-emerald-500/30 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {info}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-xl border border-white/10 block-shadow transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-99 mt-2"
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
                  className="text-purple-300 font-bold hover:text-purple-200"
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
