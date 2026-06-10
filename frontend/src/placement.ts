// =============================================================================
// Vivid-Lingua — Түвшин тогтоох үнэлгээний тест (placement test)
// -----------------------------------------------------------------------------
// Шинэ хэрэглэгч бүртгүүлсний дараа дөрвөн ур чадварыг (Унших, Сонсох, Бичих,
// Ярих) бүгдийг хамарсан үнэлгээний тест өгч, CEFR түвшнээ тогтоолгоно.
// Түвшин бүр 4 асуулттай блок (ур чадвар тус бүр 1). Блокоо 3/4-өөс доош
// оноотой давбал тест эрт зогсоно — суралцагчийг хэт хүнд асуултаар чирэхгүй.
//
// Үр дүнг нээж үзэх нь төлбөртэй (PLACEMENT_RESULT_PRICE_MNT). Тест дуусахаас
// өмнө үнийн мэдээллийг харуулахгүй. FOUNDER_EMAILS жагсаалтад байгаа
// хэрэглэгчид (компанийн данс) төлбөргүй нээнэ.
// =============================================================================

import { EXAMS, EXAM_LEVEL_ORDER, ExamLevel } from './exams';

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

// Profile-д хадгалагдах үр дүнгийн бичлэг. `unlocked` нь суралцагч үр дүнгээ
// нээж үзсэн эсэх (төлбөр төлсөн эсвэл founder).
export interface PlacementRecord {
  takenAt: string;
  level: ExamLevel;
  totalCorrect: number;
  totalQuestions: number;
  skillScores: Record<PlacementSkill, PlacementSkillScore>;
  unlocked: boolean;
  unlockedBy?: 'founder' | 'qpay';
}

export const PLACEMENT_RESULT_PRICE_MNT = 5000;

// Компанийн (founder) данснууд — үр дүнг төлбөргүй нээнэ.
export const FOUNDER_EMAILS = ['ceo@homunculuslogic.io'];

export function isFounderEmail(email: string | undefined | null): boolean {
  return FOUNDER_EMAILS.includes((email ?? '').trim().toLowerCase());
}

// -----------------------------------------------------------------------------
// Бичих ур чадвар — түвшин бүрт "аль өгүүлбэр зөв бичигдсэн бэ" сонголт.
// Доод түвшинд алдаа нь илт, дээд түвшинд нарийн (дүрэм, падеж, Konjunktiv).
// -----------------------------------------------------------------------------
const WRITING_QUESTIONS: Record<ExamLevel, Omit<PlacementQuestion, 'id' | 'level' | 'skill'>> = {
  A1: {
    instruction: 'Бичих чадвар',
    question: 'Аль өгүүлбэр нь зөв бичигдсэн бэ?',
    choices: [
      'Ich heißen Anna und kommst aus Mongolei.',
      'Ich heiße Anna und komme aus der Mongolei.',
      'Ich heiße Anna und kommen aus die Mongolei.',
    ],
    correctIndex: 1,
  },
  A2: {
    instruction: 'Бичих чадвар',
    question: 'Өнгөрсөн цагийн (Perfekt) аль өгүүлбэр зөв бэ?',
    choices: [
      'Gestern bin ich früh aufgestanden und habe Brot gekauft.',
      'Gestern ich bin früh aufstehen und kaufte Brot.',
      'Gestern habe ich früh aufgestanden und bin Brot gekauft.',
    ],
    correctIndex: 0,
  },
  B1: {
    instruction: 'Бичих чадвар',
    question: 'Гишүүн өгүүлбэртэй (Nebensatz) аль хувилбар зөв бэ?',
    choices: [
      'Ich weiß nicht, ob er hat morgen Zeit.',
      'Ich nicht weiß, ob er morgen Zeit hat.',
      'Ich weiß nicht, ob er morgen Zeit hat.',
    ],
    correctIndex: 2,
  },
  B2: {
    instruction: 'Бичих чадвар',
    question: 'Passiv хэлбэрийн аль өгүүлбэр зөв бэ?',
    choices: [
      'Der Bericht muss bis Freitag abgeben werden.',
      'Der Bericht muss bis Freitag abgegeben werden.',
      'Der Bericht müssen bis Freitag abgegeben wird.',
    ],
    correctIndex: 1,
  },
  C1: {
    instruction: 'Бичих чадвар',
    question: 'Konjunktiv II ашигласан аль өгүүлбэр зөв бэ?',
    choices: [
      'Hätte ich davon gewusst, wäre ich früher gekommen.',
      'Hätte ich davon wissen, wäre ich früher gekommen.',
      'Hätte ich davon gewusst, war ich früher gekommen.',
    ],
    correctIndex: 0,
  },
  C2: {
    instruction: 'Бичих чадвар',
    question: 'Албан найруулгын аль өгүүлбэр бүрэн зөв бэ?',
    choices: [
      'Ungeachtet die anhaltende Kritik hielt der Senat an seinem Beschluss fest.',
      'Ungeachtet der anhaltenden Kritik hielt der Senat an seinen Beschluss fest.',
      'Ungeachtet der anhaltenden Kritik hielt der Senat an seinem Beschluss fest.',
    ],
    correctIndex: 2,
  },
};

// -----------------------------------------------------------------------------
// Ярих ур чадвар — нөхцөл байдалд хамгийн тохирох хариуг сонгох.
// -----------------------------------------------------------------------------
const SPEAKING_QUESTIONS: Record<ExamLevel, Omit<PlacementQuestion, 'id' | 'level' | 'skill'>> = {
  A1: {
    instruction: 'Ярих чадвар — Танилцах үед: „Wie heißt du?"',
    question: 'Аль хариулт хамгийн тохиромжтой вэ?',
    choices: ['Ich heiße Bold.', 'Ich bin 20 Jahre.', 'Ich wohne gern.'],
    correctIndex: 0,
  },
  A2: {
    instruction: 'Ярих чадвар — Кафед: „Was möchten Sie bestellen?"',
    question: 'Аль хариулт хамгийн тохиромжтой вэ?',
    choices: [
      'Ich bin ein Kaffee.',
      'Ich hätte gern einen Kaffee, bitte.',
      'Kaffee mich bitte geben.',
    ],
    correctIndex: 1,
  },
  B1: {
    instruction: 'Ярих чадвар — Найз чинь: „Kommst du mit ins Kino?" Та өнөөдөр завгүй.',
    question: 'Аль хариулт хамгийн эелдэг бөгөөд зөв бэ?',
    choices: [
      'Nein.',
      'Das Kino ist ein Gebäude.',
      'Tut mir leid, ich kann heute nicht — ich muss lernen.',
    ],
    correctIndex: 2,
  },
  B2: {
    instruction: 'Ярих чадвар — Ажлын ярилцлагад: „Warum möchten Sie bei uns arbeiten?"',
    question: 'Аль хариулт хамгийн тохиромжтой вэ?',
    choices: [
      'Ihre Firma ist innovativ, und ich möchte meine Erfahrung im Marketing einbringen.',
      'Weil ich Geld brauche.',
      'Ich arbeite nicht gern.',
    ],
    correctIndex: 0,
  },
  C1: {
    instruction: 'Ярих чадвар — Хэлэлцүүлэгт эсрэг байр суурьтай хүнд хариулахдаа:',
    question: 'Аль хариулт хамгийн өндөр түвшний харилцааг илтгэх вэ?',
    choices: [
      'Sie haben unrecht, Punkt.',
      'Da haben Sie einen wichtigen Punkt angesprochen; dennoch gebe ich zu bedenken, dass es auch Gegenbeispiele gibt.',
      'Ich will darüber nicht reden.',
    ],
    correctIndex: 1,
  },
  C2: {
    instruction: 'Ярих чадвар — Илтгэлийн дараа ширүүн шүүмжлэлд хариулахдаа:',
    question: 'Аль хариулт хамгийн чадварлаг вэ?',
    choices: [
      'Der Einwand ist falsch, weil ich recht habe.',
      'Dazu sage ich nichts.',
      'Ihr Einwand trifft einen wunden Punkt — lassen Sie mich präzisieren, worin sich unsere Lesarten unterscheiden.',
    ],
    correctIndex: 2,
  },
};

// Тухайн түвшний шалгалтын сангаас унших/сонсох асуулт түүвэрлэх. Шалгалтын
// табын эхний асуулттай давхцахгүйн тулд 2 дахь зүйлийг (байвал) сонгоно.
function pick<T>(arr: T[]): T {
  return arr[1] ?? arr[0];
}

function buildBlock(level: ExamLevel): PlacementQuestion[] {
  const exam = EXAMS[level];
  const reading = pick(exam.reading);
  const listening = pick(exam.listening);

  return [
    {
      id: `pl_${level}_read`,
      level,
      skill: 'read',
      instruction: 'Унших чадвар — бичвэрийг уншаад асуултад хариулна уу.',
      passage: reading.text,
      question: reading.question,
      choices: reading.choices,
      correctIndex: reading.correctIndex,
    },
    {
      id: `pl_${level}_listen`,
      level,
      skill: 'listen',
      instruction: 'Сонсох чадвар — бичлэгийг сонсоод асуултад хариулна уу.',
      audioText: listening.audioText,
      question: listening.question,
      choices: listening.choices,
      correctIndex: listening.correctIndex,
    },
    { id: `pl_${level}_write`, level, skill: 'write', ...WRITING_QUESTIONS[level] },
    { id: `pl_${level}_speak`, level, skill: 'speak', ...SPEAKING_QUESTIONS[level] },
  ];
}

// Түвшин бүрийн 4 асуулттай блокууд, A1 → C2 дарааллаар.
export const PLACEMENT_BLOCKS: PlacementQuestion[][] = EXAM_LEVEL_ORDER.map(buildBlock);

export const PLACEMENT_TOTAL_QUESTIONS = PLACEMENT_BLOCKS.reduce((n, b) => n + b.length, 0);

// Блок "давсан" гэж тооцох доод оноо (4 асуултаас).
export const BLOCK_PASS_SCORE = 3;
// Блокын оноо үүнээс бага бол тест эрт зогсоно.
export const BLOCK_STOP_SCORE = 1;

// Дараалсан давсан блокын тооноос түвшин гаргана: 0 блок давбал A1-ээс эхэлнэ,
// 6 блок давбал C2.
export function levelFromPassedBlocks(passedBlocks: number): ExamLevel {
  if (passedBlocks <= 0) return 'A1';
  return EXAM_LEVEL_ORDER[Math.min(passedBlocks, EXAM_LEVEL_ORDER.length) - 1];
}

export interface PlacementAnswer {
  questionId: string;
  skill: PlacementSkill;
  correct: boolean;
}

// Хариултуудаас (асуусан дарааллаар) эцсийн үр дүнг тооцно. Блок бүр 4
// асуулттай тул хариултуудыг 4-өөр бүлэглэж дүгнэнэ.
export function scorePlacement(answers: PlacementAnswer[]): PlacementRecord {
  const skillScores: Record<PlacementSkill, PlacementSkillScore> = {
    read: { correct: 0, total: 0 },
    listen: { correct: 0, total: 0 },
    write: { correct: 0, total: 0 },
    speak: { correct: 0, total: 0 },
  };

  let totalCorrect = 0;
  for (const a of answers) {
    skillScores[a.skill].total += 1;
    if (a.correct) {
      skillScores[a.skill].correct += 1;
      totalCorrect += 1;
    }
  }

  let passedBlocks = 0;
  for (let i = 0; i * 4 < answers.length; i++) {
    const block = answers.slice(i * 4, i * 4 + 4);
    if (block.length < 4) break;
    const correct = block.filter((a) => a.correct).length;
    if (correct >= BLOCK_PASS_SCORE) passedBlocks += 1;
    else break;
  }

  return {
    takenAt: new Date().toISOString(),
    level: levelFromPassedBlocks(passedBlocks),
    totalCorrect,
    totalQuestions: answers.length,
    skillScores,
    unlocked: false,
  };
}
