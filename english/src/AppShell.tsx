// =============================================================================
// English track — app shell (left sidebar + mobile drawer + bottom nav).
// -----------------------------------------------------------------------------
// Mirrors the German app's chrome 1:1 so the two tracks feel like one product:
//   • Desktop (md+): a fixed 280px left sidebar — brand, user panel, streak
//     badge, vertical nav, and a Settings / Change exam / Switch language / Log
//     out footer.
//   • Mobile (<md): a fixed top header (hamburger + brand + streak), a slide-in
//     drawer with the same nav, and a fixed bottom nav bar.
// Used by both IeltsApp and SatApp — they only supply the tab list + content.
// =============================================================================
import React, { useState } from 'react';
import { Flame, Settings, LogOut, ArrowLeft, Globe, Menu, X } from 'lucide-react';
import { useEnglishStats } from './stats';

export interface ShellTab {
  key: string;
  label: string;
  /** Compact label for the mobile bottom nav (falls back to label). */
  short?: string;
  icon: React.ElementType;
}

// Brand mark — paper gradient, matching the German logo.
function BrandLogo({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="shell-brand-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ededeb" />
          <stop offset="1" stopColor="#9b9893" />
        </linearGradient>
      </defs>
      <circle cx="13" cy="19" r="9" fill="url(#shell-brand-grad)" />
      <line x1="43" y1="16" x2="30" y2="48" stroke="url(#shell-brand-grad)" strokeWidth="18" strokeLinecap="round" />
    </svg>
  );
}

export default function AppShell({
  brand,
  tabs,
  active,
  onSelect,
  onBack,
  onSwitchLanguage,
  children,
}: {
  brand: string;
  tabs: ShellTab[];
  active: string;
  onSelect: (key: string) => void;
  onBack: () => void;
  onSwitchLanguage?: () => void;
  children: React.ReactNode;
}) {
  const { profile, streak, enabled, openSettings, logout } = useEnglishStats();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const name = profile?.name || 'Зочин';
  const avatar = profile?.avatar || '';
  const dashboardKey = tabs[0]?.key ?? 'dashboard';

  function pick(key: string) {
    onSelect(key);
    setMobileMenuOpen(false);
  }

  // The full sidebar body, shared by the desktop sidebar and the mobile drawer.
  const SidebarBody = (
    <>
      <div>
        <h1 className="text-2xl font-light tracking-tight font-serif flex items-center gap-2">
          <BrandLogo className="w-8 h-8" />
          <span><span className="text-paper">Vivid</span> <span className="text-paper-2">Lingua</span></span>
          <span className="ml-1 text-xs font-semibold rounded-full bg-ink-2 text-paper px-2 py-0.5">{brand}</span>
        </h1>
      </div>

      {/* User panel → dashboard */}
      <button
        onClick={() => pick(dashboardKey)}
        className="flex items-center gap-3 bg-ink-raise p-3 rounded-xl border border-ink-line cursor-pointer hover:bg-ink-2 transition-colors text-left w-full"
      >
        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-ink-line bg-ink-2">
          {avatar ? <img alt={name} className="w-full h-full object-cover" src={avatar} /> : null}
        </div>
        <div className="overflow-hidden">
          <p className="text-[10px] font-black uppercase text-paper-2 tracking-wider">{brand}</p>
          <h2 className="text-[15px] font-extrabold truncate text-paper leading-tight">{name}</h2>
          <p className="text-[11px] text-paper-2 truncate leading-none mt-0.5">
            {enabled ? 'Англи хэл' : 'Зочин'}
          </p>
        </div>
      </button>

      {/* Streak badge */}
      {enabled && (
        <div>
          <div className="bg-ink-raise text-paper text-[14px] font-bold rounded-xl px-4 py-3 flex items-center justify-between border border-ink-line">
            <span className="flex items-center gap-2 text-paper-2">
              <Flame className="w-5 h-5 text-paper fill-paper-2 animate-pulse" />
              Streak: {streak} өдөр
            </span>
            <span className="text-[11px] font-serif bg-paper text-ink px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide">AUTO</span>
          </div>
        </div>
      )}

      {/* Vertical tab list */}
      <ul className="flex flex-col gap-2 flex-grow mt-2 overflow-y-auto pr-1">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <li key={t.key}>
              <button
                onClick={() => pick(t.key)}
                className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                  on ? 'text-paper border-l-4 border-paper bg-ink-raise' : 'text-paper-2 hover:text-paper hover:bg-ink-raise'
                }`}
              >
                <t.icon className={`w-5 h-5 ${on ? 'text-paper' : ''}`} />
                <span className="text-[14px] font-bold">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Footer: settings / change exam / switch language / log out */}
      <div className="border-t border-ink-line pt-4 flex flex-col gap-1">
        {enabled && (
          <button
            onClick={() => { openSettings(); setMobileMenuOpen(false); }}
            className="flex items-center gap-3 py-2 px-4 rounded-lg font-bold text-left text-paper-2 hover:text-paper hover:bg-ink-raise transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4 text-paper-3" />
            <span className="text-sm">Тохиргоо</span>
          </button>
        )}
        <button
          onClick={() => { onBack(); setMobileMenuOpen(false); }}
          className="flex items-center gap-3 py-2 px-4 rounded-lg font-bold text-left text-paper-2 hover:text-paper hover:bg-ink-raise transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-paper-3" />
          <span className="text-sm">Change exam</span>
        </button>
        {onSwitchLanguage && (
          <button
            onClick={() => { onSwitchLanguage(); setMobileMenuOpen(false); }}
            className="flex items-center gap-3 py-2 px-4 rounded-lg font-bold text-left text-paper-2 hover:text-paper hover:bg-ink-raise transition-colors cursor-pointer"
          >
            <Globe className="w-4 h-4 text-paper-3" />
            <span className="text-sm">Switch language</span>
          </button>
        )}
        <button
          onClick={() => { logout(); setMobileMenuOpen(false); }}
          className="flex items-center gap-3 py-2 px-4 rounded-lg font-bold text-left text-paper hover:text-paper-2 hover:bg-ink-raise transition-colors cursor-pointer w-full"
        >
          <LogOut className="w-4 h-4 text-paper-3" />
          <span className="text-sm">Гарах</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-ink text-paper font-sans">
      {/* Desktop sidebar */}
      <nav
        aria-label="Menu"
        className="hidden md:flex flex-col h-screen py-8 px-4 gap-y-6 bg-ink w-[280px] fixed left-0 top-0 text-paper border-r border-ink-line select-none z-30 shadow-[4px_0_24px_rgba(0,0,0,0.6)]"
      >
        {SidebarBody}
      </nav>

      {/* Mobile top header */}
      <header className="md:hidden flex justify-between items-center w-full px-4 h-16 bg-ink-raise border-b border-ink-line fixed top-0 left-0 z-40">
        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="text-paper p-2 border border-ink-line rounded-lg bg-ink-raise hover:bg-ink-2 cursor-pointer"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-light font-serif text-paper tracking-tight flex items-center gap-2">
          <BrandLogo className="w-6 h-6" /> Vivid Lingua
        </h1>
        <div className="flex items-center justify-center p-2 text-paper-2 select-none w-12">
          {enabled && (
            <>
              <Flame className="w-5 h-5 text-paper fill-paper-2 animate-pulse" />
              <span className="text-xs font-black text-paper ml-1">{streak}</span>
            </>
          )}
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="w-[280px] h-full bg-ink py-8 px-4 flex flex-col gap-y-6 text-paper border-r border-ink-line animate-slide-right relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-3 right-3 text-paper-2 hover:text-paper p-1"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            {SidebarBody}
          </div>
        </div>
      )}

      {/* Main content — offset for the sidebar (desktop) and the fixed bars (mobile) */}
      <main className="flex-1 md:ml-[280px] pt-16 md:pt-0 pb-20 md:pb-0 min-h-screen bg-ink w-full">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Bottom navigation"
        className="md:hidden fixed bottom-0 left-0 w-full bg-ink-raise border-t border-ink-line z-40 pb-safe"
      >
        <div className="flex justify-around items-center h-16">
          {tabs.map((t) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                onClick={() => onSelect(t.key)}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  on ? 'text-paper' : 'text-paper-2'
                }`}
              >
                {on && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-paper rounded-b-full" />}
                <t.icon className="w-5 h-5" />
                <span className="text-[10px] font-bold font-serif">{t.short ?? t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
