// =============================================================================
// IELTS — app shell.
// -----------------------------------------------------------------------------
// Navigation wiring only. The chrome (left sidebar on desktop, top header +
// drawer + bottom nav on mobile) lives in the shared AppShell — matching the
// German app exactly. Each tab lives in its own file under ./tabs/*.
// =============================================================================
import React, { useState } from 'react';
import {
  LayoutDashboard, Home, BookOpen, Headphones, Edit3, Mic, BookA, ClipboardList,
} from 'lucide-react';
import AppShell, { ShellTab } from '../AppShell';
import IeltsHomeTab, { IeltsTabKey } from './tabs/IeltsHomeTab';
import IeltsReadingTab from './tabs/IeltsReadingTab';
import IeltsListeningTab from './tabs/IeltsListeningTab';
import IeltsWritingTab from './tabs/IeltsWritingTab';
import IeltsSpeakingTab from './tabs/IeltsSpeakingTab';
import IeltsVocabTab from './tabs/IeltsVocabTab';
import IeltsTestsTab from './tabs/IeltsTestsTab';
import DashboardTab, { type DashDest } from '../DashboardTab';

// Map the dashboard's generic skill destinations to IELTS tab keys.
const DASH_TO_IELTS: Record<DashDest, IeltsTabKey> = {
  read: 'reading', listen: 'listening', write: 'writing', speak: 'speaking',
  vocab: 'vocab', tests: 'tests',
};

const TABS: ShellTab[] = [
  { key: 'dashboard', label: 'Dashboard', short: 'Самбар', icon: LayoutDashboard },
  { key: 'home', label: 'Home', short: 'Нүүр', icon: Home },
  { key: 'reading', label: 'Reading', short: 'Reading', icon: BookOpen },
  { key: 'listening', label: 'Listening', short: 'Listen', icon: Headphones },
  { key: 'writing', label: 'Writing', short: 'Writing', icon: Edit3 },
  { key: 'speaking', label: 'Speaking', short: 'Speak', icon: Mic },
  { key: 'vocab', label: 'Vocabulary', short: 'Vocab', icon: BookA },
  { key: 'tests', label: 'Practice Tests', short: 'Tests', icon: ClipboardList },
];

export default function IeltsApp({
  onBack,
  onSwitchLanguage,
}: {
  onBack: () => void;
  onSwitchLanguage?: () => void;
}) {
  const [tab, setTab] = useState<IeltsTabKey>('dashboard');

  function renderTab() {
    switch (tab) {
      case 'dashboard': return <DashboardTab onNavigate={(d) => setTab(DASH_TO_IELTS[d])} />;
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
    <AppShell
      brand="IELTS"
      tabs={TABS}
      active={tab}
      onSelect={(k) => setTab(k as IeltsTabKey)}
      onBack={onBack}
      onSwitchLanguage={onSwitchLanguage}
    >
      {renderTab()}
    </AppShell>
  );
}
