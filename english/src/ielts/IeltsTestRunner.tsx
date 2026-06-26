// =============================================================================
// IELTS — interactive test player.
// -----------------------------------------------------------------------------
// Renders a full IeltsTest (Reading / Listening / Writing / Speaking) as a
// playable practice experience: per-type answer inputs, case-insensitive
// grading, estimated band scores via ieltsBandScore, TTS playback for listening
// transcripts and speaking sample answers, and a live word counter for writing.
// =============================================================================
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, BookOpen, Headphones, Edit3, Mic, Volume2, VolumeX,
  CheckCircle2, XCircle, Award, Eye, EyeOff, ClipboardCheck, RotateCcw,
} from 'lucide-react';
import {
  IeltsTest, IeltsQuestion, IeltsQuestionType,
  IeltsReadingPassage, IeltsListeningSection,
} from '../types';
import { ieltsBandScore } from './ieltsTests';
import { speak as neuralSpeak, stopSpeaking } from '../audio';
import { useEnglishStats } from '../stats';

// ---- Paper navigation ------------------------------------------------------
type Paper = 'reading' | 'listening' | 'writing' | 'speaking';

const PAPERS: { key: Paper; label: string; icon: React.ElementType }[] = [
  { key: 'reading', label: 'Reading', icon: BookOpen },
  { key: 'listening', label: 'Listening', icon: Headphones },
  { key: 'writing', label: 'Writing', icon: Edit3 },
  { key: 'speaking', label: 'Speaking', icon: Mic },
];

// ---- TTS helpers -----------------------------------------------------------
// Use the shared Azure neural-TTS helper (human voice, falls back to the browser
// synth). A British voice suits the IELTS listening register. stopSpeaking is
// re-exported from the shared module above.
function speak(text: string, rate = 0.95) {
  void neuralSpeak(text, { voice: 'en-GB-SoniaNeural', rate });
}

// ---- Grading ---------------------------------------------------------------
// Normalise for case-insensitive, whitespace-tolerant comparison.
function norm(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}
// A question is correct if the learner's response matches the answer (or any
// accepted alternative when answer is a string[]).
function isCorrect(q: IeltsQuestion, response: string | undefined): boolean {
  if (response === undefined || norm(response) === '') return false;
  const accepted = Array.isArray(q.answer) ? q.answer : [q.answer];
  return accepted.some((a) => norm(a) === norm(response));
}

// Friendly label for each question type (shown as a small tag).
const TYPE_LABEL: Record<IeltsQuestionType, string> = {
  'multiple-choice': 'Multiple choice',
  'true-false-notgiven': 'True / False / Not Given',
  'yes-no-notgiven': 'Yes / No / Not Given',
  'matching-headings': 'Matching headings',
  'matching-information': 'Matching information',
  'sentence-completion': 'Sentence completion',
  'summary-completion': 'Summary completion',
  'short-answer': 'Short answer',
  'note-completion': 'Note completion',
};

const TFNG_OPTIONS = ['True', 'False', 'Not Given'];
const YNNG_OPTIONS = ['Yes', 'No', 'Not Given'];

// Which question types use a single fixed dropdown rather than passage options.
function fixedDropdownOptions(type: IeltsQuestionType): string[] | null {
  if (type === 'true-false-notgiven') return TFNG_OPTIONS;
  if (type === 'yes-no-notgiven') return YNNG_OPTIONS;
  return null;
}
function isRadioType(type: IeltsQuestionType): boolean {
  return type === 'multiple-choice';
}
function isMatchingType(type: IeltsQuestionType): boolean {
  return type === 'matching-headings' || type === 'matching-information';
}

// ---- Single question renderer ---------------------------------------------
const QuestionInput: React.FC<{
  q: IeltsQuestion;
  index: number;
  value: string | undefined;
  submitted: boolean;
  onChange: (v: string) => void;
}> = ({
  q, index, value, submitted, onChange,
}) => {
  const correct = isCorrect(q, value);
  const accepted = Array.isArray(q.answer) ? q.answer : [q.answer];
  const fixed = fixedDropdownOptions(q.type);

  // Choose the control based on the question type.
  let control: React.ReactNode;
  if (isRadioType(q.type) && q.options && q.options.length > 0) {
    // Radios for multiple-choice.
    control = (
      <div className="grid gap-2">
        {q.options.map((opt, oi) => {
          const picked = value === opt;
          return (
            <label
              key={oi}
              className={[
                'flex items-start gap-3 rounded-xl border px-4 py-2.5 cursor-pointer transition-colors',
                submitted && norm(opt) === norm(accepted[0]) ? 'border-paper/60 bg-paper text-ink' :
                submitted && picked ? 'border-ink-line bg-ink-2 text-paper-2' :
                picked ? 'border-paper bg-ink-2 text-paper' :
                'border-ink-line hover:border-paper/60',
              ].join(' ')}
            >
              <input
                type="radio"
                name={`q-${q.id}`}
                className="mt-1 accent-primary"
                checked={picked}
                disabled={submitted}
                onChange={() => onChange(opt)}
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
    );
  } else if (fixed) {
    // Dropdown for True/False/Not Given and Yes/No/Not Given.
    control = (
      <select
        value={value ?? ''}
        disabled={submitted}
        onChange={(e) => onChange(e.target.value)}
        className="w-full sm:w-64 rounded-xl bg-ink-raise border border-ink-line px-3 py-2.5 text-paper disabled:opacity-70"
      >
        <option value="">— select —</option>
        {fixed.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  } else if (isMatchingType(q.type) && q.options && q.options.length > 0) {
    // Select for matching-headings / matching-information.
    control = (
      <select
        value={value ?? ''}
        disabled={submitted}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-ink-raise border border-ink-line px-3 py-2.5 text-paper disabled:opacity-70"
      >
        <option value="">— select —</option>
        {q.options.map((opt, oi) => (
          <option key={oi} value={opt}>{opt}</option>
        ))}
      </select>
    );
  } else {
    // Text input for completion / short-answer types.
    control = (
      <input
        type="text"
        value={value ?? ''}
        disabled={submitted}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your answer…"
        className="w-full sm:w-80 rounded-xl bg-ink-raise border border-ink-line px-3 py-2.5 text-paper disabled:opacity-70"
      />
    );
  }

  return (
    <div className="rounded-2xl bg-ink-raise p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs font-bold text-paper">Q{index + 1}</span>
        <span className="text-[11px] uppercase tracking-wide text-paper-2">{TYPE_LABEL[q.type]}</span>
      </div>
      <p className="font-medium mb-3 whitespace-pre-line">{q.prompt}</p>
      {control}
      {submitted && (
        <div className={[
          'mt-3 rounded-xl px-3 py-2 text-sm flex items-start gap-2',
          correct ? 'bg-paper text-ink' : 'bg-ink-2 text-paper-2',
        ].join(' ')}>
          {correct ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>
            {correct ? 'Correct.' : <>Correct answer: <strong>{accepted.join(' / ')}</strong>.</>}
            {q.explanation && <span className="block mt-1 opacity-90">{q.explanation}</span>}
          </span>
        </div>
      )}
    </div>
  );
};

// ---- Score banner ----------------------------------------------------------
function BandBanner({
  correct, total, kind,
}: { correct: number; total: number; kind: 'reading' | 'listening' }) {
  const band = ieltsBandScore(correct, kind);
  return (
    <div className="rounded-2xl bg-ink-2 text-paper px-5 py-4 flex flex-wrap items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 font-semibold">
        <ClipboardCheck className="w-5 h-5" /> {correct} / {total} correct
      </span>
      <span className="inline-flex items-center gap-2 font-bold">
        <Award className="w-5 h-5" /> Estimated band {band.toFixed(1)}
        <span className="text-xs font-medium opacity-80">({kind} · whole paper /40)</span>
      </span>
    </div>
  );
}

// ===========================================================================
// Reading paper
// ===========================================================================
function ReadingPaper({ passages }: { passages: IeltsReadingPassage[] }) {
  const { recordStudy, requirePractice } = useEnglishStats();
  const [active, setActive] = useState(0);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const passage = passages[active];

  // Grade across ALL passages so the band reflects the whole /40 paper.
  const allQuestions = useMemo(
    () => passages.flatMap((p) => p.questions),
    [passages],
  );
  const correctCount = allQuestions.filter((q) => isCorrect(q, responses[q.id])).length;

  if (!passage) {
    return <p className="text-paper-2">No reading passages in this test.</p>;
  }

  const set = (id: number, v: string) => {
    if (!requirePractice()) return; // visitors/free can read the paper, not answer it
    setResponses((r) => ({ ...r, [id]: v }));
  };

  return (
    <div className="space-y-5">
      {/* Passage switcher */}
      <div className="flex flex-wrap gap-2">
        {passages.map((p, i) => (
          <button
            key={p.number}
            onClick={() => setActive(i)}
            className={[
              'px-4 py-2 rounded-full text-sm font-semibold border',
              i === active ? 'bg-paper text-ink border-paper' : 'border-ink-line text-paper-2 hover:text-paper',
            ].join(' ')}
          >
            Passage {p.number}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Passage text — preserves \n\n paragraph breaks */}
        <article className="rounded-2xl bg-ink-raise p-5 max-h-[70vh] overflow-y-auto">
          <h3 className="text-xl font-bold mb-1">{passage.title}</h3>
          <p className="text-xs text-paper-2 mb-4">Passage {passage.number}</p>
          <div className="leading-relaxed whitespace-pre-line text-[15px]">{passage.text}</div>
        </article>

        {/* Questions for the active passage */}
        <div className="space-y-4">
          {passage.questions.map((q, qi) => (
            <QuestionInput
              key={q.id}
              q={q}
              index={qi}
              value={responses[q.id]}
              submitted={submitted}
              onChange={(v) => set(q.id, v)}
            />
          ))}
        </div>
      </div>

      <PaperActions
        submitted={submitted}
        onSubmit={() => { if (!requirePractice()) return; setSubmitted(true); recordStudy(); }}
        onReset={() => { setSubmitted(false); setResponses({}); }}
      />
      {submitted && <BandBanner correct={correctCount} total={allQuestions.length} kind="reading" />}
    </div>
  );
}

// ===========================================================================
// Listening paper
// ===========================================================================
function ListeningPaper({ sections }: { sections: IeltsListeningSection[] }) {
  const { recordStudy, requirePractice } = useEnglishStats();
  const [active, setActive] = useState(0);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playing, setPlaying] = useState(false);

  const section = sections[active];

  const allQuestions = useMemo(
    () => sections.flatMap((s) => s.questions),
    [sections],
  );
  const correctCount = allQuestions.filter((q) => isCorrect(q, responses[q.id])).length;

  if (!section) {
    return <p className="text-paper-2">No listening sections in this test.</p>;
  }

  const set = (id: number, v: string) => {
    if (!requirePractice()) return; // visitors/free can read the paper, not answer it
    setResponses((r) => ({ ...r, [id]: v }));
  };

  const play = () => {
    speak(section.transcript, 0.92);
    setPlaying(true);
  };
  const stop = () => {
    stopSpeaking();
    setPlaying(false);
  };

  // Switching section should stop any in-flight narration and reset reveals.
  const selectSection = (i: number) => {
    stopSpeaking();
    setPlaying(false);
    setShowTranscript(false);
    setActive(i);
  };

  return (
    <div className="space-y-5">
      {/* Section switcher */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s, i) => (
          <button
            key={s.number}
            onClick={() => selectSection(i)}
            className={[
              'px-4 py-2 rounded-full text-sm font-semibold border',
              i === active ? 'bg-paper text-ink border-paper' : 'border-ink-line text-paper-2 hover:text-paper',
            ].join(' ')}
          >
            Section {s.number}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-ink-2 p-5">
        <h3 className="text-xl font-bold mb-1">{section.title}</h3>
        <p className="text-xs text-paper-2 mb-4">Section {section.number}</p>
        <div className="flex flex-wrap gap-3">
          {!playing ? (
            <button onClick={play} className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-5 py-2.5 font-semibold">
              <Volume2 className="w-4 h-4" /> Play section audio
            </button>
          ) : (
            <button onClick={stop} className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-5 py-2.5 font-semibold">
              <VolumeX className="w-4 h-4" /> Stop audio
            </button>
          )}
          <button
            onClick={() => setShowTranscript((s) => !s)}
            className="inline-flex items-center gap-2 rounded-full border border-ink-line px-5 py-2.5"
          >
            {showTranscript ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showTranscript ? 'Hide' : 'Show'} transcript
          </button>
        </div>
        {showTranscript && (
          <div className="mt-4 rounded-xl bg-ink-raise p-4 leading-relaxed whitespace-pre-line text-[15px]">
            {section.transcript}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {section.questions.map((q, qi) => (
          <QuestionInput
            key={q.id}
            q={q}
            index={qi}
            value={responses[q.id]}
            submitted={submitted}
            onChange={(v) => set(q.id, v)}
          />
        ))}
      </div>

      <PaperActions
        submitted={submitted}
        onSubmit={() => { if (!requirePractice()) return; setSubmitted(true); recordStudy(); }}
        onReset={() => { setSubmitted(false); setResponses({}); }}
      />
      {submitted && <BandBanner correct={correctCount} total={allQuestions.length} kind="listening" />}
    </div>
  );
}

// ===========================================================================
// Writing paper
// ===========================================================================
function WritingPaper({ tasks }: { tasks: IeltsTest['writing'] }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  return (
    <div className="space-y-6">
      {tasks.map((t) => {
        const words = (drafts[t.task] || '').trim().split(/\s+/).filter(Boolean).length;
        const enough = words >= t.minWords;
        return (
          <div key={t.task} className="rounded-2xl bg-ink-raise p-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-lg font-bold">Task {t.task}</h3>
              <span className="text-xs text-paper-2">Minimum {t.minWords} words</span>
            </div>
            <p className="mb-3 whitespace-pre-line leading-relaxed">{t.prompt}</p>
            {t.visual && (
              <div className="mb-4 rounded-xl bg-ink-raise p-4 text-sm text-paper-2 italic whitespace-pre-line">
                {t.visual}
              </div>
            )}
            <textarea
              value={drafts[t.task] || ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [t.task]: e.target.value }))}
              rows={8}
              placeholder="Write your response here…"
              className="w-full rounded-xl bg-ink-raise border border-ink-line p-3 text-paper"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs font-medium ${enough ? 'text-paper-2' : 'text-paper'}`}>
                {words} / {t.minWords} words {enough ? '✓' : ''}
              </span>
              <button
                onClick={() => setRevealed((r) => ({ ...r, [t.task]: !r[t.task] }))}
                className="inline-flex items-center gap-2 rounded-full border border-ink-line px-4 py-2 text-sm"
              >
                {revealed[t.task] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {revealed[t.task] ? 'Hide' : 'Show'} model answer
              </button>
            </div>
            {revealed[t.task] && (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl bg-ink-raise p-4 leading-relaxed whitespace-pre-line">{t.modelAnswer}</div>
                {t.examinerNotes.length > 0 && (
                  <div className="rounded-xl bg-paper text-ink p-4">
                    <p className="font-semibold mb-2 inline-flex items-center gap-2"><Award className="w-4 h-4" /> Examiner notes</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      {t.examinerNotes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Speaking paper
// ===========================================================================
function SpeakingPaper({ parts }: { parts: IeltsTest['speaking'] }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      {parts.map((p) => {
        const isCueCard = p.part === 2;
        return (
          <div key={p.part} className="rounded-2xl bg-ink-raise p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-bold">Part {p.part}</h3>
              <span className="text-xs text-paper-2">{p.title}</span>
            </div>

            {isCueCard ? (
              // Part 2 — single cue card with bullet prompts.
              <div className="rounded-2xl bg-ink-2 p-5 mb-4">
                <p className="text-xs font-bold text-paper mb-2">Cue card</p>
                <ul className="space-y-1.5">
                  {p.questions.map((line, i) => (
                    <li key={i} className={i === 0 ? 'font-semibold' : 'list-disc ml-5 text-paper-2'}>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              // Parts 1 & 3 — interview / discussion questions.
              <ul className="space-y-2 mb-4">
                {p.questions.map((qn, i) => (
                  <li key={i} className="rounded-xl bg-ink-raise px-4 py-2.5">{qn}</li>
                ))}
              </ul>
            )}

            <div className="space-y-3">
              <p className="text-xs font-bold text-paper inline-flex items-center gap-2"><Mic className="w-4 h-4" /> Sample answers</p>
              {p.sampleAnswers.map((ans, i) => {
                const key = `${p.part}-${i}`;
                return (
                  <div key={key} className="rounded-xl bg-ink-raise p-4">
                    <p className={`leading-relaxed ${revealed[key] ? '' : 'line-clamp-2 text-paper-2'}`}>{ans}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        onClick={() => speak(ans)}
                        className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-4 py-1.5 text-sm font-semibold"
                      >
                        <Volume2 className="w-4 h-4" /> Hear answer
                      </button>
                      <button
                        onClick={() => setRevealed((r) => ({ ...r, [key]: !r[key] }))}
                        className="inline-flex items-center gap-2 rounded-full border border-ink-line px-4 py-1.5 text-sm"
                      >
                        {revealed[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        {revealed[key] ? 'Collapse' : 'Read full'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Shared submit / reset bar ---------------------------------------------
function PaperActions({
  submitted, onSubmit, onReset,
}: { submitted: boolean; onSubmit: () => void; onReset: () => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {!submitted ? (
        <button onClick={onSubmit} className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-6 py-2.5 font-semibold">
          <ClipboardCheck className="w-4 h-4" /> Submit answers
        </button>
      ) : (
        <button onClick={onReset} className="inline-flex items-center gap-2 rounded-full border border-ink-line px-6 py-2.5 font-semibold">
          <RotateCcw className="w-4 h-4" /> Try again
        </button>
      )}
    </div>
  );
}

// ===========================================================================
// Root runner — default export consumed by EnglishApp's TestsTab.
// ===========================================================================
export default function IeltsTestRunner({ test, onExit }: { test: IeltsTest; onExit: () => void }) {
  const [paper, setPaper] = useState<Paper>('reading');

  // Leaving the runner should silence any in-flight TTS.
  const exit = () => {
    stopSpeaking();
    onExit();
  };

  return (
    <div className="max-w-6xl">
      {/* Header: persistent Back + title */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button onClick={exit} className="inline-flex items-center gap-2 text-paper-2 hover:text-paper">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-right">
          <h2 className="text-xl font-bold">{test.title}</h2>
          <p className="text-xs text-paper-2">{test.module} · {test.source}</p>
        </div>
      </div>

      {/* Paper switcher */}
      <div className="inline-flex flex-wrap rounded-full bg-ink-raise p-1 mb-6">
        {PAPERS.map((p) => (
          <button
            key={p.key}
            onClick={() => { stopSpeaking(); setPaper(p.key); }}
            className={[
              'inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors',
              paper === p.key ? 'bg-paper text-ink' : 'text-paper-2 hover:text-paper',
            ].join(' ')}
          >
            <p.icon className="w-4 h-4" /> {p.label}
          </button>
        ))}
      </div>

      {paper === 'reading' && <ReadingPaper passages={test.reading} />}
      {paper === 'listening' && <ListeningPaper sections={test.listening} />}
      {paper === 'writing' && <WritingPaper tasks={test.writing} />}
      {paper === 'speaking' && <SpeakingPaper parts={test.speaking} />}
    </div>
  );
}
