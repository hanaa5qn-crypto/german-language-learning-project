// =============================================================================
// IELTS — Listening practice tab.
// -----------------------------------------------------------------------------
// Reuses the shared LISTENING_LIBRARY. Plays transcripts aloud with the shared
// Azure neural TTS helper using the British voice 'en-GB-SoniaNeural' (the IELTS
// listening register), offers a reveal-transcript toggle, and grades MCQs.
// =============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  Headphones, Play, Pause, Eye, EyeOff, ListChecks, RotateCcw, ChevronLeft,
} from 'lucide-react';
import { LISTENING_LIBRARY } from '../../content';
import { playTts, pauseTts, resumeTts, stopTts, type TtsState } from '../../../../frontend/src/utils/tts';
import { ListeningItem, EnglishLevel } from '../../types';
import { McqBlock, LevelFilter, ScoreBanner, IELTS_LEVELS, isFreeLessonLocked, LockBadge } from './quizKit';
import { useEnglishStats } from '../../stats';
import { enActivityKey } from '../../englishLearning';

// British neural voice — the IELTS listening register.
const LISTEN_OPTS = { lang: 'en-GB', voice: 'en-GB-SoniaNeural', rate: 0.92 } as const;

export default function IeltsListeningTab({ allContent, onUpgrade }: { allContent: boolean; onUpgrade: () => void }) {
  const { recordStudy, recordEnglishActivity } = useEnglishStats();
  // Free accounts start on the unlocked A1 level; paid users keep the academic default.
  const [level, setLevel] = useState<EnglishLevel | 'all'>(allContent ? 'B2' : 'A1');
  const [active, setActive] = useState<ListeningItem | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  // Playback state — drives the play / pause / resume / replay control.
  const [ttsState, setTtsState] = useState<TtsState>('idle');

  // Never leave audio running when the tab unmounts (navigated away / closed).
  useEffect(() => () => stopTts(), []);

  const sections = useMemo(() => {
    const pool = LISTENING_LIBRARY.filter((p) => IELTS_LEVELS.includes(p.level));
    return level === 'all' ? pool : pool.filter((p) => p.level === level);
  }, [level]);

  function open(item: ListeningItem) {
    stopTts();
    setActive(item);
    setAnswers({});
    setSubmitted(false);
    setShowTranscript(false);
    setTtsState('idle');
  }

  function playListen(text: string) {
    playTts(text, { ...LISTEN_OPTS, onState: setTtsState });
  }

  function reset() {
    setAnswers({});
    setSubmitted(false);
  }

  const correctCount = active
    ? active.questions.reduce((n, q) => n + (answers[q.id] === q.correctIndex ? 1 : 0), 0)
    : 0;
  const allAnswered = active ? active.questions.every((q) => answers[q.id] !== undefined) : false;

  if (active) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <button
          onClick={() => { stopTts(); setActive(null); }}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper-2 hover:text-paper"
        >
          <ChevronLeft className="w-4 h-4" /> Бүх дасгал руу буцах
        </button>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-ink-2 text-paper px-2.5 py-0.5 text-xs font-bold">
              {active.level}
            </span>
            <span className="text-xs text-paper-2">{active.topic}</span>
          </div>
          <h2 className="text-2xl font-serif font-light tracking-tight text-paper">{active.title}</h2>
        </div>

        <div className="rounded-2xl bg-ink-raise p-5 space-y-4">
          <p className="text-paper-2 text-sm">
            Аудиог сонсоод асуултад хариулна уу. Эхлээд бичвэрийг харалгүй сонсож үзээрэй.
          </p>
          <div className="flex flex-wrap gap-3">
            {ttsState === 'playing' ? (
              <button
                onClick={pauseTts}
                className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-5 py-2.5 font-bold"
              >
                <Pause className="w-4 h-4" /> Түр зогсоох
              </button>
            ) : (
              <button
                onClick={() => (ttsState === 'paused' ? resumeTts() : playListen(active.transcript))}
                className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-5 py-2.5 font-bold"
              >
                <Play className="w-4 h-4" /> {ttsState === 'paused' ? 'Үргэлжлүүлэх' : 'Аудио тоглуулах'}
              </button>
            )}
            <button
              onClick={() => playListen(active.transcript)}
              className="inline-flex items-center gap-2 rounded-full bg-ink-2 text-paper px-5 py-2.5 font-semibold hover:bg-ink-raise"
            >
              <RotateCcw className="w-4 h-4" /> Эхнээс
            </button>
            <button
              onClick={() => setShowTranscript((s) => !s)}
              className="inline-flex items-center gap-2 rounded-full bg-ink-2 text-paper px-5 py-2.5 font-semibold hover:bg-ink-raise"
            >
              {showTranscript ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showTranscript ? 'Бичвэр нуух' : 'Бичвэр харах'}
            </button>
          </div>
          {showTranscript && (
            <article className="rounded-xl bg-ink-2 p-4 leading-relaxed whitespace-pre-line text-paper">
              {active.transcript}
            </article>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-paper">
            <ListChecks className="w-5 h-5 text-paper" /> Асуултууд
          </h3>
          {active.questions.map((q, i) => (
            <McqBlock
              key={q.id}
              q={q}
              index={i}
              selected={answers[q.id]}
              submitted={submitted}
              onPick={(choice) => setAnswers((prev) => ({ ...prev, [q.id]: choice }))}
            />
          ))}
        </div>

        {submitted ? (
          <div className="space-y-3">
            <ScoreBanner correct={correctCount} total={active.questions.length} />
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-full bg-ink-2 text-paper px-5 py-2.5 font-semibold hover:bg-ink-raise"
            >
              <RotateCcw className="w-4 h-4" /> Дахин оролдох
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setSubmitted(true);
              recordStudy();
              if (active) {
                const pass = active.questions.length > 0 && correctCount / active.questions.length >= 0.6;
                recordEnglishActivity(enActivityKey('listen', active.id), pass);
              }
            }}
            disabled={!allAnswered}
            className="rounded-full bg-paper text-ink px-6 py-3 font-bold disabled:opacity-40"
          >
            Хариуг шалгах
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-light tracking-tight text-paper flex items-center gap-2">
          <Headphones className="w-6 h-6 text-paper" /> Listening practice
        </h2>
        <p className="text-paper-2 mt-1">
          Британи хүний хоолойгоор уншсан аудиог сонсоод асуултад хариулаарай.
        </p>
      </div>

      <LevelFilter levels={IELTS_LEVELS} active={level} onChange={setLevel} />

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((p) => {
          const locked = isFreeLessonLocked(allContent, p.level);
          return (
            <button
              key={p.id}
              onClick={() => (locked ? onUpgrade() : open(p))}
              className={`text-left rounded-2xl bg-ink-raise hover:bg-ink-2 p-5 transition-colors ${locked ? 'opacity-80' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-full bg-ink-2 text-paper px-2.5 py-0.5 text-xs font-bold">
                  {p.level}
                </span>
                <span className="text-xs text-paper-2">{p.topic}</span>
                {locked && <span className="ml-auto"><LockBadge /></span>}
              </div>
              <h3 className="font-bold text-paper">{p.title}</h3>
              <p className="text-sm text-paper-2 mt-1">{locked ? 'Pro-оор нээх' : `${p.questions.length} асуулт`}</p>
            </button>
          );
        })}
      </div>

      {sections.length === 0 && (
        <p className="text-paper-2">Энэ түвшинд дасгал алга байна.</p>
      )}
    </div>
  );
}
