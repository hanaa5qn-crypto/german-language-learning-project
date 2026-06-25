// =============================================================================
// SAT — app shell.
// -----------------------------------------------------------------------------
// Navigation wiring only. The chrome (left sidebar on desktop, top header +
// drawer + bottom nav on mobile) lives in the shared AppShell — matching the
// German app exactly. Mirrors the IELTS app shell.
// =============================================================================
import React, { useState } from 'react';
import {
  LayoutDashboard, Home, BookOpen, Sigma, BookA, ClipboardList,
} from 'lucide-react';
import AppShell, { ShellTab } from '../AppShell';
import SatHomeTab from './tabs/SatHomeTab';
import SatReadingWritingTab from './tabs/SatReadingWritingTab';
import SatMathTab from './tabs/SatMathTab';
import SatVocabTab from './tabs/SatVocabTab';
import SatTestsTab from './tabs/SatTestsTab';
import DashboardTab from '../DashboardTab';

// Tab keys the shell and home cards share (mirrors IELTS's IeltsTabKey).
export type SatTabKey = 'dashboard' | 'home' | 'rw' | 'math' | 'vocab' | 'tests';

const TABS: ShellTab[] = [
  { key: 'dashboard', label: 'Dashboard', short: 'Самбар', icon: LayoutDashboard },
  { key: 'home', label: 'Home', short: 'Нүүр', icon: Home },
  { key: 'rw', label: 'Reading & Writing', short: 'R&W', icon: BookOpen },
  { key: 'math', label: 'Math', short: 'Math', icon: Sigma },
  { key: 'vocab', label: 'Vocabulary', short: 'Vocab', icon: BookA },
  { key: 'tests', label: 'Practice Tests', short: 'Tests', icon: ClipboardList },
];

export default function SatApp({
  onBack,
  onSwitchLanguage,
}: {
  onBack: () => void;
  onSwitchLanguage?: () => void;
}) {
  const [tab, setTab] = useState<SatTabKey>('dashboard');

  function renderTab() {
    switch (tab) {
      case 'dashboard': return <DashboardTab />;
      case 'home': return <SatHomeTab onGo={setTab} />;
      case 'rw': return <SatReadingWritingTab />;
      case 'math': return <SatMathTab />;
      case 'vocab': return <SatVocabTab />;
      case 'tests': return <SatTestsTab />;
      default: return <SatHomeTab onGo={setTab} />;
    }
  }

  return (
    <AppShell
      brand="SAT"
      tabs={TABS}
      active={tab}
      onSelect={(k) => setTab(k as SatTabKey)}
      onBack={onBack}
      onSwitchLanguage={onSwitchLanguage}
    >
      {renderTab()}
    </AppShell>
  );
}
