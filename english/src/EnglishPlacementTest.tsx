// =============================================================================
// English track — adaptive CEFR placement test.
// -----------------------------------------------------------------------------
// Shown to new English learners on first entry (and re-takeable from the
// dashboard). An adaptive staircase over the study library's graded reading +
// listening questions estimates the learner's level (A1–C2). The result is
// free — it simply sets the English target level, which drives the dashboard's
// Today's Session, lesson path and personalized advice. Mirrors the German
// PlacementTest UX (intro → quiz → result) without the paid reveal.
// =============================================================================
import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen, Headphones, Volume2, ArrowRight, Sparkles, TrendingUp, X, Clock,
} from 'lucide-react';
import {
  EN_PLACEMENT_TOTAL, EN_PLACEMENT_SEQUENCE, pickEnglishPlacementQuestion,
  advanceDifficulty, scoreEnglishPlacement,
  type EnPlacementQuestion, type EnPlacementAnswer, type EnglishPlacementResult,
} from './englishLearning';

// Speak a listening prompt aloud (British English), without showing the text.
function speakEnglish(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch { /* TTS unavailable — question still answerable from the prompt. */ }
}

const SKILL_META = {
  read: { label: 'Reading · Унших', icon: <BookOpen className="w-4 h-4" /> },
  listen: { label: 'Listening · Сонсох', icon: <Headphones className="w-4 h-4" /> },
} as const;

export default function EnglishPlacementTest({
  onFinish, onSkip,
}: {
  onFinish: (result: EnglishPlacementResult) => void;
  onSkip: () => void;
}) {
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [question, setQuestion] = useState<EnPlacementQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [result, setResult] = useState<EnglishPlacementResult | null>(null);

  // Adaptive staircase state (0 = A1 … 5 = C2).
  const levelIndexRef = useRef(0);
  const streakRef = useRef(0);
  const usedIdsRef = useRef<Set<string>>(new Set());
  const answersRef = useRef<EnPlacementAnswer[]>([]);

  // Elapsed timer (mm:ss).
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase !== 'quiz' || startedAt === null) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase, startedAt]);
  const elapsedLabel = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  function nextQuestion(count: number) {
    const skill = EN_PLACEMENT_SEQUENCE[count % EN_PLACEMENT_SEQUENCE.length];
    const q = pickEnglishPlacementQuestion(skill, levelIndexRef.current, usedIdsRef.current)
      // If a skill is exhausted at every level, try the other skill before stopping.
      ?? pickEnglishPlacementQuestion(skill === 'read' ? 'listen' : 'read', levelIndexRef.current, usedIdsRef.current);
    if (!q) return null;
    usedIdsRef.current.add(q.id);
    return q;
  }

  function startQuiz() {
    levelIndexRef.current = 0;
    streakRef.current = 0;
    usedIdsRef.current = new Set();
    answersRef.current = [];
    setAnsweredCount(0);
    setSelected(null);
    const q = nextQuestion(0);
    setQuestion(q);
    setStartedAt(Date.now());
    setElapsed(0);
    setPhase('quiz');
    if (q?.skill === 'listen' && q.transcript) speakEnglish(q.transcript);
  }

  function submitAnswer() {
    if (question === null || selected === null) return;
    const correct = selected === question.correctIndex;
    answersRef.current.push({
      questionId: question.id, skill: question.skill, level: question.level, correct,
    });
    const next = advanceDifficulty(levelIndexRef.current, streakRef.current, correct);
    levelIndexRef.current = next.levelIndex;
    streakRef.current = next.streak;

    const count = answeredCount + 1;
    setAnsweredCount(count);
    setSelected(null);

    const q = count >= EN_PLACEMENT_TOTAL ? null : nextQuestion(count);
    if (!q) {
      const scored = scoreEnglishPlacement(answersRef.current);
      setResult(scored);
      setPhase('result');
      return;
    }
    setQuestion(q);
    if (q.skill === 'listen' && q.transcript) speakEnglish(q.transcript);
  }

  // ---- Intro --------------------------------------------------------------
  if (phase === 'intro') {
    return (
      <Shell onSkip={onSkip}>
        <div className="text-center max-w-xl mx-auto">
          <span className="inline-flex items-center gap-2 rounded-full bg-ink-2 border border-ink-line px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-paper-2">
            <Sparkles className="w-4 h-4" /> Түвшин тогтоох тест
          </span>
          <h1 className="text-3xl sm:text-4xl font-serif font-light tracking-tight text-paper mt-5">
            Find your English level
          </h1>
          <p className="text-paper-2 mt-3 leading-relaxed">
            Унших, сонсох {EN_PLACEMENT_TOTAL} асуултаар таны түвшинг A1-ээс C2 хүртэл тодорхойлно.
            Зөв хариулах тусам асуулт хүндэрч, бодит түвшинг чинь нарийн олно. Үр дүн нь
            үнэгүй — таны хичээлийн замыг тохируулна.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <button
              onClick={startQuiz}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-paper text-ink px-7 py-3 font-medium uppercase tracking-[0.15em] text-sm hover:bg-white"
            >
              Тест эхлүүлэх <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onSkip}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-line text-paper-2 hover:text-paper hover:border-paper/60 px-7 py-3 font-medium uppercase tracking-[0.15em] text-sm"
            >
              Дараа нь · түвшингээ өөрөө сонгох
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---- Result -------------------------------------------------------------
  if (phase === 'result' && result) {
    const pct = result.totalQuestions > 0
      ? Math.round((result.totalCorrect / result.totalQuestions) * 100) : 0;
    return (
      <Shell>
        <div className="text-center max-w-xl mx-auto">
          <span className="inline-flex items-center gap-2 rounded-full bg-ink-2 border border-ink-line px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-paper-2">
            <TrendingUp className="w-4 h-4" /> Таны түвшин
          </span>
          <div className="text-7xl font-serif font-light text-paper mt-6">{result.level}</div>
          <p className="text-paper-2 mt-3">
            {result.totalCorrect}/{result.totalQuestions} зөв ({pct}%). Энэ түвшнээр таны өдөр
            тутмын даалгавар, хичээлийн зам, зөвлөмжийг тохирууллаа.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-6 text-left">
            {(['read', 'listen'] as const).map((s) => {
              const sc = result.skillScores[s] ?? { correct: 0, total: 0 };
              const p = sc.total > 0 ? Math.round((sc.correct / sc.total) * 100) : 0;
              return (
                <div key={s} className="rounded-2xl bg-ink-raise border border-ink-line p-4">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-paper-3 font-medium">
                    {SKILL_META[s].icon} {SKILL_META[s].label}
                  </p>
                  <p className="text-xl font-serif font-light text-paper mt-1">{sc.correct}/{sc.total}</p>
                  <div className="w-full h-1.5 bg-ink-2 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-paper rounded-full" style={{ width: `${p}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => onFinish(result)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-paper text-ink px-8 py-3 font-medium uppercase tracking-[0.15em] text-sm hover:bg-white mt-8"
          >
            Сургалт руу орох <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Shell>
    );
  }

  // ---- Quiz ---------------------------------------------------------------
  if (phase === 'quiz' && question) {
    const progress = Math.round((answeredCount / EN_PLACEMENT_TOTAL) * 100);
    return (
      <Shell onSkip={onSkip}>
        <div className="max-w-2xl mx-auto">
          {/* Progress + timer */}
          <div className="flex items-center justify-between text-xs text-paper-2 mb-3">
            <span className="flex items-center gap-1.5 uppercase tracking-[0.15em] font-medium">
              {SKILL_META[question.skill].icon} {SKILL_META[question.skill].label}
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {elapsedLabel}</span>
              <span>{answeredCount + 1} / {EN_PLACEMENT_TOTAL}</span>
            </span>
          </div>
          <div className="w-full h-1.5 bg-ink-2 rounded-full overflow-hidden mb-6">
            <div className="h-full bg-paper rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>

          {/* Reading passage, or a listen button for listening */}
          {question.skill === 'read' && question.passage && (
            <div className="rounded-2xl bg-ink-raise border border-ink-line p-5 mb-5 max-h-64 overflow-y-auto">
              <p className="text-paper-2 text-sm leading-relaxed whitespace-pre-line">{question.passage}</p>
            </div>
          )}
          {question.skill === 'listen' && question.transcript && (
            <button
              onClick={() => speakEnglish(question.transcript!)}
              className="inline-flex items-center gap-2 rounded-full bg-ink-2 border border-ink-line text-paper px-5 py-2.5 text-sm font-medium hover:bg-ink-raise mb-5"
            >
              <Volume2 className="w-4 h-4" /> Дахин сонсох
            </button>
          )}

          <h2 className="text-lg font-medium text-paper mb-4">{question.question}</h2>
          <div className="space-y-2.5">
            {question.choices.map((choice, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                  selected === i
                    ? 'bg-paper text-ink border-paper font-medium'
                    : 'bg-ink-raise border-ink-line text-paper hover:border-paper/50'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>

          <button
            onClick={submitAnswer}
            disabled={selected === null}
            className="w-full mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-paper text-ink px-7 py-3 font-medium uppercase tracking-[0.15em] text-sm hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {answeredCount + 1 >= EN_PLACEMENT_TOTAL ? 'Дуусгах' : 'Дараагийнх'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Shell>
    );
  }

  return null;
}

// Full-screen monochrome shell consistent with the rest of the English track.
function Shell({ children, onSkip }: { children: React.ReactNode; onSkip?: () => void }) {
  return (
    <div className="fixed inset-0 z-[150] bg-ink text-paper font-sans overflow-y-auto">
      <div className="min-h-full flex flex-col">
        {onSkip && (
          <div className="flex justify-end p-4">
            <button
              onClick={onSkip}
              className="inline-flex items-center gap-1.5 text-xs text-paper-3 hover:text-paper uppercase tracking-[0.15em]"
            >
              Алгасах <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center px-4 py-10">{children}</div>
      </div>
    </div>
  );
}
