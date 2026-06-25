// =============================================================================
// IELTS — Speaking practice tab.
// -----------------------------------------------------------------------------
// Original Speaking Parts 1–3 (interview, cue card, discussion). The learner can
// capture a transcript by speech recognition (when available) or by typing, then
// call reviewSpeaking (exam: 'ielts') for Mongolian AI feedback rendered via the
// shared card. A "Hear a model answer" button uses the British neural voice.
// =============================================================================
import React, { useMemo, useRef, useState } from 'react';
import {
  Mic, Square, Volume2, Sparkles, Loader2, AlertCircle, MessageSquare, Quote,
} from 'lucide-react';
import { reviewSpeaking, AiReview } from '../../api';
import { speak, stopSpeaking } from '../../audio';
import { AiReviewCard } from './AiReviewCard';
import { useEnglishStats } from '../../stats';

const IELTS_VOICE = 'en-GB-SoniaNeural';

interface SpeakingPrompt {
  id: string;
  part: 1 | 2 | 3;
  label: string;
  title: string;
  /** Interview questions, or the cue card bullets for Part 2. */
  questions: string[];
  modelAnswer: string;
}

const PROMPTS: SpeakingPrompt[] = [
  {
    id: 'p1',
    part: 1,
    label: 'Part 1',
    title: 'Hometown & daily life',
    questions: [
      'Where is your hometown, and what is it like?',
      'Do you prefer living in a city or in the countryside? Why?',
      'How do you usually spend your weekends?',
      'Has your daily routine changed much in recent years?',
    ],
    modelAnswer:
      'I am originally from Ulaanbaatar, the capital of Mongolia. It is a busy, fast-growing city, so there is always something happening, though it can get quite crowded. Personally, I prefer city life because everything I need — work, friends, cafés — is close by, and I enjoy the energy of it. At weekends, I usually catch up with friends or go hiking in the hills just outside the city to get some fresh air. My routine has actually changed a fair bit lately, since I now study English in the evenings, which keeps me much busier than before.',
  },
  {
    id: 'p2',
    part: 2,
    label: 'Part 2 (cue card)',
    title: 'Describe a skill you would like to learn',
    questions: [
      'Describe a skill you would like to learn. You should say:',
      '• what the skill is',
      '• why you want to learn it',
      '• how you would learn it',
      '• and explain how this skill would change your life.',
    ],
    modelAnswer:
      'The skill I would most like to learn is how to play the piano. I have always been drawn to music, but I never had the chance to take lessons as a child, so it feels like something I missed out on. I want to learn it mainly because I find playing an instrument incredibly relaxing, and I think it would be a wonderful way to unwind after a stressful day at work. To learn it, I would probably start with online tutorials to grasp the basics, and then, once I could afford it, hire a private teacher to correct my technique and keep me motivated. I believe this skill would change my life in a small but meaningful way: it would give me a creative outlet that has nothing to do with my job, and I imagine that being able to play for my family and friends would bring me a great deal of joy.',
  },
  {
    id: 'p3',
    part: 3,
    label: 'Part 3',
    title: 'Learning & technology — discussion',
    questions: [
      'Do you think people learn new skills more easily today than in the past? Why?',
      'What are the advantages and disadvantages of learning online?',
      'Should governments do more to help adults learn new skills?',
      'How might the way we learn change in the future?',
    ],
    modelAnswer:
      'On the whole, I would say people can learn new skills far more easily nowadays, largely because of the internet. In the past, you often needed access to a specific teacher or institution, whereas today an enormous amount of high-quality material is available for free online. That said, learning online does have its drawbacks — it requires a great deal of self-discipline, and some people miss the structure and feedback that a real classroom provides. As for governments, I firmly believe they should do more, perhaps by funding free retraining programmes, because economies change so quickly that adults frequently need to update their skills to stay employable. Looking ahead, I suspect learning will become increasingly personalised, with artificial intelligence tailoring lessons to each individual’s pace and weaknesses, which could make the whole process much more efficient.',
  },
];

// Minimal local shape for the speech-recognition window globals (tsc-friendly).
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function IeltsSpeakingTab() {
  const { recordStudy } = useEnglishStats();
  const [selectedId, setSelectedId] = useState<string>(PROMPTS[0].id);
  const [transcript, setTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<AiReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTranscriptRef = useRef('');

  const prompt = useMemo(
    () => PROMPTS.find((p) => p.id === selectedId) ?? PROMPTS[0],
    [selectedId],
  );
  const recognitionAvailable = getRecognitionCtor() !== null;

  function selectPrompt(id: string) {
    stopRecording();
    stopSpeaking();
    setSelectedId(id);
    setTranscript('');
    setReview(null);
    setError(null);
    setSpeaking(false);
  }

  function startRecording() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    baseTranscriptRef.current = transcript ? `${transcript.trim()} ` : '';
    rec.onresult = (event) => {
      let assembled = '';
      for (let i = 0; i < event.results.length; i += 1) {
        assembled += event.results[i][0].transcript;
      }
      setTranscript(`${baseTranscriptRef.current}${assembled}`.trimStart());
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recognitionRef.current = rec;
    setRecording(true);
    rec.start();
  }

  function stopRecording() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }
    setRecording(false);
  }

  function hearModel() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    void speak(prompt.modelAnswer, { voice: IELTS_VOICE, rate: 0.95 }).finally(() =>
      setSpeaking(false),
    );
  }

  async function getFeedback() {
    setLoading(true);
    setError(null);
    setReview(null);
    try {
      const res = await reviewSpeaking({
        exam: 'ielts',
        part: `IELTS Speaking ${prompt.label}`,
        prompt: prompt.questions.join('\n'),
        transcript: transcript.trim(),
      });
      setReview(res);
      recordStudy();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'AI үнэлгээ авахад алдаа гарлаа. Дахин оролдоно уу.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-light tracking-tight text-paper flex items-center gap-2">
          <Mic className="w-6 h-6 text-paper" /> Speaking practice
        </h2>
        <p className="text-paper-2 mt-1">
          Part 1–3-ыг ярьж бичүүлээд, эсвэл бичээд AI-аас Монгол хэлээр үнэлгээ аваарай.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PROMPTS.map((p) => {
          const on = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => selectPrompt(p.id)}
              className={[
                'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                on
                  ? 'bg-paper text-ink'
                  : 'bg-ink-2 text-paper-2 hover:text-paper',
              ].join(' ')}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-ink-raise p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ink-2 text-paper px-2.5 py-0.5 text-xs font-bold">
            {prompt.label}
          </span>
          <span className="text-sm font-bold text-paper">{prompt.title}</span>
        </div>
        <ul className="space-y-1.5 text-paper leading-relaxed">
          {prompt.questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
        <button
          onClick={hearModel}
          className="inline-flex items-center gap-2 rounded-full bg-ink-2 text-paper px-5 py-2.5 font-semibold hover:bg-ink-raise"
        >
          {speaking ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          {speaking ? 'Зогсоох' : 'Hear a model answer'}
        </button>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-paper">
          <MessageSquare className="w-4 h-4 text-paper" /> Таны хариулт (transcript)
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={8}
          placeholder="Ярьж бичүүлэх эсвэл шууд бичнэ үү…"
          className="w-full rounded-2xl bg-ink-raise border border-ink-line p-4 text-paper placeholder:text-paper-2 focus:outline-none focus:border-paper leading-relaxed resize-y"
        />
        <div className="flex flex-wrap gap-3">
          {recognitionAvailable ? (
            <button
              onClick={recording ? stopRecording : startRecording}
              className={[
                'inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold transition-colors',
                recording
                  ? 'bg-ink-2 text-paper-2'
                  : 'bg-ink-2 text-paper hover:bg-ink-raise',
              ].join(' ')}
            >
              {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {recording ? 'Бичлэг зогсоох' : 'Record'}
            </button>
          ) : (
            <span className="text-xs text-paper-2 inline-flex items-center gap-1.5">
              <Quote className="w-3.5 h-3.5" /> Энэ хөтөч дуу таних дэмждэггүй тул бичээрэй.
            </span>
          )}
        </div>
      </div>

      <button
        onClick={getFeedback}
        disabled={loading || transcript.trim() === ''}
        className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-6 py-3 font-bold disabled:opacity-40"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Үнэлж байна…' : 'Get AI feedback / AI үнэлгээ авах'}
      </button>

      {error && (
        <div className="rounded-2xl bg-ink-2 text-paper-2 p-4 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {review && <AiReviewCard review={review} />}
    </div>
  );
}
