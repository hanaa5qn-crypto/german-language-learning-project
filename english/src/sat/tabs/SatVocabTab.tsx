// =============================================================================
// SAT — Vocabulary flashcard trainer.
// -----------------------------------------------------------------------------
// Flips through SAT_VOCAB cards: word, phonetic, part of speech, English
// definition, the MONGOLIAN gloss, and an example. A "Say it" button speaks the
// word with the shared neural TTS (en-US-AriaNeural); prev/next navigation and a
// CEFR level filter. Mirrors the IELTS vocab tab.
// =============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  BookA, Volume2, ChevronLeft, ChevronRight, Eye, EyeOff, Shuffle,
} from 'lucide-react';
import { SAT_VOCAB } from '../satVocab';
import { speak } from '../../audio';
import { EnglishLevel } from '../../types';
import { LevelFilter } from '../../ielts/tabs/quizKit';
import { useEnglishStats } from '../../stats';

// CEFR levels present in the SAT deck (B1..C2 high-frequency words).
const SAT_LEVELS: EnglishLevel[] = ['B1', 'B2', 'C1', 'C2'];

export default function SatVocabTab() {
  const { recordStudy } = useEnglishStats();
  const [level, setLevel] = useState<EnglishLevel | 'all'>('all');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const deck = useMemo(
    () => (level === 'all' ? SAT_VOCAB : SAT_VOCAB.filter((w) => w.level === level)),
    [level],
  );

  // Keep the index valid whenever the filtered deck changes.
  useEffect(() => {
    setIndex(0);
    setRevealed(false);
  }, [level]);

  const card = deck[index];

  function go(delta: number) {
    if (deck.length === 0) return;
    setIndex((i) => (i + delta + deck.length) % deck.length);
    setRevealed(false);
  }
  function shuffle() {
    if (deck.length === 0) return;
    setIndex(Math.floor(Math.random() * deck.length));
    setRevealed(false);
  }
  function say() {
    if (card) void speak(card.word, { voice: 'en-US-AriaNeural', rate: 0.9 });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-light tracking-tight text-paper flex items-center gap-2">
          <BookA className="w-6 h-6 text-paper" /> SAT Vocabulary
        </h2>
        <p className="text-paper-2 mt-1">
          Шалгалтад байнга тааралддаг {SAT_VOCAB.length} үгийг Монгол орчуулгатай нь сурцгаая.
        </p>
      </div>

      <LevelFilter levels={SAT_LEVELS} active={level} onChange={setLevel} />

      {deck.length === 0 || !card ? (
        <p className="text-paper-2">Энэ түвшинд үг алга байна.</p>
      ) : (
        <>
          <div className="rounded-3xl bg-ink-raise p-6 sm:p-8 min-h-[18rem] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="rounded-full bg-ink-2 text-paper px-2.5 py-0.5 text-xs font-bold">
                {card.level}
              </span>
              <span className="text-xs text-paper-2">{card.category}</span>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-3xl font-serif font-light tracking-tight text-paper">{card.word}</h3>
                <button
                  onClick={say}
                  className="rounded-full bg-ink-2 text-paper p-2 hover:bg-ink-2 hover:text-paper transition-colors"
                  aria-label="Say it"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>
              <p className="text-paper-2 mt-1">
                {card.phonetic} · <span className="italic">{card.partOfSpeech}</span>
              </p>

              <p className="mt-5 text-paper leading-relaxed">{card.definition}</p>

              {revealed ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-paper text-ink p-3">
                    <span className="text-xs font-bold uppercase tracking-wide opacity-80">Монгол</span>
                    <p className="text-lg font-bold">{card.mongolian}</p>
                  </div>
                  <p className="text-paper-2 italic">“{card.example}”</p>
                </div>
              ) : (
                <button
                  onClick={() => { setRevealed(true); recordStudy(); }}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-paper text-ink px-5 py-2.5 font-bold"
                >
                  <Eye className="w-4 h-4" /> Орчуулга харах
                </button>
              )}
            </div>

            {revealed && (
              <button
                onClick={() => setRevealed(false)}
                className="mt-4 self-start inline-flex items-center gap-2 text-sm font-semibold text-paper-2 hover:text-paper"
              >
                <EyeOff className="w-4 h-4" /> Нуух
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => go(-1)}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-2 text-paper px-5 py-2.5 font-semibold hover:bg-ink-raise"
            >
              <ChevronLeft className="w-4 h-4" /> Өмнөх
            </button>

            <div className="flex items-center gap-3">
              <span className="text-sm text-paper-2 font-semibold">
                {index + 1} / {deck.length}
              </span>
              <button
                onClick={shuffle}
                className="rounded-full bg-ink-2 text-paper p-2.5 hover:bg-ink-raise"
                aria-label="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => go(1)}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-2 text-paper px-5 py-2.5 font-semibold hover:bg-ink-raise"
            >
              Дараах <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
