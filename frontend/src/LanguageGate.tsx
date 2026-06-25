import React, { useEffect, useState } from 'react';
import App from './App';
import EnglishApp from '../../english/src/EnglishApp';

// localStorage key shared by both tracks. 'de' => German app, 'en' => English app.
const TRACK_KEY = 'vivid-lingua-track';
type Track = 'de' | 'en';

function isTrack(value: string | null): value is Track {
  return value === 'de' || value === 'en';
}

// One selectable language card.
function TrackCard({
  flag, title, native, blurb, onPick, delay,
}: {
  flag: string; title: string; native: string; blurb: string;
  onPick: () => void; delay: string;
}) {
  return (
    <button
      onClick={onPick}
      style={{ animationDelay: delay }}
      className="animate-scale-up group flex flex-col items-start gap-4 rounded-3xl bg-ink-raise/60 border border-ink-line p-7 text-left transition-all duration-300 hover:-translate-y-1 hover:border-paper/60 hover:bg-ink-raise focus:outline-none focus-visible:border-paper/80"
    >
      <span className="text-5xl transition-transform duration-300 group-hover:scale-110" aria-hidden="true">{flag}</span>
      <span className="flex flex-col gap-1">
        <span className="text-2xl font-serif font-light tracking-tight text-paper">{title}</span>
        <span className="text-[0.7rem] uppercase tracking-[0.2em] font-medium text-paper-3">{native}</span>
      </span>
      <span className="text-sm leading-relaxed text-paper-2">{blurb}</span>
      <span className="mt-1 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] font-medium text-paper-3 transition-colors group-hover:text-paper">
        Эхлэх · Start
        <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">→</span>
      </span>
    </button>
  );
}

// First-screen chooser shown right after login (or after a reset). Asks the user
// what they want to learn before either track boots.
function Chooser({ onPick }: { onPick: (track: Track) => void }) {
  return (
    <div className="min-h-screen bg-ink text-paper font-sans flex flex-col items-center justify-center px-4 py-12">
      <div className="animate-fade-in w-full max-w-2xl">
        <div className="text-center mb-12">
          <p className="text-[0.7rem] uppercase tracking-[0.28em] font-medium text-paper-3 mb-6">Vivid Lingua</p>
          <h1 className="font-serif font-light tracking-tight text-4xl sm:text-5xl text-paper mb-4">
            What do you want to learn?
          </h1>
          <p className="text-paper-2 text-base">Юу сурахыг хүсэж байна вэ?</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <TrackCard
            flag="🇩🇪"
            title="German"
            native="Deutsch"
            blurb="Live, work or study in Germany. Lessons, listening and grammar from A1 to C1."
            onPick={() => onPick('de')}
            delay="80ms"
          />
          <TrackCard
            flag="🇬🇧"
            title="English"
            native="English"
            blurb="Ace IELTS & the SAT. Vocabulary, practice exams and AI feedback in Mongolian."
            onPick={() => onPick('en')}
            delay="160ms"
          />
        </div>

        <p className="mt-10 text-center text-xs text-paper-3">
          You can switch anytime · Дараа нь сольж болно
        </p>
      </div>
    </div>
  );
}

// Gate that decides which language track to render and persists the choice.
export default function LanguageGate() {
  const [track, setTrack] = useState<Track | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TRACK_KEY);
      if (isTrack(stored)) setTrack(stored);
    } catch {
      /* localStorage unavailable — fall back to the chooser */
    }
  }, []);

  function pick(next: Track) {
    try {
      localStorage.setItem(TRACK_KEY, next);
    } catch {
      /* persistence failed — still proceed for this session */
    }
    setTrack(next);
  }

  function reset() {
    try {
      localStorage.removeItem(TRACK_KEY);
    } catch {
      /* ignore */
    }
    setTrack(null);
  }

  if (track === 'de') {
    // German app has no built-in language switch, so overlay a small floating
    // button that returns to the chooser (where English can be picked). It sits
    // clear of the German app's fixed bars: below the mobile top header, above
    // the desktop content, and off the mobile bottom nav / desktop left sidebar.
    return (
      <>
        <App />
        <button
          onClick={reset}
          title="Хэл солих / Switch language"
          aria-label="Switch language"
          className="fixed right-3 top-20 md:top-3 z-[130] inline-flex items-center gap-1.5 rounded-full border border-ink-line bg-ink-raise/90 backdrop-blur px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-paper-2 shadow-black/40 hover:border-paper/60 hover:bg-ink-2 hover:text-paper transition-colors"
        >
          <span aria-hidden="true">🌐</span> Хэл солих
        </button>
      </>
    );
  }
  if (track === 'en') return <EnglishApp onSwitchLanguage={reset} />;
  return <Chooser onPick={pick} />;
}
