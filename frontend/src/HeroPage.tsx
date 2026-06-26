import { useState } from 'react';
import {
  ArrowRight, BookOpen, Headphones, Mic, PenLine, Languages, Swords,
  Mail, Phone, GraduationCap, Menu, X,
} from 'lucide-react';
import {
  motion, useScroll, useTransform, useReducedMotion, useMotionValueEvent,
} from 'motion/react';
import { EASE_OUT_EXPO, Reveal, Stagger, StaggerItem } from './motionPrimitives';

// ─────────────────────────────────────────────────────────────────────────────
// HeroPage — the signed-out landing, in the "Velorah" cinematic-minimalist
// style: deep graphite void, a slow cinematic background video, Instrument
// Serif display type, Inter body, and luminous "liquid glass" surfaces. It
// carries Vivid Lingua's real brand info and funnels every CTA into
// login / signup (handled by AuthGate).
//
// Motion is powered by `motion` (Framer Motion v12). The hero fold is the
// showcase — a choreographed entrance + scroll parallax — and every section
// below shares the same fade-and-rise vocabulary, revealed on scroll. All of
// it collapses to a plain fade under prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────

interface HeroPageProps {
  onLogin: () => void;
  onSignup: () => void;
  onGuest?: () => void;
}

const serif = { fontFamily: '"Instrument Serif", Georgia, "Times New Roman", serif' } as const;

const SKILLS = [
  { icon: BookOpen, title: 'Reading', desc: 'Graded texts with Mongolian glosses.' },
  { icon: Headphones, title: 'Listening', desc: 'Native audio you can slow and replay.' },
  { icon: Mic, title: 'Speaking', desc: 'Speak aloud, get instant AI feedback.' },
  { icon: PenLine, title: 'Writing', desc: 'Compositions corrected line by line.' },
  { icon: Languages, title: 'Vocabulary', desc: 'A1–C2 flashcards with smart review.' },
  { icon: Swords, title: 'Duels', desc: 'Race a friend through the same ten words.' },
];

// Headline split into words so each can reveal on its own beat. `em` words keep
// the muted grey on the same timeline (no separate colour animation).
const HEADLINE_LINE_1 = [{ t: 'Where' }, { t: 'fluency' }, { t: 'rises', em: true }];
const HEADLINE_LINE_2 = [{ t: 'through' }, { t: 'the' }, { t: 'silence.', em: true }];

export default function HeroPage({ onLogin, onSignup, onGuest }: HeroPageProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduce = useReducedMotion();

  // Drive the nav "glass on scroll" + background parallax off a single rAF-batched
  // scroll value (no manual window listener).
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 40));

  const bgFade = useTransform(scrollY, [0, 520], reduce ? [1, 1] : [1, 0.35]);
  const glowY = useTransform(scrollY, [0, 600], reduce ? [0, 0] : [0, -120]);
  const glowY2 = useTransform(scrollY, [0, 600], reduce ? [0, 0] : [0, 90]);

  const NAV = [
    { label: 'Home', href: '#top' },
    { label: 'Tracks', href: '#tracks' },
    { label: 'Skills', href: '#skills' },
    { label: 'About', href: '#about' },
    { label: 'Reach us', href: '#contact' },
  ];

  // Per-element entrance for the hero fold. Reduced motion → fade only.
  const rise = (delay: number, y = 24) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay: delay * 0.5 } }
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, ease: EASE_OUT_EXPO, delay },
        };

  // Headline word stagger — the signature moment.
  const headlineContainer = {
    hidden: {},
    show: { transition: { delayChildren: 0.25, staggerChildren: reduce ? 0 : 0.07 } },
  };
  const headlineWord = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } }
    : { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT_EXPO } } };

  return (
    <div
      id="top"
      className="relative min-h-screen w-full overflow-x-hidden bg-[#141313] text-[#e5e2e1] antialiased selection:bg-white selection:text-[#141313]"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      {/* Liquid-glass surface (still used across the page). */}
      <style>{`
        .vl-glass {
          background: rgba(255,255,255,0.02);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.10);
        }
      `}</style>

      {/* ── Cinematic background: still poster → video → overlay → parallax glows ── */}
      <motion.div className="pointer-events-none fixed inset-0 z-0" style={{ opacity: bgFade }}>
        {/* Poster paints instantly and is the reduced-motion still. */}
        <img
          src="/hero-poster.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {!reduce && (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src="/hero-bg.mp4"
            poster="/hero-poster.jpg"
            autoPlay
            loop
            muted
            playsInline
          />
        )}
        {/* Contrast overlay — keep white type legible, deepen toward the fold edge. */}
        <div className="absolute inset-0 bg-[#141313]/60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#141313]/30 via-transparent to-[#141313]" />
        {/* Atmospheric glows drift on scroll (parallax). */}
        <motion.div
          style={{ y: glowY }}
          className="absolute left-1/2 top-[-10%] h-[60vh] w-[60vh] -translate-x-1/2 rounded-full bg-white/[0.05] blur-[120px]"
        />
        <motion.div
          style={{ y: glowY2 }}
          className="absolute bottom-[-10%] right-[-5%] h-[40vh] w-[40vh] rounded-full bg-white/[0.04] blur-[120px]"
        />
      </motion.div>

      {/* ── Top navigation ─────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: reduce ? 0 : -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
        className={`fixed top-0 z-50 w-full border-b transition-colors duration-500 ${
          scrolled ? 'vl-glass border-white/10' : 'border-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-5 md:px-16 md:py-6">
          <a href="#top" className="text-2xl tracking-tight text-white transition-opacity hover:opacity-80 md:text-3xl" style={serif}>
            Vivid&nbsp;Lingua<sup className="ml-0.5 text-xs align-super">®</sup>
          </a>

          <div className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#c4c7c8] transition-colors hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </div>

          <motion.button
            onClick={onLogin}
            whileHover={reduce ? undefined : { scale: 1.02 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            className="vl-glass group hidden items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-white transition-colors hover:bg-white/10 md:inline-flex"
          >
            Log in
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
          </motion.button>

          <button onClick={() => setMenuOpen((v) => !v)} className="p-2 text-white md:hidden" aria-label="Menu">
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="vl-glass border-t border-white/10 px-5 pb-6 pt-2 md:hidden">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className="block py-3 text-[12px] font-medium uppercase tracking-[0.2em] text-[#c4c7c8] hover:text-white"
              >
                {n.label}
              </a>
            ))}
            <button
              onClick={() => { setMenuOpen(false); onLogin(); }}
              className="mt-2 w-full rounded-full border border-white/15 py-3 text-[12px] font-medium uppercase tracking-[0.18em] text-white"
            >
              Log in
            </button>
          </div>
        )}
      </motion.nav>

      {/* ── Hero fold (the showcase) ───────────────────────────────────── */}
      <header className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 text-center md:px-16">
        <motion.p {...rise(0.15)} className="mb-7 text-[11px] font-medium uppercase tracking-[0.35em] text-[#8e9192]">
          German&nbsp;·&nbsp;English&nbsp;·&nbsp;Built for Mongolians
        </motion.p>

        <motion.h1
          variants={headlineContainer}
          initial="hidden"
          animate="show"
          className="mb-8 max-w-4xl text-[2.6rem] leading-[1.05] tracking-tight text-white md:text-[88px]"
          style={serif}
        >
          {HEADLINE_LINE_1.map((w, i) => (
            <motion.span
              key={`l1-${i}`}
              variants={headlineWord}
              className={`mr-[0.22em] inline-block ${w.em ? 'not-italic text-[#9a9d9e]' : ''}`}
            >
              {w.t}
            </motion.span>
          ))}
          <br className="hidden md:block" />
          {HEADLINE_LINE_2.map((w, i) => (
            <motion.span
              key={`l2-${i}`}
              variants={headlineWord}
              className={`mr-[0.22em] inline-block ${w.em ? 'not-italic text-[#9a9d9e]' : ''}`}
            >
              {w.t}
            </motion.span>
          ))}
        </motion.h1>

        <motion.p {...rise(0.6)} className="mb-3 max-w-2xl text-lg leading-relaxed text-[#c4c7c8]">
          German and English, crafted for Mongolian learners — read, write, listen,
          and speak your way to a new language, without the noise.
        </motion.p>
        <motion.p {...rise(0.6)} className="mb-12 text-sm text-[#8e9192]">
          Монголчуудад зориулсан герман, англи хэлний платформ.
        </motion.p>

        <motion.div
          {...(reduce
            ? rise(0.75)
            : {
                initial: { opacity: 0, y: 24, scale: 0.98 },
                animate: { opacity: 1, y: 0, scale: 1 },
                transition: { duration: 0.8, ease: EASE_OUT_EXPO, delay: 0.75 },
              })}
          className="flex flex-col items-center gap-4 sm:flex-row"
        >
          <motion.button
            onClick={onSignup}
            whileHover={reduce ? undefined : { scale: 1.02 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            className="group inline-flex items-center justify-center gap-3 rounded-full bg-white px-8 py-4 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#141313] transition-colors duration-300 hover:bg-[#e2e2e2]"
          >
            Begin journey
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </motion.button>
          <motion.button
            onClick={onLogin}
            whileHover={reduce ? undefined : { scale: 1.02 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            className="vl-glass inline-flex items-center justify-center rounded-full border border-white/15 px-8 py-4 text-[12px] font-medium uppercase tracking-[0.18em] text-white transition-colors hover:bg-white/10"
          >
            I already have an account
          </motion.button>
        </motion.div>

        {onGuest && (
          <motion.button
            {...rise(0.9)}
            onClick={onGuest}
            className="mt-6 text-[12px] uppercase tracking-[0.2em] text-[#8e9192] underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            Just browse — no account
          </motion.button>
        )}

        <motion.div
          {...rise(1.0)}
          className="absolute bottom-10 left-1/2 hidden -translate-x-1/2 flex-col items-center opacity-60 md:flex"
        >
          <span className="mb-2 text-[11px] uppercase tracking-[0.3em] text-[#8e9192]">Scroll</span>
          <motion.div
            animate={reduce ? undefined : { y: [0, 8, 0] }}
            transition={reduce ? undefined : { duration: 1.8, ease: 'easeInOut', repeat: Infinity }}
            className="h-12 w-px bg-gradient-to-b from-white/50 to-transparent"
          />
        </motion.div>
      </header>

      {/* ── Tracks ─────────────────────────────────────────────────────── */}
      <section id="tracks" className="relative z-10 mx-auto max-w-[1280px] px-5 py-24 md:px-16 md:py-32">
        <Reveal>
          <h2 className="mb-3 text-center text-3xl tracking-tight text-white md:text-5xl" style={serif}>
            Two languages. One quiet place to learn.
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-[#8e9192]">
            Pick a track after you sign in — your progress is saved across both.
          </p>
        </Reveal>

        <Stagger className="grid gap-5 md:grid-cols-2">
          <StaggerItem className="vl-glass rounded-xl border border-white/10 p-8 transition-colors hover:bg-white/[0.04]">
            <div className="mb-4 text-4xl" aria-hidden="true">🇩🇪</div>
            <h3 className="mb-2 text-2xl text-white" style={serif}>German</h3>
            <p className="text-[#c4c7c8]">
              A1–C2 with Mongolian explanations, an AI tutor, and TestDaF / Goethe-style
              model exams across all five skills.
            </p>
          </StaggerItem>
          <StaggerItem className="vl-glass rounded-xl border border-white/10 p-8 transition-colors hover:bg-white/[0.04]">
            <div className="mb-4 text-4xl" aria-hidden="true">🇺🇸</div>
            <h3 className="mb-2 text-2xl text-white" style={serif}>English</h3>
            <p className="text-[#c4c7c8]">
              A dedicated IELTS and SAT track — full practice tests, targeted vocabulary,
              and AI review written back in Mongolian.
            </p>
          </StaggerItem>
        </Stagger>
      </section>

      {/* ── Skills ─────────────────────────────────────────────────────── */}
      <section id="skills" className="relative z-10 mx-auto max-w-[1280px] px-5 py-24 md:px-16 md:py-32">
        <Reveal>
          <h2 className="mb-3 text-center text-3xl tracking-tight text-white md:text-5xl" style={serif}>
            One app — every skill.
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-[#8e9192]">
            Reading, listening, speaking, writing, vocabulary, and friendly competition —
            all in a single, distraction-free flow.
          </p>
        </Reveal>

        <Stagger
          staggerChildren={0.07}
          className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {SKILLS.map(({ icon: Icon, title, desc }) => (
            <StaggerItem key={title} className="bg-[#141313] p-8 transition-colors hover:bg-[#1c1b1b]">
              <Icon className="mb-4 h-6 w-6 text-white" strokeWidth={1.5} />
              <h3 className="mb-1.5 text-xl text-white" style={serif}>{title}</h3>
              <p className="text-sm leading-relaxed text-[#8e9192]">{desc}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── About / mission ────────────────────────────────────────────── */}
      <section id="about" className="relative z-10 mx-auto max-w-3xl px-5 py-24 text-center md:px-16 md:py-32">
        <Reveal amount={0.4}>
          <GraduationCap className="mx-auto mb-8 h-8 w-8 text-white/70" strokeWidth={1.25} />
          <blockquote className="text-2xl leading-snug text-[#e5e2e1] md:text-[34px]" style={serif}>
            “Намайг бага байхад ийм resource байсан бол би одоо 100% scholarship-тэй сурах байлаа.”
          </blockquote>
          <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.25em] text-[#8e9192]">
            Khansumber Altankhuyag — Founder, Vivid Lingua
          </p>
        </Reveal>
      </section>

      {/* ── Contact ────────────────────────────────────────────────────── */}
      <section id="contact" className="relative z-10 mx-auto max-w-[1280px] px-5 pb-8 md:px-16">
        <Reveal className="vl-glass rounded-xl border border-white/10 p-10 md:p-14">
          <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="mb-3 text-3xl text-white md:text-4xl" style={serif}>Reach us</h2>
              <p className="max-w-md text-[#c4c7c8]">
                Questions, feedback, or partnership ideas? We reply within 1–2 business days
                (Mon–Fri). Асуудлаа доорх хаягаар илгээнэ үү.
              </p>
            </div>
            <Stagger className="flex flex-col gap-3">
              <StaggerItem>
                <a
                  href="mailto:hanaa5qn@gmail.com"
                  className="vl-glass group inline-flex items-center gap-3 rounded-lg border border-white/10 px-5 py-3.5 text-white transition-colors hover:bg-white/10"
                >
                  <Mail className="h-4 w-4 text-[#c4c7c8]" />
                  <span className="text-sm tracking-wide">hanaa5qn@gmail.com</span>
                </a>
              </StaggerItem>
              <StaggerItem>
                <a
                  href="tel:+97672109647"
                  className="vl-glass group inline-flex items-center gap-3 rounded-lg border border-white/10 px-5 py-3.5 text-white transition-colors hover:bg-white/10"
                >
                  <Phone className="h-4 w-4 text-[#c4c7c8]" />
                  <span className="text-sm tracking-wide">+976 7210&#8209;9647</span>
                </a>
              </StaggerItem>
            </Stagger>
          </div>
        </Reveal>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-[1280px] px-5 py-24 text-center md:px-16 md:py-28">
        <Reveal>
          <h2 className="mb-8 text-4xl tracking-tight text-white md:text-6xl" style={serif}>
            Start today.
          </h2>
          <motion.button
            onClick={onSignup}
            whileHover={reduce ? undefined : { scale: 1.02 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            className="group inline-flex items-center justify-center gap-3 rounded-full bg-white px-9 py-4 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#141313] transition-colors duration-300 hover:bg-[#e2e2e2]"
          >
            Create your account
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </motion.button>
        </Reveal>
      </section>

      {/* ── Footer (simple fade) ───────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/10">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-4 px-5 py-8 text-[#8e9192] md:flex-row md:px-16"
        >
          <span className="text-xl text-white" style={serif}>Vivid&nbsp;Lingua<sup className="ml-0.5 text-[10px] align-super">®</sup></span>
          <div className="flex items-center gap-6 text-[11px] font-medium uppercase tracking-[0.18em]">
            <a href="/terms" className="transition-colors hover:text-white">Terms</a>
            <a href="/privacy" className="transition-colors hover:text-white">Privacy</a>
            <a href="/contact" className="transition-colors hover:text-white">Contact</a>
          </div>
          <span className="text-xs tracking-wide">© {new Date().getFullYear()} Vivid Lingua · Khansumber Altankhuyag</span>
        </motion.div>
      </footer>
    </div>
  );
}
