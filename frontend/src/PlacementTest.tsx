import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Headphones, Edit3, Mic, Sparkles, ArrowRight, Volume2,
  Lock, Crown, Loader2, QrCode, CheckCircle2, X, Clock, TrendingUp,
} from 'lucide-react';
import {
  PLACEMENT_QUESTION_INDEX, PLACEMENT_TOTAL_QUESTIONS, PLACEMENT_RESULT_PRICE_MNT, SKILL_SEQUENCE,
  PlacementAnswer, PlacementQuestion, PlacementRecord, PlacementSkill,
  advanceDifficulty, pickQuestion, scorePlacement,
} from './placement';
import { getAuthInstance } from './firebase';

interface PlacementTestProps {
  isFounder: boolean;
  onFinish: (record: PlacementRecord) => void;
  onSkip: () => void;
}

type Phase = 'intro' | 'quiz' | 'paywall' | 'result';

const SKILL_META: Record<PlacementSkill, { label: string; icon: React.ReactNode }> = {
  read: { label: 'Унших', icon: <BookOpen className="w-4 h-4" /> },
  listen: { label: 'Сонсох', icon: <Headphones className="w-4 h-4" /> },
  write: { label: 'Бичих', icon: <Edit3 className="w-4 h-4" /> },
  speak: { label: 'Ярих', icon: <Mic className="w-4 h-4" /> },
};

// Сонсох асуултын герман бичвэрийг TTS-ээр уншуулна (бичвэрийг харуулахгүй).
function speakGerman(text: string) {
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch {
    // TTS байхгүй орчинд асуулт алгасагдахгүй — зөвхөн дуугүй үлдэнэ.
  }
}

interface BylInvoice {
  senderInvoiceNo: string;
  // Byl hosted payment page (QPay/SocialPay/Pocket).
  url?: string;
}

// Хөтөч санамсаргүй refresh хийгдсэн ч тестийн явц алдагдахгүйн тулд
// асуулт бүрийн дараа localStorage-д хадгална. Тест бүрэн дуусч profile-д
// бичигдмэгц устгана.
const STORAGE_KEY = 'vivid-placement-progress-v1';

interface SavedPlacementProgress {
  phase: 'quiz' | 'paywall' | 'result';
  levelIndex: number;
  streak: number;
  usedIds: string[];
  answers: PlacementAnswer[];
  questionId: string | null;
  elapsedSeconds: number;
  record: PlacementRecord | null;
}

function loadSavedProgress(): SavedPlacementProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedPlacementProgress;
    if (!Array.isArray(data.answers)) return null;
    if (data.phase === 'quiz') {
      // Асуултын сан шинэчлэгдэж id олдохгүй бол хуучин явцыг сэргээхгүй.
      if (!data.questionId || !PLACEMENT_QUESTION_INDEX.has(data.questionId)) return null;
    } else if (!data.record) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveProgress(snapshot: SavedPlacementProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Хадгалж чадаагүй ч (quota, private mode) тест хэвийн үргэлжилнэ.
  }
}

function clearSavedProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // үл тоомсорлоно
  }
}

export default function PlacementTest({ isFounder, onFinish, onSkip }: PlacementTestProps) {
  // Refresh-ийн дараа сэргээх хадгалсан явц. Тест дууссан (paywall/result)
  // төлвийг шууд сэргээнэ; дундаа байсан quiz-ийг танилцуулга дээрх
  // "Үргэлжлүүлэх" товчоор сэргээнэ.
  const [saved] = useState<SavedPlacementProgress | null>(loadSavedProgress);
  const [phase, setPhase] = useState<Phase>(saved && saved.phase !== 'quiz' ? saved.phase : 'intro');
  const [selected, setSelected] = useState<number | null>(null);
  const [record, setRecord] = useState<PlacementRecord | null>(saved && saved.phase !== 'quiz' ? saved.record : null);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);

  // Дасан зохицох төлөв: одоогийн түвшин (0=A1 … 5=C2), дараалсан зөвийн тоо,
  // ашигласан асуултууд, өгсөн хариултууд. Тест A1-ээс эхэлж, зөв хариулах
  // тусам шатаар хүндэрнэ.
  const levelIndexRef = useRef(0);
  const streakRef = useRef(0);
  const usedIdsRef = useRef<Set<string>>(new Set());
  const answersRef = useRef<PlacementAnswer[]>([]);
  const [question, setQuestion] = useState<PlacementQuestion | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);

  // Тестийн үргэлжилсэн хугацааны заалт (мм:сс).
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (phase !== 'quiz' || startedAt === null) return;
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase, startedAt]);
  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

  // Төлбөрийн төлөв (paywall шат)
  const [invoice, setInvoice] = useState<BylInvoice | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payMessage, setPayMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  const skillTotals = useMemo(() => record?.skillScores ?? null, [record]);

  const serveQuestion = (answered: number): PlacementQuestion | null => {
    const skill = SKILL_SEQUENCE[answered % SKILL_SEQUENCE.length];
    const next = pickQuestion(skill, levelIndexRef.current, usedIdsRef.current);
    if (next) usedIdsRef.current.add(next.id);
    return next;
  };

  const currentElapsed = () => (startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000));

  const persistQuiz = (q: PlacementQuestion | null, elapsed: number) => {
    saveProgress({
      phase: 'quiz',
      levelIndex: levelIndexRef.current,
      streak: streakRef.current,
      usedIds: [...usedIdsRef.current],
      answers: [...answersRef.current],
      questionId: q?.id ?? null,
      elapsedSeconds: elapsed,
      record: null,
    });
  };

  const persistRecord = (donePhase: 'paywall' | 'result', rec: PlacementRecord) => {
    saveProgress({
      phase: donePhase,
      levelIndex: levelIndexRef.current,
      streak: streakRef.current,
      usedIds: [...usedIdsRef.current],
      answers: [...answersRef.current],
      questionId: null,
      elapsedSeconds: currentElapsed(),
      record: rec,
    });
  };

  const startQuiz = () => {
    // Шинээр эхлэхэд дасан зохицох төлвийг тэглэж, хуучин хадгалсан явцыг дарж бичнэ.
    levelIndexRef.current = 0;
    streakRef.current = 0;
    usedIdsRef.current = new Set();
    answersRef.current = [];
    const first = serveQuestion(0);
    setAnsweredCount(0);
    setStartedAt(Date.now());
    setElapsedSeconds(0);
    setQuestion(first);
    setPhase('quiz');
    persistQuiz(first, 0);
  };

  // Хадгалсан явцаас үргэлжлүүлнэ (refresh эсвэл гарсны дараа). Цаг хэмжилт
  // завсарласан хугацааг оруулахгүйгээр өмнөх заалтаас үргэлжилнэ.
  const resumeQuiz = () => {
    if (!saved || saved.phase !== 'quiz' || !saved.questionId) return;
    const savedQuestion = PLACEMENT_QUESTION_INDEX.get(saved.questionId);
    if (!savedQuestion) return;
    levelIndexRef.current = saved.levelIndex;
    streakRef.current = saved.streak;
    usedIdsRef.current = new Set(saved.usedIds);
    answersRef.current = [...saved.answers];
    setAnsweredCount(saved.answers.length);
    setStartedAt(Date.now() - saved.elapsedSeconds * 1000);
    setElapsedSeconds(saved.elapsedSeconds);
    setQuestion(savedQuestion);
    setPhase('quiz');
  };

  const finishQuiz = () => {
    const scored = scorePlacement(answersRef.current);
    if (isFounder) {
      const unlockedRecord: PlacementRecord = { ...scored, unlocked: true, unlockedBy: 'founder' };
      setRecord(unlockedRecord);
      setPhase('result');
      persistRecord('result', unlockedRecord);
    } else {
      setRecord(scored);
      setPhase('paywall');
      persistRecord('paywall', scored);
    }
  };

  // Тест дуусч бичлэг profile-д хадгалагдах тул түр явцыг устгана.
  const completeAndExit = (rec: PlacementRecord) => {
    clearSavedProgress();
    onFinish(rec);
  };

  // Гарахын өмнө баталгаажуулсан: явц localStorage-д үлдсэн тул дараа үргэлжлүүлж болно.
  const quitTest = () => {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // TTS байхгүй орчин
    }
    setQuitConfirmOpen(false);
    onSkip();
  };

  const submitAnswer = () => {
    if (!question || selected === null) return;
    const correct = selected === question.correctIndex;
    answersRef.current.push({
      questionId: question.id,
      skill: question.skill,
      level: question.level,
      correct,
    });
    setSelected(null);

    // Дасан зохицох шилжилт: зөв бол түвшин аажмаар ахина, буруу бол буурна.
    const next = advanceDifficulty(levelIndexRef.current, streakRef.current, correct);
    levelIndexRef.current = next.levelIndex;
    streakRef.current = next.streak;

    const answered = answersRef.current.length;
    setAnsweredCount(answered);

    if (answered >= PLACEMENT_TOTAL_QUESTIONS) {
      finishQuiz();
      return;
    }

    const nextQuestion = serveQuestion(answered);
    if (!nextQuestion) {
      // Асуултын сан дууссан (онолын хувьд ховор) — байгаагаараа дүгнэнэ.
      finishQuiz();
      return;
    }
    setQuestion(nextQuestion);
    persistQuiz(nextQuestion, currentElapsed());
  };

  const startBylPayment = async () => {
    setPayLoading(true);
    setPayMessage(null);
    try {
      const token = await getAuthInstance().currentUser?.getIdToken();
      const response = await fetch('/api/payments/byl/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product: 'placement' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Төлбөр эхлүүлэхэд алдаа гарлаа.');
      setInvoice({ senderInvoiceNo: data.senderInvoiceNo, url: data.url });
      if (data.url) window.open(data.url, '_blank', 'noopener');
      setPayMessage({ type: 'info', text: 'Төлбөрийн хуудас нээгдлээ. Төлснийхөө дараа "Төлбөр шалгах" дарна уу.' });
    } catch (err: any) {
      setPayMessage({ type: 'error', text: err?.message || 'Төлбөр эхлүүлэхэд алдаа гарлаа.' });
    } finally {
      setPayLoading(false);
    }
  };

  const checkBylPayment = async () => {
    if (!invoice || !record) return;
    setPayLoading(true);
    setPayMessage(null);
    try {
      const token = await getAuthInstance().currentUser?.getIdToken();
      const response = await fetch(`/api/payments/byl/invoices/${encodeURIComponent(invoice.senderInvoiceNo)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Төлбөр шалгахад алдаа гарлаа.');
      if (data.paid || data.status === 'paid') {
        const unlockedRecord: PlacementRecord = { ...record, unlocked: true, unlockedBy: 'byl' };
        setRecord(unlockedRecord);
        setPhase('result');
        // Төлбөр баталгаажсаны дараа refresh хийгдсэн ч нээлт алдагдахгүй.
        persistRecord('result', unlockedRecord);
      } else {
        setPayMessage({ type: 'info', text: 'Төлбөр хараахан баталгаажаагүй байна. Төлснөөс хойш хэдэн секунд хүлээгээд дахин шалгана уу.' });
      }
    } catch (err: any) {
      setPayMessage({ type: 'error', text: err?.message || 'Төлбөр шалгахад алдаа гарлаа.' });
    } finally {
      setPayLoading(false);
    }
  };

  const shell = (content: React.ReactNode, footer?: React.ReactNode) => (
    <div className="fixed inset-0 bg-[#020205] z-[100] flex flex-col items-center justify-between pb-10 pt-6 px-4 md:px-12 animate-fade-in text-white overflow-y-auto">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>

      <header className="w-full max-w-[640px] flex flex-col gap-4 py-2 relative z-10">
        <div className="flex justify-between items-center w-full">
          <h1 className="text-2xl font-black font-space tracking-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Vivid</span> Lingua
          </h1>
          {phase === 'quiz' && (
            <span className="flex items-center gap-3 text-sm font-space text-slate-400 font-bold">
              <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4" /> {elapsedLabel}</span>
              {Math.min(answeredCount + 1, PLACEMENT_TOTAL_QUESTIONS)} / {PLACEMENT_TOTAL_QUESTIONS}
              <button
                onClick={() => setQuitConfirmOpen(true)}
                aria-label="Тестээс гарах"
                className="p-1.5 border border-white/10 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </span>
          )}
        </div>
        <div className="w-full h-2.5 bg-white/5 border border-white/10 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
            style={{ width: `${phase === 'intro' ? 2 : phase === 'quiz' ? Math.round((answeredCount / PLACEMENT_TOTAL_QUESTIONS) * 100) : 100}%` }}
          />
        </div>
      </header>

      <main className="flex-grow w-full max-w-[640px] flex flex-col justify-center py-8 relative z-10">
        <div className="animate-scale-up space-y-6">{content}</div>
      </main>

      {footer && <footer className="w-full max-w-[640px] flex gap-4 mt-4 relative z-10">{footer}</footer>}

      {quitConfirmOpen && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-[#0d0d16] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4 animate-scale-up">
            <h3 className="text-xl font-black font-space">Тестээс гарах уу?</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Таны хариулсан {answeredCount} асуултын явц хадгалагдсан тул дараа
              яг энэ асуултаас үргэлжлүүлж болно.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setQuitConfirmOpen(false)}
                className="flex-[2] bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3 px-4 hover:opacity-95 transition-all cursor-pointer"
              >
                Үргэлжлүүлэх
              </button>
              <button
                onClick={quitTest}
                className="flex-1 py-3 border border-white/10 hover:bg-white/5 rounded-xl font-bold transition-all text-slate-300 cursor-pointer"
              >
                Гарах
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // --- Танилцуулга -----------------------------------------------------------
  if (phase === 'intro') {
    return shell(
      <div className="space-y-6">
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400 mb-2">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl md:text-3xl font-black font-space">Түвшин тогтоох үнэлгээний тест</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Дөрвөн ур чадварыг бүгдийг шалгана: <b className="text-white">Унших · Сонсох · Бичих · Ярих</b> —
            нийт <b className="text-white">{PLACEMENT_TOTAL_QUESTIONS} асуулт</b>, ойролцоогоор{' '}
            <b className="text-white">40–50 минут</b>. Тест дасан зохицдог: зөв хариулах тусам асуулт
            аажмаар хүндэрч (A1 → C2), буруу хариулбал хөнгөрнө. Тиймээс яарах хэрэггүй — асуулт бүр
            дээр сайтар бодоорой. Мэдэхгүй зүйл таарвал санаа зовох хэрэггүй: тест таны бодит түвшнийг
            л хайж байгаа юм.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(SKILL_META) as PlacementSkill[]).map((s) => (
            <div key={s} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3 text-sm font-bold text-slate-300">
              <span className="text-purple-400">{SKILL_META[s].icon}</span>
              {SKILL_META[s].label}
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-4">
          <TrendingUp className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400 leading-relaxed">
            Тасалдуулахгүй, нэг дор өгөхөд хамгийн оновчтой. Сонсох асуултын бичлэгийг хэдэн ч удаа
            дахин тоглуулж болно.
          </p>
        </div>
        {saved?.phase === 'quiz' && (
          <button
            onClick={resumeQuiz}
            className="w-full flex items-center justify-between gap-3 bg-purple-950/40 border-2 border-purple-500/60 hover:bg-purple-950/60 rounded-xl p-4 transition-all cursor-pointer text-left"
          >
            <span className="text-sm font-bold text-white">
              Дуусгаагүй тест байна — {saved.answers.length}/{PLACEMENT_TOTAL_QUESTIONS} хариулсан. Үргэлжлүүлэх
              <span className="block text-xs text-slate-400 font-normal mt-0.5">
                «Тест эхлүүлэх» дарвал шинээр эхэлж, өмнөх явц устана.
              </span>
            </span>
            <ArrowRight className="w-5 h-5 text-purple-300 shrink-0" />
          </button>
        )}
      </div>,
      <>
        <button
          onClick={onSkip}
          className="flex-1 py-3.5 border border-white/10 hover:bg-white/5 rounded-xl font-bold transition-all text-slate-300 cursor-pointer"
        >
          Дараа өгөх
        </button>
        <button
          onClick={startQuiz}
          className="flex-[2] bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3.5 px-6 hover:opacity-95 shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          Тест эхлүүлэх <ArrowRight className="w-5 h-5" />
        </button>
      </>,
    );
  }

  // --- Асуултууд ---------------------------------------------------------------
  if (phase === 'quiz' && question) {
    return shell(
      <div className="space-y-5" data-question-id={question.id}>
        <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
          <span className="inline-flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1">
            {SKILL_META[question.skill].icon} {SKILL_META[question.skill].label}
          </span>
        </div>
        <p className="text-sm text-slate-400">{question.instruction}</p>

        {question.passage && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-[15px] leading-relaxed text-slate-100">
            {question.passage}
          </div>
        )}

        {question.audioText && (
          <button
            onClick={() => speakGerman(question.audioText!)}
            className="flex items-center gap-3 bg-white/5 border border-white/10 hover:border-purple-500/50 rounded-xl p-4 w-full text-left transition-all cursor-pointer"
          >
            <span className="w-11 h-11 flex items-center justify-center bg-gradient-to-r from-purple-500 to-blue-500 rounded-full shrink-0">
              <Volume2 className="w-5 h-5" />
            </span>
            <span className="text-sm font-bold text-slate-200">Сонсох (дахин дарж давтаж болно)</span>
          </button>
        )}

        <h2 className="text-lg md:text-xl font-black font-space">{question.question}</h2>

        <div className="grid grid-cols-1 gap-3">
          {question.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`text-left p-4 rounded-xl transition-all cursor-pointer text-[15px] ${
                selected === i
                  ? 'bg-purple-950/40 border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                  : 'bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10'
              }`}
            >
              {choice}
            </button>
          ))}
        </div>
      </div>,
      <button
        onClick={submitAnswer}
        disabled={selected === null}
        className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3.5 px-6 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
      >
        Дараах <ArrowRight className="w-5 h-5" />
      </button>,
    );
  }

  // --- Үр дүн түгжээтэй (төлбөрийн шат) ---------------------------------------
  if (phase === 'paywall' && record) {
    return shell(
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="inline-flex p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 mb-2">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl md:text-3xl font-black font-space">Тест дууслаа! 🎉</h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
            Таны дөрвөн ур чадварын үнэлгээ, CEFR түвшин бэлэн боллоо.
            Дэлгэрэнгүй үр дүнг нээж үзэхэд <b className="text-white">{PLACEMENT_RESULT_PRICE_MNT.toLocaleString()}₮</b>.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-300">Таны CEFR түвшин</span>
            <span className="text-2xl font-black font-space blur-sm select-none">B?</span>
          </div>
          {(Object.keys(SKILL_META) as PlacementSkill[]).map((s) => (
            <div key={s} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-400">{SKILL_META[s].icon} {SKILL_META[s].label}</span>
              <span className="blur-sm select-none font-bold">●●●</span>
            </div>
          ))}
        </div>

        {invoice ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center gap-3">
            {invoice.url && (
              <a
                href={invoice.url}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3 px-6 hover:opacity-95 transition-all flex items-center justify-center gap-2"
              >
                <QrCode className="w-5 h-5" /> Төлбөрийн хуудас нээх
              </a>
            )}
            <p className="text-xs text-slate-400 text-center">
              Хуудсан дээр QPay QR, SocialPay эсвэл Pocket-оор төлөх боломжтой.
            </p>
            <button
              onClick={checkBylPayment}
              disabled={payLoading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl py-3 px-6 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {payLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Төлбөр шалгах
            </button>
          </div>
        ) : (
          <button
            onClick={startBylPayment}
            disabled={payLoading}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3.5 px-6 disabled:opacity-50 hover:opacity-95 shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {payLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
            {PLACEMENT_RESULT_PRICE_MNT.toLocaleString()}₮ төлж нээх
          </button>
        )}

        {payMessage && (
          <p className={`text-sm text-center font-bold ${payMessage.type === 'error' ? 'text-red-400' : 'text-slate-300'}`}>
            {payMessage.text}
          </p>
        )}
      </div>,
      <button
        onClick={() => completeAndExit(record)}
        className="flex-1 py-3.5 border border-white/10 hover:bg-white/5 rounded-xl font-bold transition-all text-slate-400 cursor-pointer flex items-center justify-center gap-2"
      >
        <X className="w-4 h-4" /> Үр дүнг нээлгүй үргэлжлүүлэх
      </button>,
    );
  }

  // --- Нээгдсэн үр дүн ----------------------------------------------------------
  if (phase === 'result' && record && skillTotals) {
    return shell(
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          {record.unlockedBy === 'founder' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
              <Crown className="w-3.5 h-3.5" /> Founder — төлбөргүй нээгдлээ
            </span>
          )}
          <h2 className="text-2xl md:text-3xl font-black font-space">Таны түвшин</h2>
          <div className="text-7xl font-black font-space bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent py-2">
            {record.level}
          </div>
          <p className="text-slate-400 text-sm">
            Нийт {record.totalQuestions} асуултаас {record.totalCorrect} зөв. Сургалт таны түвшнээс эхэлнэ.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          {(Object.keys(SKILL_META) as PlacementSkill[]).map((s) => {
            const score = skillTotals[s];
            const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
            return (
              <div key={s} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-300 font-bold">{SKILL_META[s].icon} {SKILL_META[s].label}</span>
                  <span className="text-slate-400 font-mono text-xs">{score.correct}/{score.total}</span>
                </div>
                <div className="w-full h-2 bg-white/5 border border-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>,
      <button
        onClick={() => completeAndExit(record)}
        className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3.5 px-6 hover:opacity-95 shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
      >
        {record.level} түвшнээс суралцаж эхлэх <Sparkles className="w-5 h-5 text-yellow-300" />
      </button>,
    );
  }

  return null;
}
