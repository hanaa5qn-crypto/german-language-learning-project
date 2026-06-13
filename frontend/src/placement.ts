// =============================================================================
// Vivid-Lingua — Түвшин тогтоох үнэлгээний тест (adaptive placement test)
// -----------------------------------------------------------------------------
// Шинэ хэрэглэгч бүртгүүлсний дараа дөрвөн ур чадварыг (Унших, Сонсох, Бичих,
// Ярих) бүгдийг хамарсан 60 асуулттай, 40–50 минутын үнэлгээний тест өгнө.
//
// Тест ДАСАН ЗОХИЦОХ (adaptive staircase) зарчмаар явна: дараалан зөв хариулах
// тусам дараагийн асуулт нэг түвшингээр хүндэрч (A1 → C2), буруу хариулбал нэг
// түвшингээр хөнгөрнө. Ингэснээр суралцагч өөрийн бодит түвшний орчимд гүнзгий
// бодож хариулна. Эцсийн түвшин = тогтвортой (≥60% оноотой, хангалттай олон
// асуулт үзсэн) барьж чадсан хамгийн өндөр түвшин.
//
// Үр дүнг нээж үзэх нь төлбөртэй (PLACEMENT_RESULT_PRICE_MNT). Тест дуусахаас
// өмнө үнийн мэдээллийг харуулахгүй. FOUNDER_EMAILS жагсаалтын данснууд
// төлбөргүй нээнэ.
// =============================================================================

import {
  READING_LIBRARY, LISTENING_LIBRARY,
  getReadingQuestions, getListeningQuestions, shuffleQuiz,
} from './library';
import { EXAM_LEVEL_ORDER, ExamLevel } from './exams';
import { FOUNDER_EMAILS } from './plans';

export type PlacementSkill = 'read' | 'listen' | 'write' | 'speak';

export interface PlacementQuestion {
  id: string;
  level: ExamLevel;
  skill: PlacementSkill;
  instruction: string;   // Монгол заавар
  passage?: string;      // Дэлгэцэнд харуулах герман бичвэр (унших)
  audioText?: string;    // TTS-ээр сонсгох герман бичвэр (харуулахгүй)
  question: string;      // Асуулт (монгол)
  choices: string[];
  correctIndex: number;
}

export interface PlacementSkillScore {
  correct: number;
  total: number;
}

export interface PlacementLevelStat {
  asked: number;
  correct: number;
}

// Profile-д хадгалагдах үр дүнгийн бичлэг. `unlocked` нь суралцагч үр дүнгээ
// нээж үзсэн эсэх (төлбөр төлсөн эсвэл founder).
export interface PlacementRecord {
  takenAt: string;
  level: ExamLevel;
  totalCorrect: number;
  totalQuestions: number;
  skillScores: Record<PlacementSkill, PlacementSkillScore>;
  levelStats: Record<string, PlacementLevelStat>;
  unlocked: boolean;
  // 'qpay' kept so records stored before the Byl migration still parse.
  // 'subscription' = unlocked with a free eval credit from a paid plan.
  unlockedBy?: 'founder' | 'byl' | 'qpay' | 'dummy' | 'subscription';
}

export const PLACEMENT_RESULT_PRICE_MNT = 5000;

// Нийт асуултын тоо. ~40–50 секунд/асуулт (унших эх, сонсголын давталт
// оруулаад) гэж тооцоход тест 40–50 минут үргэлжилнэ.
export const PLACEMENT_TOTAL_QUESTIONS = 60;

// Дараалсан хэдэн зөв хариулт түвшинг нэг шатаар ахиулах вэ.
export const STREAK_TO_LEVEL_UP = 2;

// Түвшин "тогтвортой барьсан" гэж тооцох доод нарийвчлал ба асуултын тоо.
export const LEVEL_PASS_RATIO = 0.6;
export const LEVEL_MIN_ASKED = 3;

// Ур чадварын ээлжлэх дараалал: унших/сонсох сан баялаг тул давтамж өндөр
// (60 асуултад: унших 20, сонсох 20, бичих 10, ярих 10).
export const SKILL_SEQUENCE: PlacementSkill[] = ['read', 'listen', 'write', 'read', 'listen', 'speak'];

// Founder данснууд (plans.ts-ийн нэгдсэн FOUNDER_EMAILS жагсаалт) үр дүнг
// төлбөргүй нээнэ.
export function isFounderEmail(email: string | undefined | null): boolean {
  return FOUNDER_EMAILS.includes((email ?? '').trim().toLowerCase());
}

// -----------------------------------------------------------------------------
// Бичих ур чадвар — түвшин бүрт 3 "аль өгүүлбэр зөв бэ" сонголт.
// Доод түвшинд алдаа нь илт, дээд түвшинд нарийн (дүрэм, падеж, Konjunktiv).
// -----------------------------------------------------------------------------
type BankQuestion = Omit<PlacementQuestion, 'id' | 'level' | 'skill'>;

const WRITING_QUESTIONS: Record<ExamLevel, BankQuestion[]> = {
  A1: [
    {
      instruction: 'Бичих чадвар',
      question: 'Аль өгүүлбэр нь зөв бичигдсэн бэ?',
      choices: [
        'Ich heißen Anna und kommst aus Mongolei.',
        'Ich heiße Anna und komme aus der Mongolei.',
        'Ich heiße Anna und kommen aus die Mongolei.',
      ],
      correctIndex: 1,
    },
    {
      instruction: 'Бичих чадвар',
      question: 'Олон тооны хэлбэрийн аль өгүүлбэр зөв бэ?',
      choices: [
        'Das sind meine Bücher.',
        'Das sind meine Buchs.',
        'Das sind meinen Bücher.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Бичих чадвар',
      question: 'Үгийн дарааллын хувьд аль өгүүлбэр зөв бэ?',
      choices: [
        'Am Montag ich gehe zur Schule.',
        'Am Montag gehe zur Schule ich.',
        'Am Montag gehe ich zur Schule.',
      ],
      correctIndex: 2,
    },
  ],
  A2: [
    {
      instruction: 'Бичих чадвар',
      question: 'Өнгөрсөн цагийн (Perfekt) аль өгүүлбэр зөв бэ?',
      choices: [
        'Gestern bin ich früh aufgestanden und habe Brot gekauft.',
        'Gestern ich bin früh aufstehen und kaufte Brot.',
        'Gestern habe ich früh aufgestanden und bin Brot gekauft.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Бичих чадвар',
      question: 'Модаль үйл үгтэй аль өгүүлбэр зөв бэ?',
      choices: [
        'Ich machen muss heute meine Hausaufgaben.',
        'Ich muss heute meine Hausaufgaben machen.',
        'Ich muss heute meine Hausaufgaben mache.',
      ],
      correctIndex: 1,
    },
    {
      instruction: 'Бичих чадвар',
      question: 'Харьцуулсан зэргийн аль өгүүлбэр зөв бэ?',
      choices: [
        'Mein Bruder ist älter wie ich.',
        'Mein Bruder ist mehr alt als ich.',
        'Mein Bruder ist älter als ich.',
      ],
      correctIndex: 2,
    },
  ],
  B1: [
    {
      instruction: 'Бичих чадвар',
      question: 'Гишүүн өгүүлбэртэй (Nebensatz) аль хувилбар зөв бэ?',
      choices: [
        'Ich weiß nicht, ob er hat morgen Zeit.',
        'Ich nicht weiß, ob er morgen Zeit hat.',
        'Ich weiß nicht, ob er morgen Zeit hat.',
      ],
      correctIndex: 2,
    },
    {
      instruction: 'Бичих чадвар',
      question: '"weil" холбоостой аль өгүүлбэр зөв бэ?',
      choices: [
        'Ich bleibe zu Hause, weil ich krank bin.',
        'Ich bleibe zu Hause, weil ich bin krank.',
        'Ich bleibe zu Hause, weil bin ich krank.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Бичих чадвар',
      question: 'Хамаарах төлөөний үгтэй (Relativsatz) аль өгүүлбэр зөв бэ?',
      choices: [
        'Der Mann, der steht dort, ist mein Lehrer.',
        'Der Mann, der dort steht, ist mein Lehrer.',
        'Der Mann, wo dort steht, ist mein Lehrer.',
      ],
      correctIndex: 1,
    },
  ],
  B2: [
    {
      instruction: 'Бичих чадвар',
      question: 'Passiv хэлбэрийн аль өгүүлбэр зөв бэ?',
      choices: [
        'Der Bericht muss bis Freitag abgeben werden.',
        'Der Bericht muss bis Freitag abgegeben werden.',
        'Der Bericht müssen bis Freitag abgegeben wird.',
      ],
      correctIndex: 1,
    },
    {
      instruction: 'Бичих чадвар',
      question: 'Genitiv угтвар үгтэй аль өгүүлбэр албан бичгийн хэлэнд зөв бэ?',
      choices: [
        'Wegen des schlechten Wetters wurde das Konzert abgesagt.',
        'Wegen dem schlechten Wetter wurde das Konzert abgesagt.',
        'Wegen des schlechten Wetters wurde das Konzert abgesagen.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Бичих чадвар',
      question: '"zu + Infinitiv" бүтэцтэй аль өгүүлбэр зөв бэ?',
      choices: [
        'Ich habe vor, im Sommer nach Deutschland fahren.',
        'Ich habe vor, zu fahren im Sommer nach Deutschland.',
        'Ich habe vor, im Sommer nach Deutschland zu fahren.',
      ],
      correctIndex: 2,
    },
  ],
  C1: [
    {
      instruction: 'Бичих чадвар',
      question: 'Konjunktiv II ашигласан аль өгүүлбэр зөв бэ?',
      choices: [
        'Hätte ich davon gewusst, wäre ich früher gekommen.',
        'Hätte ich davon wissen, wäre ich früher gekommen.',
        'Hätte ich davon gewusst, war ich früher gekommen.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Бичих чадвар',
      question: 'Тодотгол бүтэцтэй (Partizipialattribut) аль өгүүлбэр зөв бэ?',
      choices: [
        'Die in der Studie veröffentlichte Ergebnisse überraschten viele Experten.',
        'Die in der Studie veröffentlichten Ergebnisse überraschten viele Experten.',
        'Die in der Studie veröffentlichten Ergebnisse überraschte viele Experten.',
      ],
      correctIndex: 1,
    },
    {
      instruction: 'Бичих чадвар',
      question: 'Шууд бус яриа (Konjunktiv I) аль өгүүлбэрт зөв бэ?',
      choices: [
        'Der Minister erklärte, die Lage seien unter Kontrolle.',
        'Der Minister erklärte, dass die Lage unter Kontrolle gewesen wird.',
        'Der Minister erklärte, die Lage sei unter Kontrolle.',
      ],
      correctIndex: 2,
    },
  ],
  C2: [
    {
      instruction: 'Бичих чадвар',
      question: 'Албан найруулгын аль өгүүлбэр бүрэн зөв бэ?',
      choices: [
        'Ungeachtet die anhaltende Kritik hielt der Senat an seinem Beschluss fest.',
        'Ungeachtet der anhaltenden Kritik hielt der Senat an seinen Beschluss fest.',
        'Ungeachtet der anhaltenden Kritik hielt der Senat an seinem Beschluss fest.',
      ],
      correctIndex: 2,
    },
    {
      instruction: 'Бичих чадвар',
      question: 'Модаль үйл үгийн Ersatzinfinitiv хэлбэр аль өгүүлбэрт зөв бэ?',
      choices: [
        'Er hätte das Projekt abschließen können, wenn man ihn gelassen hätte.',
        'Er hätte das Projekt abschließen gekonnt, wenn man ihn gelassen hätte.',
        'Er hätte das Projekt abgeschlossen können, wenn man ihn gelassen hätte.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Бичих чадвар',
      question: '"bedürfen" үйл үгтэй аль өгүүлбэр зөв бэ?',
      choices: [
        'Die Erörterung der Frage bedarf eine gründliche Vorbereitung.',
        'Die Erörterung der Frage bedarf einer gründlichen Vorbereitung.',
        'Die Erörterung der Frage bedarf einen gründlichen Vorbereitung.',
      ],
      correctIndex: 1,
    },
  ],
};

// -----------------------------------------------------------------------------
// Ярих ур чадвар — түвшин бүрт 3 "нөхцөл байдалд тохирох хариу" сонголт.
// -----------------------------------------------------------------------------
const SPEAKING_QUESTIONS: Record<ExamLevel, BankQuestion[]> = {
  A1: [
    {
      instruction: 'Ярих чадвар — Танилцах үед: „Wie heißt du?"',
      question: 'Аль хариулт хамгийн тохиромжтой вэ?',
      choices: ['Ich heiße Bold.', 'Ich bin 20 Jahre.', 'Ich wohne gern.'],
      correctIndex: 0,
    },
    {
      instruction: 'Ярих чадвар — Шинэ хүнтэй ярилцахад: „Woher kommst du?"',
      question: 'Аль хариулт хамгийн тохиромжтой вэ?',
      choices: [
        'Ich gehe nach Hause.',
        'Ich komme aus der Mongolei.',
        'Ich bin Lehrer von Beruf gern.',
      ],
      correctIndex: 1,
    },
    {
      instruction: 'Ярих чадвар — Дэлгүүрт барааны үнэ асуухдаа:',
      question: 'Аль хэллэг хамгийн зөв бэ?',
      choices: [
        'Entschuldigung, wo ist das Geld?',
        'Das ist teuer, danke tschüss.',
        'Entschuldigung, was kostet das?',
      ],
      correctIndex: 2,
    },
  ],
  A2: [
    {
      instruction: 'Ярих чадвар — Кафед: „Was möchten Sie bestellen?"',
      question: 'Аль хариулт хамгийн тохиромжтой вэ?',
      choices: [
        'Ich bin ein Kaffee.',
        'Ich hätte gern einen Kaffee, bitte.',
        'Kaffee mich bitte geben.',
      ],
      correctIndex: 1,
    },
    {
      instruction: 'Ярих чадвар — Жуулчин танаас асуув: „Wie komme ich zum Bahnhof?"',
      question: 'Аль хариулт хамгийн тохиромжтой вэ?',
      choices: [
        'Gehen Sie geradeaus und dann links.',
        'Der Bahnhof ist ein großes Gebäude.',
        'Ich fahre gern Zug.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Ярих чадвар — Найз чинь: „Hast du am Freitag Zeit?"',
      question: 'Аль хариулт хамгийн тохиромжтой вэ?',
      choices: [
        'Freitag ist ein Tag.',
        'Ich habe eine Uhr.',
        'Ja, am Freitag passt es mir gut.',
      ],
      correctIndex: 2,
    },
  ],
  B1: [
    {
      instruction: 'Ярих чадвар — Найз чинь: „Kommst du mit ins Kino?" Та өнөөдөр завгүй.',
      question: 'Аль хариулт хамгийн эелдэг бөгөөд зөв бэ?',
      choices: [
        'Nein.',
        'Das Kino ist ein Gebäude.',
        'Tut mir leid, ich kann heute nicht — ich muss lernen.',
      ],
      correctIndex: 2,
    },
    {
      instruction: 'Ярих чадвар — Эмчид шинж тэмдгээ тайлбарлахдаа:',
      question: 'Аль хэллэг хамгийн тохиромжтой вэ?',
      choices: [
        'Ich habe seit drei Tagen Kopfschmerzen und fühle mich schwach.',
        'Mein Kopf ist ein Problem für die Welt.',
        'Geben Sie mir alles Medikamente.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Ярих чадвар — Хамтран ажиллагчаасаа тусламж хүсэхдээ:',
      question: 'Аль хэллэг хамгийн эелдэг бэ?',
      choices: [
        'Mach das für mich, schnell.',
        'Könntest du mir kurz bei diesem Bericht helfen?',
        'Der Bericht ist nicht mein Hobby.',
      ],
      correctIndex: 1,
    },
  ],
  B2: [
    {
      instruction: 'Ярих чадвар — Ажлын ярилцлагад: „Warum möchten Sie bei uns arbeiten?"',
      question: 'Аль хариулт хамгийн тохиромжтой вэ?',
      choices: [
        'Ihre Firma ist innovativ, und ich möchte meine Erfahrung im Marketing einbringen.',
        'Weil ich Geld brauche.',
        'Ich arbeite nicht gern.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Ярих чадвар — Хэлэлцүүлэгт санал нийлэхгүй байгаагаа илэрхийлэхдээ:',
      question: 'Аль хэллэг хамгийн зохистой вэ?',
      choices: [
        'Nein, das ist dumm.',
        'Ich höre dir nicht mehr zu.',
        'Da bin ich anderer Meinung — meiner Erfahrung nach funktioniert das selten.',
      ],
      correctIndex: 2,
    },
    {
      instruction: 'Ярих чадвар — Илтгэлийн дараа: „Können Sie das genauer erläutern?"',
      question: 'Аль хариулт хамгийн мэргэжлийн вэ?',
      choices: [
        'Nein, das war alles.',
        'Gern — lassen Sie mich das an einem Beispiel verdeutlichen.',
        'Das habe ich doch schon gesagt, hören Sie zu.',
      ],
      correctIndex: 1,
    },
  ],
  C1: [
    {
      instruction: 'Ярих чадвар — Хэлэлцүүлэгт эсрэг байр суурьтай хүнд хариулахдаа:',
      question: 'Аль хариулт хамгийн өндөр түвшний харилцааг илтгэх вэ?',
      choices: [
        'Sie haben unrecht, Punkt.',
        'Da haben Sie einen wichtigen Punkt angesprochen; dennoch gebe ich zu bedenken, dass es auch Gegenbeispiele gibt.',
        'Ich will darüber nicht reden.',
      ],
      correctIndex: 1,
    },
    {
      instruction: 'Ярих чадвар — Хурлын төгсгөлд шийдвэр гаргахын өмнө:',
      question: 'Аль хэллэг хамгийн тохиромжтой вэ?',
      choices: [
        'Lassen Sie mich die wichtigsten Punkte kurz zusammenfassen, bevor wir entscheiden.',
        'Wir sind fertig, oder?',
        'Ich fasse zusammen: alles war gut.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Ярих чадвар — Ярилцлагыг эелдгээр таслахдаа:',
      question: 'Аль хэллэг хамгийн зохистой вэ?',
      choices: [
        'Stopp, Sie reden zu viel.',
        'Moment, jetzt rede ich.',
        'Darf ich an dieser Stelle kurz einhaken? Mir scheint, wir vermischen zwei Fragen.',
      ],
      correctIndex: 2,
    },
  ],
  C2: [
    {
      instruction: 'Ярих чадвар — Илтгэлийн дараа ширүүн шүүмжлэлд хариулахдаа:',
      question: 'Аль хариулт хамгийн чадварлаг вэ?',
      choices: [
        'Der Einwand ist falsch, weil ich recht habe.',
        'Dazu sage ich nichts.',
        'Ihr Einwand trifft einen wunden Punkt — lassen Sie mich präzisieren, worin sich unsere Lesarten unterscheiden.',
      ],
      correctIndex: 2,
    },
    {
      instruction: 'Ярих чадвар — Академик маргаанд өрсөлдөгчийн хурц томьёоллыг зөөлрүүлэхдээ:',
      question: 'Аль хариулт хамгийн нюанстай вэ?',
      choices: [
        'Ihre Zuspitzung ist rhetorisch wirkungsvoll, verdeckt aber, dass unsere Positionen näher beieinanderliegen, als es scheint.',
        'Sie übertreiben, also haben Sie unrecht.',
        'Das ist mir zu kompliziert formuliert.',
      ],
      correctIndex: 0,
    },
    {
      instruction: 'Ярих чадвар — Саналыг дипломатаар татгалзахдаа:',
      question: 'Аль хэллэг хамгийн боловсронгуй вэ?',
      choices: [
        'Nein danke, kein Interesse, tschüss.',
        'So verlockend das Angebot ist — ich fürchte, ich muss es schweren Herzens ausschlagen.',
        'Vielleicht, mal sehen, keine Ahnung.',
      ],
      correctIndex: 1,
    },
  ],
};

// -----------------------------------------------------------------------------
// Асуултын сан: түвшин × ур чадвар бүрд жагсаалт. Унших/сонсох асуултууд номын
// сангаас (нэг дасгал 2-3 асуулттай), бичих/ярих нь дээрх гар сангаас.
// Хариултын байрлалыг deterministic байдлаар холино ("үргэлж Б" таахаас сэргийлнэ).
// -----------------------------------------------------------------------------
const ITEMS_PER_LEVEL = 6; // нэг түвшинд хэдэн унших/сонсох дасгалаас асуулт авах вэ

function buildPool(): Record<ExamLevel, Record<PlacementSkill, PlacementQuestion[]>> {
  const pool = {} as Record<ExamLevel, Record<PlacementSkill, PlacementQuestion[]>>;

  for (const level of EXAM_LEVEL_ORDER) {
    const read: PlacementQuestion[] = [];
    for (const item of READING_LIBRARY.filter((x) => x.level === level).slice(0, ITEMS_PER_LEVEL)) {
      getReadingQuestions(item).forEach((q, qi) => {
        const id = `pl_read_${item.id}_${qi}`;
        const mixed = shuffleQuiz(id, q);
        read.push({
          id, level, skill: 'read',
          instruction: 'Унших чадвар — бичвэрийг уншаад асуултад хариулна уу.',
          passage: item.text,
          question: mixed.question, choices: mixed.choices, correctIndex: mixed.correctIndex,
        });
      });
    }

    const listen: PlacementQuestion[] = [];
    for (const item of LISTENING_LIBRARY.filter((x) => x.level === level).slice(0, ITEMS_PER_LEVEL)) {
      getListeningQuestions(item).forEach((q, qi) => {
        const id = `pl_listen_${item.id}_${qi}`;
        const mixed = shuffleQuiz(id, q);
        listen.push({
          id, level, skill: 'listen',
          instruction: 'Сонсох чадвар — бичлэгийг сонсоод асуултад хариулна уу.',
          audioText: item.audioText,
          question: mixed.question, choices: mixed.choices, correctIndex: mixed.correctIndex,
        });
      });
    }

    pool[level] = {
      read,
      listen,
      write: WRITING_QUESTIONS[level].map((q, i) => ({ id: `pl_write_${level}_${i}`, level, skill: 'write', ...q })),
      speak: SPEAKING_QUESTIONS[level].map((q, i) => ({ id: `pl_speak_${level}_${i}`, level, skill: 'speak', ...q })),
    };
  }

  return pool;
}

export const PLACEMENT_POOL = buildPool();

// id → асуулт (UI ба тестэд ашиглах хайлтын хүснэгт).
export const PLACEMENT_QUESTION_INDEX: Map<string, PlacementQuestion> = new Map(
  EXAM_LEVEL_ORDER.flatMap((level) =>
    (Object.values(PLACEMENT_POOL[level]) as PlacementQuestion[][]).flat().map((q) => [q.id, q] as const),
  ),
);

// -----------------------------------------------------------------------------
// Дасан зохицох (staircase) хөдөлгүүр
// -----------------------------------------------------------------------------

// Хариултын дараах түвшний шилжилт: дараалан STREAK_TO_LEVEL_UP зөв бол нэг
// шат ахина, буруу бол нэг шат буурна.
export function advanceDifficulty(
  levelIndex: number,
  streak: number,
  correct: boolean,
): { levelIndex: number; streak: number } {
  if (!correct) {
    return { levelIndex: Math.max(levelIndex - 1, 0), streak: 0 };
  }
  const nextStreak = streak + 1;
  if (nextStreak >= STREAK_TO_LEVEL_UP) {
    return { levelIndex: Math.min(levelIndex + 1, EXAM_LEVEL_ORDER.length - 1), streak: 0 };
  }
  return { levelIndex, streak: nextStreak };
}

// Тухайн ур чадвар, түвшинд хамгийн ойр, ашиглагдаагүй асуултыг олно.
// Яг тухайн түвшнээс эхэлж, дараа нь доош, дээш гэж ±1, ±2 … тэлнэ (хэт хүнд
// рүү үсрэхээс зөөлөн байлгахын тулд доод түвшнийг түрүүлж үзнэ).
export function pickQuestion(
  skill: PlacementSkill,
  levelIndex: number,
  usedIds: ReadonlySet<string>,
): PlacementQuestion | null {
  for (let distance = 0; distance < EXAM_LEVEL_ORDER.length; distance++) {
    for (const idx of [levelIndex - distance, levelIndex + distance]) {
      if (idx < 0 || idx >= EXAM_LEVEL_ORDER.length) continue;
      const candidates = PLACEMENT_POOL[EXAM_LEVEL_ORDER[idx]][skill];
      const found = candidates.find((q) => !usedIds.has(q.id));
      if (found) return found;
    }
  }
  return null;
}

export interface PlacementAnswer {
  questionId: string;
  skill: PlacementSkill;
  level: ExamLevel;
  correct: boolean;
}

// Түвшин бүрийн нарийвчлалаас эцсийн түвшнийг гаргана: хангалттай олон асуулт
// үзэж (LEVEL_MIN_ASKED), LEVEL_PASS_RATIO-оос дээш оноотой хамгийн өндөр түвшин.
export function estimateLevel(levelStats: Record<string, PlacementLevelStat>): ExamLevel {
  for (let i = EXAM_LEVEL_ORDER.length - 1; i >= 0; i--) {
    const stat = levelStats[EXAM_LEVEL_ORDER[i]];
    if (stat && stat.asked >= LEVEL_MIN_ASKED && stat.correct / stat.asked >= LEVEL_PASS_RATIO) {
      return EXAM_LEVEL_ORDER[i];
    }
  }
  return 'A1';
}

// Хариултуудаас эцсийн үр дүнг тооцно.
export function scorePlacement(answers: PlacementAnswer[]): PlacementRecord {
  const skillScores: Record<PlacementSkill, PlacementSkillScore> = {
    read: { correct: 0, total: 0 },
    listen: { correct: 0, total: 0 },
    write: { correct: 0, total: 0 },
    speak: { correct: 0, total: 0 },
  };
  const levelStats: Record<string, PlacementLevelStat> = {};

  let totalCorrect = 0;
  for (const a of answers) {
    skillScores[a.skill].total += 1;
    const stat = (levelStats[a.level] ??= { asked: 0, correct: 0 });
    stat.asked += 1;
    if (a.correct) {
      skillScores[a.skill].correct += 1;
      stat.correct += 1;
      totalCorrect += 1;
    }
  }

  return {
    takenAt: new Date().toISOString(),
    level: estimateLevel(levelStats),
    totalCorrect,
    totalQuestions: answers.length,
    skillScores,
    levelStats,
    unlocked: false,
  };
}

// Profile patch applied when a learner finishes the placement test. The CEFR
// level is always assigned to targetLevel — the test result is given to the
// user automatically, regardless of whether they unlocked the detailed report.
// Content gating (Free = A1 only) still applies separately, so assigning a
// higher level just points a free learner at a locked-but-visible path that
// upsells Pro.
export interface PlacementProfilePatch {
  placementPending: false;
  placement: PlacementRecord;
  targetLevel: string;
}

export function placementProfilePatch(record: PlacementRecord): PlacementProfilePatch {
  return {
    placementPending: false,
    placement: record,
    targetLevel: record.level,
  };
}
