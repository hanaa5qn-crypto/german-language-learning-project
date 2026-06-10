// =============================================================================
// Vivid-Lingua — Curated external resources (Гадны шилдэг эх сурвалжууд)
// -----------------------------------------------------------------------------
// Интернэт дэх хамгийн сайн, үнэ төлбөргүй герман хэлний эх сурвалжуудыг ур
// чадвар (унших/сонсох/ярих/бичих) болон түвшин бүрээр ангилсан жагсаалт.
// Бүгд олон жил тогтвортой ажиллаж буй, нэр хүндтэй сайтууд (DW, Goethe …).
// =============================================================================

import { Level } from './library';

export type SkillTab = 'read' | 'listen' | 'speak' | 'write';

export interface ExternalResource {
  name: string;
  url: string;
  descMn: string;        // Монгол тайлбар — юунд хэрэгтэй, яаж ашиглах
  levels: Level[];       // Тохирох CEFR түвшнүүд
  skills: SkillTab[];    // Аль ур чадварт хэрэгтэй
  free: boolean;
}

export const EXTERNAL_RESOURCES: ExternalResource[] = [
  // --- Унших -----------------------------------------------------------------
  {
    name: 'DW Learn German',
    url: 'https://learngerman.dw.com/',
    descMn: 'Deutsche Welle-гийн үнэгүй бүрэн курс: A1–C1 түвшний уншлага, дасгал, дүрмийн тайлбартай. Германы төрийн өргөн нэвтрүүлгийн албан ёсны платформ.',
    levels: ['A1', 'A2', 'B1', 'B2', 'C1'], skills: ['read', 'listen'], free: true,
  },
  {
    name: 'Nachrichtenleicht',
    url: 'https://www.nachrichtenleicht.de/',
    descMn: 'Долоо хоног бүрийн мэдээг хялбар герман хэлээр (Leichte Sprache). Богино өгүүлбэр, энгийн үгтэй — A2–B1 түвшний уншигчдад төгс.',
    levels: ['A2', 'B1'], skills: ['read', 'listen'], free: true,
  },
  {
    name: 'Deutsch Perfekt',
    url: 'https://www.deutsch-perfekt.com/',
    descMn: 'Түвшин тус бүрээр (leicht/mittel/schwer) тэмдэглэгдсэн нийтлэлүүд. Үгийн тайлбартай тул B1-ээс дээш уншлагад маш сайн.',
    levels: ['A2', 'B1', 'B2', 'C1'], skills: ['read'], free: true,
  },
  {
    name: 'Tagesschau',
    url: 'https://www.tagesschau.de/',
    descMn: 'Германы №1 мэдээний сайт — жинхэнэ (эх) хэл дээрх мэдээ. B2-оос дээш түвшинд өдөр бүр унших дадал болго.',
    levels: ['B2', 'C1', 'C2'], skills: ['read', 'listen'], free: true,
  },
  {
    name: 'Projekt Gutenberg-DE',
    url: 'https://www.projekt-gutenberg.org/',
    descMn: 'Германы сонгодог уран зохиолын асар том үнэгүй сан (Гёте, Кафка, Гессе…). C1–C2 түвшний гүнзгий уншлагад.',
    levels: ['C1', 'C2'], skills: ['read'], free: true,
  },
  // --- Сонсох ------------------------------------------------------------------
  {
    name: 'Nicos Weg (DW)',
    url: 'https://learngerman.dw.com/en/nicos-weg/c-36519789',
    descMn: 'Кино шиг үргэлжилсэн түүхтэй, дэлхийд хамгийн алдартай үнэгүй видео курс. A1–B1 түвшнийг бүрэн хамарна.',
    levels: ['A1', 'A2', 'B1'], skills: ['listen', 'read'], free: true,
  },
  {
    name: 'Slow German mit Annik Rubens',
    url: 'https://slowgerman.com/',
    descMn: 'Удаан, тод ярьдаг подкаст — текст (transcript) дагалддаг тул сонсоод уншиж шалгаж болно. A2–B2.',
    levels: ['A2', 'B1', 'B2'], skills: ['listen'], free: true,
  },
  {
    name: 'Easy German (YouTube)',
    url: 'https://www.youtube.com/@EasyGerman',
    descMn: 'Гудамжны жинхэнэ ярилцлагууд — герман/англи давхар хадмалтай. Амьд ярианы хэлд дасахад хамгийн сайн суваг.',
    levels: ['A2', 'B1', 'B2', 'C1'], skills: ['listen', 'speak'], free: true,
  },
  {
    name: 'Langsam gesprochene Nachrichten (DW)',
    url: 'https://learngerman.dw.com/de/langsam-gesprochene-nachrichten/s-61126111',
    descMn: 'Өдөр бүрийн мэдээг удаан хурдтайгаар уншиж өгдөг — текст дагалдана. B1–B2 сонсголын бэлтгэлд туйлын тохиромжтой.',
    levels: ['B1', 'B2'], skills: ['listen'], free: true,
  },
  {
    name: 'ARD Audiothek',
    url: 'https://www.ardaudiothek.de/',
    descMn: 'Германы радиогийн бүх подкаст, аудио жүжиг нэг дор. C1–C2 түвшинд жинхэнэ контентоор өөрийгөө сорь.',
    levels: ['B2', 'C1', 'C2'], skills: ['listen'], free: true,
  },
  // --- Ярих --------------------------------------------------------------------
  {
    name: 'Tandem',
    url: 'https://tandem.net/',
    descMn: 'Хэл солилцооны апп: чи монгол хэл заагаад, герман хүнээс герман хэл сур. Жинхэнэ хүнтэй ярих хамгийн хялбар арга.',
    levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], skills: ['speak', 'write'], free: true,
  },
  {
    name: 'ConversationExchange',
    url: 'https://www.conversationexchange.com/',
    descMn: 'Захидал, дуудлага, биечлэн уулзах хэлний хамтрагч олох үнэгүй сайт.',
    levels: ['A2', 'B1', 'B2', 'C1'], skills: ['speak', 'write'], free: true,
  },
  {
    name: 'Forvo',
    url: 'https://forvo.com/languages/de/',
    descMn: 'Дурын герман үгийн дуудлагыг эх хэлтнээр сонсох толь. Дуудлагаа засахад өдөр бүр ашигла.',
    levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], skills: ['speak'], free: true,
  },
  {
    name: 'Goethe-Institut: Deutsch für dich',
    url: 'https://www.goethe.de/prj/dfd/de/home.cfm',
    descMn: 'Гёте институтын үнэгүй нийгэмлэг: дасгал, тоглоом, хамтран суралцагчид. Шалгалтын бэлтгэл материал нь маш чанартай.',
    levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], skills: ['speak', 'read', 'listen', 'write'], free: true,
  },
  // --- Бичих ---------------------------------------------------------------------
  {
    name: 'Journaly',
    url: 'https://journaly.com/',
    descMn: 'Герман хэлээр өдрийн тэмдэглэл бич — эх хэлтнүүд алдааг чинь засаж өгнө. Бичгийн дадалд хамгийн сайн платформ.',
    levels: ['A2', 'B1', 'B2', 'C1', 'C2'], skills: ['write'], free: true,
  },
  {
    name: 'LangCorrect',
    url: 'https://langcorrect.com/',
    descMn: 'Бичсэн зүйлээ оруулахад эх хэлтнүүд мөр мөрөөр нь засдаг үнэгүй сайт.',
    levels: ['A1', 'A2', 'B1', 'B2', 'C1'], skills: ['write'], free: true,
  },
  {
    name: 'Lingolia Deutsch',
    url: 'https://deutsch.lingolia.com/de/',
    descMn: 'Дүрмийн ойлгомжтой тайлбар + дасгалууд. Бичихдээ эргэлздэг дүрмээ эндээс шалга (цаг, артикль, өгүүлбэрийн бүтэц).',
    levels: ['A1', 'A2', 'B1', 'B2', 'C1'], skills: ['write', 'read'], free: true,
  },
  {
    name: 'Mein-Deutschbuch',
    url: 'https://mein-deutschbuch.de/',
    descMn: 'Дүрэм, бичгийн загвар (захидал, и-мэйл, эссэ), татаж авах дасгалууд — бүгд үнэгүй.',
    levels: ['A1', 'A2', 'B1', 'B2'], skills: ['write'], free: true,
  },
  // --- Шалгалт -------------------------------------------------------------------
  {
    name: 'Goethe-Institut шалгалтын жишиг материал',
    url: 'https://www.goethe.de/de/spr/kup/prf/prf.html',
    descMn: 'Goethe-Zertifikat A1–C2 шалгалт бүрийн албан ёсны жишиг хувилбарууд (Modellsätze) — бүх 4 ур чадвараар.',
    levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], skills: ['read', 'listen', 'speak', 'write'], free: true,
  },
];

// Тухайн таб + түвшинд тохирох эх сурвалжуудыг шүүж буцаана.
export function resourcesFor(skill: SkillTab, level: Level | 'all'): ExternalResource[] {
  return EXTERNAL_RESOURCES.filter(
    (r) => r.skills.includes(skill) && (level === 'all' || r.levels.includes(level)),
  );
}
