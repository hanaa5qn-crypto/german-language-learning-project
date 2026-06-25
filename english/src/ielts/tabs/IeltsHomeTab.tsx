// =============================================================================
// IELTS — Home / overview tab.
// -----------------------------------------------------------------------------
// Explains the IELTS exam (four skills, the 0–9 band scale, Academic vs General
// Training) and offers quick-start cards that jump straight into a study tab via
// the onGo callback. A short Mongolian subtitle frames the page for learners.
// =============================================================================
import React from 'react';
import {
  BookOpen, Headphones, Edit3, Mic, BookA, ClipboardList,
  GraduationCap, Award, ArrowRight,
} from 'lucide-react';
import StreakLeaderboard from '../../StreakLeaderboard';

// Tab keys the home cards can navigate to (mirrors the shell's tab union).
export type IeltsTabKey =
  | 'home' | 'reading' | 'listening' | 'writing' | 'speaking' | 'vocab' | 'tests';

const SKILLS: { icon: React.ElementType; name: string; mn: string; detail: string }[] = [
  { icon: BookOpen, name: 'Reading', mn: 'Унших', detail: '60 минут · 3 эх бичвэр · 40 асуулт' },
  { icon: Headphones, name: 'Listening', mn: 'Сонсох', detail: '30 минут · 4 хэсэг · 40 асуулт' },
  { icon: Edit3, name: 'Writing', mn: 'Бичих', detail: '60 минут · Task 1 (150 үг) + Task 2 (250 үг)' },
  { icon: Mic, name: 'Speaking', mn: 'Ярих', detail: '11–14 минут · 3 хэсэг · ярилцлага' },
];

const QUICK: { tab: IeltsTabKey; icon: React.ElementType; title: string; mn: string }[] = [
  { tab: 'reading', icon: BookOpen, title: 'Reading practice', mn: 'Эрдэм шинжилгээний эх бичвэр унших' },
  { tab: 'listening', icon: Headphones, title: 'Listening practice', mn: 'Британи хоолойтой аудио сонсох' },
  { tab: 'writing', icon: Edit3, title: 'Writing + AI feedback', mn: 'Task 1 & 2 бичээд үнэлгээ авах' },
  { tab: 'speaking', icon: Mic, title: 'Speaking + AI feedback', mn: 'Part 1–3 ярьж дадлага хийх' },
  { tab: 'vocab', icon: BookA, title: 'Vocabulary', mn: 'Үгийн флэшкарт сурах' },
  { tab: 'tests', icon: ClipboardList, title: 'Practice Tests', mn: 'Бүрэн дасгал шалгалт өгөх' },
];

export default function IeltsHomeTab({ onGo }: { onGo: (tab: IeltsTabKey) => void }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-10">
      <StreakLeaderboard />

      <section className="rounded-3xl bg-ink-raise p-7 sm:p-9">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-2 text-paper px-3 py-1 text-xs font-bold">
          <GraduationCap className="w-4 h-4" /> IELTS бэлтгэл
        </span>
        <h1 className="text-3xl sm:text-4xl font-serif font-light tracking-tight text-paper mt-4">
          Master all four IELTS skills
        </h1>
        <p className="text-paper-2 text-lg mt-2">
          Унших, сонсох, бичих, ярих — дөрвөн ур чадварыг нэг дор дадлагажуулж, AI-аас Монгол хэлээр үнэлгээ аваарай.
        </p>
        <div className="flex flex-wrap gap-3 mt-6">
          <button
            onClick={() => onGo('tests')}
            className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-6 py-3 font-bold"
          >
            <ClipboardList className="w-4 h-4" /> Дасгал шалгалт өгөх
          </button>
          <button
            onClick={() => onGo('reading')}
            className="inline-flex items-center gap-2 rounded-full bg-ink-2 text-paper px-6 py-3 font-bold hover:bg-ink-raise"
          >
            Дадлага эхлүүлэх <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-paper mb-4">The four skills · Дөрвөн ур чадвар</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SKILLS.map((s) => (
            <div key={s.name} className="rounded-2xl bg-ink-raise p-5 flex gap-4">
              <span className="rounded-2xl bg-ink-2 text-paper p-3 h-fit">
                <s.icon className="w-6 h-6" />
              </span>
              <div>
                <h3 className="font-bold text-paper">
                  {s.name} <span className="text-paper-2 font-normal">· {s.mn}</span>
                </h3>
                <p className="text-sm text-paper-2 mt-1">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-ink-raise p-6">
          <h2 className="font-bold text-paper flex items-center gap-2">
            <Award className="w-5 h-5 text-paper" /> Band scale 0–9
          </h2>
          <p className="text-paper-2 text-sm mt-2">
            IELTS-ийг 0-оос 9 хүртэлх band-аар үнэлдэг. Дөрвөн хэсгийн дундажаар нийт оноо гарна.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-paper">
            <li><span className="font-bold text-paper">9.0</span> — Expert: бараг төгс</li>
            <li><span className="font-bold text-paper">7.0</span> — Good: сайн, цөөн алдаатай</li>
            <li><span className="font-bold text-paper">6.0</span> — Competent: ерөнхийдөө ойлгомжтой</li>
            <li><span className="font-bold text-paper">5.0</span> — Modest: суурь чадвартай</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-ink-raise p-6">
          <h2 className="font-bold text-paper flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-paper" /> Academic vs General
          </h2>
          <p className="text-paper-2 text-sm mt-2">
            Хоёр төрөл байдаг. Сонсох, ярих хэсэг ижил; Унших, бичих хэсэг ялгаатай.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-paper">
            <li>
              <span className="font-bold">Academic</span> — их сургууль, мэргэжлийн бүртгэлд.
              График/процесс тайлбарлах Task 1.
            </li>
            <li>
              <span className="font-bold">General Training</span> — цагаачлал, ажилд. Захидал бичих Task 1.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-paper mb-4">Quick start · Хурдан эхлэх</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK.map((q) => (
            <button
              key={q.tab}
              onClick={() => onGo(q.tab)}
              className="group text-left rounded-2xl bg-ink-raise hover:bg-ink-2 p-5 transition-colors"
            >
              <span className="rounded-2xl bg-ink-2 text-paper p-2.5 inline-flex">
                <q.icon className="w-5 h-5" />
              </span>
              <h3 className="font-bold text-paper mt-3">{q.title}</h3>
              <p className="text-sm text-paper-2 mt-1">{q.mn}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-paper text-sm font-semibold">
                Эхлэх <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
