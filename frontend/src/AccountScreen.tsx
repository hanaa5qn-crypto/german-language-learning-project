// =============================================================================
// AccountScreen — shared account profile + settings.
// -----------------------------------------------------------------------------
// One account-level screen used in two places, both writing the SAME
// `users/{uid}` profile so account data stays consistent across tracks:
//   • mode="setup"    — shown right after login, before the language chooser
//                       (the profile-first flow). Ends with "Continue".
//   • mode="settings" — opened from inside a track (e.g. the English Dashboard).
//                       Ends with a "switch language" affordance.
//
// Account-level fields only (name, avatar, daily goal, learning goal, email,
// password, subscription, log out) — track-specific stats live in each track's
// dashboard. Monochrome, matching the rest of the app.
// =============================================================================
import React, { useRef, useState } from 'react';
import {
  Camera, Upload, Shuffle, Check, Loader2, Mail, Lock, LogOut, Save,
  Target, Globe, ArrowRight, ArrowLeft, CreditCard,
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  UserProfile, avatarOptions, AVATAR_STYLES, DEFAULT_AVATAR_STYLE, AvatarStyleId,
} from './profiles';
import { saveProfileProgress, sendResetEmail } from './auth';
import { getAuthInstance, getStorageInstance, isFirebaseConfigured } from './firebase';
import { effectivePlan } from './plans';

const DAILY_GOALS = [5, 10, 15, 30, 60];

// Human label for the plan that ACTUALLY applies right now. Mirrors the
// dashboard BillingCard via effectivePlan() so founder access, expired trials
// and legacy records resolve the same way the rest of the app gates on — the
// raw billing.plan can lag (e.g. an expired trial still stores plan='pro').
function planLabel(profile: UserProfile): string {
  switch (effectivePlan(profile)) {
    case 'founder': return 'Founder';
    case 'max': return 'Max';
    case 'pro': return 'Pro';
    default: return 'Free';
  }
}

// Status badge matching the effective plan: free/founder are self-evident; a
// genuinely-active paid plan shows its real billing status (active/trialing).
function planStatus(profile: UserProfile): string {
  const plan = effectivePlan(profile);
  if (plan === 'founder') return 'founder';
  if (plan === 'free') return 'free';
  return (profile.billing?.status ?? 'active').toLowerCase();
}

interface AccountScreenProps {
  profile: UserProfile;
  /** Parent syncs its own copy of the profile after a successful save. */
  onSaved?: (next: UserProfile) => void;
  onLogout: () => void;
  /** settings mode: jump back to the language chooser. */
  onSwitchLanguage?: () => void;
  /** setup mode: proceed to the language chooser (saves first). */
  onContinue?: () => void;
  /** settings mode: close the overlay and return to the track. */
  onClose?: () => void;
  mode: 'setup' | 'settings';
  /** Optional CEFR goal-level picker (English track passes these; German omits). */
  goalLevels?: string[];
  /** Currently selected goal level (highlighted). */
  goalLevel?: string;
  /** Called when the learner taps a goal level. Persistence is the caller's job. */
  onGoalLevel?: (level: string) => void;
}

export default function AccountScreen({
  profile, onSaved, onLogout, onSwitchLanguage, onContinue, onClose, mode,
  goalLevels, goalLevel, onGoalLevel,
}: AccountScreenProps) {
  const [name, setName] = useState(profile.name ?? '');
  const [avatar, setAvatar] = useState(profile.avatar ?? '');
  const [dailyGoal, setDailyGoal] = useState(profile.dailyGoalMinutes ?? 15);
  const [learningGoal, setLearningGoal] = useState(profile.learningGoal ?? '');

  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyleId>(DEFAULT_AVATAR_STYLE);
  const [avatarPage, setAvatarPage] = useState(0);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const isGuest = !!profile.isGuest;
  const avatarKey = profile.email || profile.name || 'vivid';

  async function persist(): Promise<UserProfile | null> {
    const next: UserProfile = {
      ...profile,
      name: name.trim() || profile.name,
      avatar,
      dailyGoalMinutes: dailyGoal,
      learningGoal,
    };
    // Guests have no account to save to — keep the edits in memory only.
    if (isGuest) { onSaved?.(next); return next; }
    setSaving(true);
    setSaveError(false);
    try {
      await saveProfileProgress(next);
      onSaved?.(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return next;
    } catch {
      setSaveError(true);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleContinue() {
    // Only advance to the language chooser once the profile is saved, so a
    // failed write keeps the user here (with the error shown) instead of
    // silently dropping their setup edits.
    const saved = await persist();
    if (saved) onContinue?.();
  }

  // Settings mode: leaving auto-saves any edits (name, avatar, daily/learning
  // goal) so closing the overlay never silently discards them.
  async function handleClose() {
    await persist();
    onClose?.();
  }

  async function handleResetPassword() {
    if (!profile.email) return;
    try {
      await sendResetEmail(profile.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 4000);
    } catch {
      /* surfaced nowhere fatal — keep the screen usable */
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) { setAvatarError('PNG, JPG, WEBP, GIF зураг оруулна уу.'); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Зураг 5MB-аас бага байх ёстой.'); return; }
    if (!isFirebaseConfigured) { setAvatarError('Зураг оруулах боломжгүй байна.'); return; }
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const storage = getStorageInstance();
      const userId = getAuthInstance().currentUser?.uid;
      if (!userId) throw new Error('Not signed in');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const fileRef = ref(storage, `avatars/${userId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`);
      await uploadBytes(fileRef, file);
      setAvatar(await getDownloadURL(fileRef));
    } catch {
      setAvatarError('Зураг оруулж чадсангүй. Дахин оролдоно уу.');
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-paper font-sans flex flex-col">
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-10 space-y-6">
        {/* Settings mode: a back affordance to return to the track. */}
        {mode === 'settings' && onClose && (
          <button
            type="button"
            onClick={() => void handleClose()}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper-2 hover:text-paper"
          >
            <ArrowLeft className="w-4 h-4" /> Буцах
          </button>
        )}

        {/* Heading */}
        <div className="text-center space-y-2">
          <p className="text-[0.7rem] uppercase tracking-[0.28em] font-medium text-paper-3">Vivid Lingua</p>
          <h1 className="font-serif font-light tracking-tight text-3xl sm:text-4xl text-paper">
            {mode === 'setup' ? 'Профайлаа тохируулъя' : 'Профайл ба тохиргоо'}
          </h1>
          <p className="text-paper-2 text-sm">
            {mode === 'setup'
              ? 'Эхлэхээсээ өмнө мэдээллээ шалгаарай — дараа нь хэлээ сонгоно.'
              : 'Бүртгэлийн мэдээлэл хоёр хэлний хувьд адил хадгалагдана.'}
          </p>
        </div>

        {/* Profile card — avatar + name */}
        <section className="rounded-2xl bg-ink-raise border border-ink-line p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 text-paper">
            <Target className="w-5 h-5" />
            <h2 className="text-sm font-serif font-bold uppercase tracking-wide">Профайл</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-ink-2 border border-ink-line">
                {avatar
                  ? <img src={avatar} alt={name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full" />}
              </div>
              <button
                type="button"
                onClick={() => setShowAvatarPicker((v) => !v)}
                className="absolute -bottom-1 -right-1 p-1.5 bg-paper text-ink rounded-full border border-ink-line hover:bg-white"
                aria-label="Зураг солих"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[11px] font-bold uppercase text-paper-3 font-serif">Нэр</label>
              <input
                type="text"
                value={name}
                maxLength={30}
                onChange={(e) => setName(e.target.value)}
                placeholder="Таны нэр"
                className="w-full mt-1 px-3 py-2 bg-ink-2 border border-ink-line rounded-xl text-paper font-bold outline-none focus:border-paper/60"
              />
            </div>
          </div>

          {showAvatarPicker && (
            <div className="space-y-3 p-3 bg-ink-2 rounded-xl border border-ink-line">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase text-paper-3 font-serif">Зургаа сонгох эсвэл оруулах</span>
                <div className="flex items-center gap-2">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-paper text-ink border border-ink-line rounded-lg text-xs font-bold hover:bg-white disabled:opacity-50"
                  >
                    {avatarUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Зураг оруулах
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarPage((p) => p + 1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-ink-raise border border-ink-line rounded-lg text-xs font-bold hover:bg-ink-2"
                  >
                    <Shuffle className="w-3.5 h-3.5" /> Шинэчлэх
                  </button>
                </div>
              </div>
              {avatarError && <p className="text-[11px] text-paper-2 font-semibold">{avatarError}</p>}
              <div className="flex flex-wrap gap-1.5">
                {AVATAR_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setAvatarStyle(s.id); setAvatarPage(0); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-all ${
                      avatarStyle === s.id ? 'bg-paper text-ink border-paper' : 'bg-ink-raise border-ink-line text-paper hover:bg-ink-2'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {avatarOptions(avatarKey, avatarPage, avatarStyle).map((url) => {
                  const selected = avatar === url;
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setAvatar(url)}
                      className={`relative aspect-square rounded-xl overflow-hidden border cursor-pointer transition-all ${
                        selected ? 'border-paper ring-2 ring-paper/30' : 'border-ink-line hover:border-paper/60'
                      }`}
                    >
                      <img src={url} alt="avatar" className="w-full h-full object-cover bg-ink-raise" />
                      {selected && (
                        <span className="absolute top-0.5 right-0.5 bg-paper text-ink rounded-full p-0.5">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily goal */}
          <div>
            <label className="text-[11px] font-bold uppercase text-paper-3 font-serif">Өдрийн зорилго</label>
            <div className="grid grid-cols-5 gap-1.5 mt-1.5">
              {DAILY_GOALS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDailyGoal(m)}
                  className={`py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                    dailyGoal === m ? 'bg-paper text-ink border-paper' : 'bg-ink-2 border-ink-line text-paper hover:bg-ink-raise'
                  }`}
                >
                  {m}<span className="text-[9px]">мин</span>
                </button>
              ))}
            </div>
          </div>

          {/* Goal level (CEFR) — only when the track supplies levels (English). */}
          {goalLevels && goalLevels.length > 0 && (
            <div>
              <label className="text-[11px] font-bold uppercase text-paper-3 font-serif flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Зорилтот түвшин
              </label>
              <div className="grid grid-cols-6 gap-1.5 mt-1.5">
                {goalLevels.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => onGoalLevel?.(lvl)}
                    className={`py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                      goalLevel === lvl ? 'bg-paper text-ink border-paper' : 'bg-ink-2 border-ink-line text-paper hover:bg-ink-raise'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Learning goal */}
          <div>
            <label className="text-[11px] font-bold uppercase text-paper-3 font-serif">Суралцах зорилго</label>
            <textarea
              value={learningGoal}
              maxLength={280}
              rows={2}
              onChange={(e) => setLearningGoal(e.target.value)}
              placeholder="Жишээ: IELTS 7.0 авах"
              className="w-full mt-1 px-3 py-2 bg-ink-2 border border-ink-line rounded-xl text-paper text-sm outline-none focus:border-paper/60 resize-none"
            />
            <p className="text-right text-[10px] text-paper-3 mt-0.5">{learningGoal.length}/280</p>
          </div>

          {/* Save (settings mode keeps an explicit save; setup mode saves on Continue) */}
          {mode === 'settings' && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => void persist()}
                disabled={saving || !name.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-paper text-ink font-black rounded-xl hover:bg-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? 'Хадгалагдлаа' : 'Хадгалах'}
              </button>
              {saveError && <p className="text-center text-[11px] text-paper-2 font-semibold">Хадгалж чадсангүй. Дахин оролдоно уу.</p>}
            </div>
          )}
        </section>

        {/* Subscription summary (read-only — managed account-wide) */}
        <section className="rounded-2xl bg-ink-raise border border-ink-line p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2 text-paper">
            <CreditCard className="w-5 h-5" />
            <h2 className="text-sm font-serif font-bold uppercase tracking-wide">Багц</h2>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-ink-2 border border-ink-line px-4 py-3">
            <span className="text-sm font-bold text-paper">{planLabel(profile)}</span>
            <span className="text-[11px] text-paper-3 font-medium uppercase tracking-[0.15em]">
              {planStatus(profile)}
            </span>
          </div>
          <p className="text-[11px] text-paper-3 leading-relaxed">
            Багц нь бүртгэлийн хэмжээнд нэг л удаа тохируулагдана — Герман болон Англи хэсэгт адил хүчинтэй.
          </p>
        </section>

        {/* Account essentials */}
        <section className="rounded-2xl bg-ink-raise border border-ink-line p-5 sm:p-6 space-y-3">
          <h2 className="text-xs font-serif font-bold uppercase tracking-wide text-paper-3">Бүртгэл</h2>
          {profile.email && (
            <div className="flex items-center justify-between rounded-xl bg-ink-2 border border-ink-line px-4 py-3">
              <span className="flex items-center gap-2 min-w-0">
                <Mail className="w-4 h-4 text-paper-3 shrink-0" />
                <span className="text-sm font-bold text-paper truncate">{profile.email}</span>
              </span>
              <span className="text-[10px] text-paper-3 font-mono shrink-0 ml-2">Имэйл</span>
            </div>
          )}
          {profile.email && !isGuest && (
            <button
              type="button"
              onClick={() => void handleResetPassword()}
              className="w-full flex items-center justify-between rounded-xl bg-ink-2 border border-ink-line px-4 py-3 hover:bg-ink-raise"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-paper"><Lock className="w-4 h-4 text-paper-3" /> Нууц үг солих</span>
              <span className="text-[11px] text-paper-2 font-bold shrink-0 ml-2">{resetSent ? 'Имэйл илгээлээ ✓' : 'Имэйл авах'}</span>
            </button>
          )}
          {onSwitchLanguage && (
            <button
              type="button"
              onClick={onSwitchLanguage}
              className="w-full flex items-center justify-between rounded-xl bg-ink-2 border border-ink-line px-4 py-3 hover:bg-ink-raise"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-paper"><Globe className="w-4 h-4 text-paper-3" /> Хэл солих</span>
              <ArrowRight className="w-4 h-4 text-paper-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink-2 border border-ink-line text-paper-2 font-bold px-4 py-3 hover:bg-ink-raise hover:text-paper"
          >
            <LogOut className="w-4 h-4" /> Гарах
          </button>
        </section>

        {/* Setup mode: proceed to the language chooser */}
        {mode === 'setup' && (
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-paper text-ink font-black rounded-xl hover:bg-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Үргэлжлүүлэх <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {mode === 'setup' && saveError && (
          <p className="text-center text-[11px] text-paper-2 font-semibold">Хадгалж чадсангүй — дахин оролдоно уу.</p>
        )}
      </main>
    </div>
  );
}
