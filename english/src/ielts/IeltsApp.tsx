// =============================================================================
// IELTS — app shell.
// -----------------------------------------------------------------------------
// Pure navigation wiring: a brand header (Change exam + Switch language) and a
// tab bar (Home, Reading, Listening, Writing, Speaking, Vocabulary, Practice
// Tests). Each tab lives in its own file under ./tabs/* and is rendered here;
// no tab logic lives in this shell.
// =============================================================================
import React, { useState } from 'react';
import {
  Home, BookOpen, Headphones, Edit3, Mic, BookA, ClipboardList,
  ArrowLeft, Globe,
} from 'lucide-react';
import IeltsHomeTab, { IeltsTabKey } from './tabs/IeltsHomeTab';
import IeltsReadingTab from './tabs/IeltsReadingTab';
import IeltsListeningTab from './tabs/IeltsListeningTab';
import IeltsWritingTab from './tabs/IeltsWritingTab';
import IeltsSpeakingTab from './tabs/IeltsSpeakingTab';
import IeltsVocabTab from './tabs/IeltsVocabTab';
import IeltsTestsTab from './tabs/IeltsTestsTab';

// Brand mark — mirrors the EnglishApp chooser logo so the tracks feel unified.
function BrandLogo({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ielts-brand-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ededeb" />
          <stop offset="1" stopColor="#9b9893" />
        </linearGradient>
      </defs>
      <circle cx="13" cy="19" r="9" fill="url(#ielts-brand-grad)" />
      <line x1="43" y1="16" x2="30" y2="48" stroke="url(#ielts-brand-grad)" strokeWidth="18" strokeLinecap="round" />
    </svg>
  );
}

const TABS: { key: IeltsTabKey; label: string; icon: React.ElementType }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'reading', label: 'Reading', icon: BookOpen },
  { key: 'listening', label: 'Listening', icon: Headphones },
  { key: 'writing', label: 'Writing', icon: Edit3 },
  { key: 'speaking', label: 'Speaking', icon: Mic },
  { key: 'vocab', label: 'Vocabulary', icon: BookA },
  { key: 'tests', label: 'Practice Tests', icon: ClipboardList },
];

export default function IeltsApp({
  onBack,
  onSwitchLanguage,
}: {
  onBack: () => void;
  onSwitchLanguage?: () => void;
}) {
  const [tab, setTab] = useState<IeltsTabKey>('home');

  function renderTab() {
    switch (tab) {
      case 'home': return <IeltsHomeTab onGo={setTab} />;
      case 'reading': return <IeltsReadingTab />;
      case 'listening': return <IeltsListeningTab />;
      case 'writing': return <IeltsWritingTab />;
      case 'speaking': return <IeltsSpeakingTab />;
      case 'vocab': return <IeltsVocabTab />;
      case 'tests': return <IeltsTestsTab />;
      default: return <IeltsHomeTab onGo={setTab} />;
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
              IELTS
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
