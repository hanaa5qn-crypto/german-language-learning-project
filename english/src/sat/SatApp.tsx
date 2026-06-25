// =============================================================================
// SAT — app shell.
// -----------------------------------------------------------------------------
// Pure navigation wiring: a brand header (Change exam + Switch language) and a
// tab bar (Home, Reading & Writing, Math, Vocabulary, Practice Tests). Each tab
// lives in its own file under ./tabs/* and is rendered here; no tab logic lives
// in this shell. Mirrors the IELTS app shell exactly.
// =============================================================================
import React, { useState } from 'react';
import {
  Home, BookOpen, Sigma, BookA, ClipboardList, ArrowLeft, Globe,
} from 'lucide-react';
import SatHomeTab from './tabs/SatHomeTab';
import SatReadingWritingTab from './tabs/SatReadingWritingTab';
import SatMathTab from './tabs/SatMathTab';
import SatVocabTab from './tabs/SatVocabTab';
import SatTestsTab from './tabs/SatTestsTab';

// Tab keys the shell and home cards share (mirrors IELTS's IeltsTabKey).
export type SatTabKey = 'home' | 'rw' | 'math' | 'vocab' | 'tests';

// Brand mark — mirrors the EnglishApp chooser logo so the tracks feel unified.
function BrandLogo({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sat-brand-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ededeb" />
          <stop offset="1" stopColor="#9b9893" />
        </linearGradient>
      </defs>
      <circle cx="13" cy="19" r="9" fill="url(#sat-brand-grad)" />
      <line x1="43" y1="16" x2="30" y2="48" stroke="url(#sat-brand-grad)" strokeWidth="18" strokeLinecap="round" />
    </svg>
  );
}

const TABS: { key: SatTabKey; label: string; icon: React.ElementType }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'rw', label: 'Reading & Writing', icon: BookOpen },
  { key: 'math', label: 'Math', icon: Sigma },
  { key: 'vocab', label: 'Vocabulary', icon: BookA },
  { key: 'tests', label: 'Practice Tests', icon: ClipboardList },
];

export default function SatApp({
  onBack,
  onSwitchLanguage,
}: {
  onBack: () => void;
  onSwitchLanguage?: () => void;
}) {
  const [tab, setTab] = useState<SatTabKey>('home');

  function renderTab() {
    switch (tab) {
      case 'home': return <SatHomeTab onGo={setTab} />;
      case 'rw': return <SatReadingWritingTab />;
      case 'math': return <SatMathTab />;
      case 'vocab': return <SatVocabTab />;
      case 'tests': return <SatTestsTab />;
      default: return <SatHomeTab onGo={setTab} />;
    }
  }

  return (
    <div className="min-h-screen bg-ink text-paper font-sans flex flex-col">
      <header className="border-b border-ink-line/50 sticky top-0 z-20 bg-ink/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-serif font-bold text-lg tracking-tight">
            <BrandLogo className="w-8 h-8" />
            <span><span className="text-paper">Vivid</span> Lingua</span>
            <span className="ml-1 text-xs font-semibold rounded-full bg-ink-2 text-paper px-2 py-0.5">
              SAT
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper-2 hover:text-paper"
            >
              <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Change exam</span>
            </button>
            {onSwitchLanguage && (
              <button
                onClick={onSwitchLanguage}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper-2 hover:text-paper"
              >
                <Globe className="w-4 h-4" /> <span className="hidden sm:inline">Switch language</span>
              </button>
            )}
          </div>
        </div>

        <nav className="max-w-5xl mx-auto px-2 overflow-x-auto">
          <div className="flex gap-1 pb-2 min-w-max">
            {TABS.map((t) => {
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                    on
                      ? 'bg-paper text-ink'
                      : 'text-paper-2 hover:bg-ink-raise hover:text-paper',
                  ].join(' ')}
                >
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="flex-1">{renderTab()}</main>
    </div>
  );
}
