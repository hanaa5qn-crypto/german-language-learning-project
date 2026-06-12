import { VocabularyWord, ReadingExercise, WordClass, CEFRLevel } from './types';
import { GENERATED_VOCABULARY } from './generatedVocabulary';
import { VOCABEO_VOCABULARY } from './vocabeoVocabulary';
import { C1C2_VOCABULARY } from './c1c2Vocabulary';
import { MONGOLIAN_GLOSSES } from './mongolianGlosses';

export const VOCABULARY_DATABASE: VocabularyWord[] = [
  {
    german: 'Hallo',
    mongolian: 'Сайн уу / Сайн байна уу',
    category: 'Мэндчилгээ (A1)',
    exampleGerman: 'Hallo! Wie geht es dir?',
    exampleMongolian: 'Сайн уу! Чиний бие ямар байна?'
  },
  {
    german: 'Danke',
    mongolian: 'Баярлалаа',
    category: 'Хүндэтгэл (A1)',
    exampleGerman: 'Danke für deine Hilfe.',
    exampleMongolian: 'Тусалсанд баярлалаа.'
  },
  {
    german: 'Bitte',
    mongolian: 'Зүгээр / Гуйя',
    category: 'Хүндэтгэл (A1)',
    exampleGerman: 'Ein Bier, bitte.',
    exampleMongolian: 'Нэг шар айраг өгөөч, гуйж байна.'
  },
  {
    german: 'Name',
    article: 'der',
    mongolian: 'Нэр',
    category: 'Нэр үг (Эрэгтэй - A1)',
    exampleGerman: 'Mein Name ist Bat.',
    exampleMongolian: 'Миний нэрийг Бат гэдэг.'
  },
  {
    german: 'Deutschland',
    mongolian: 'Герман улс',
    category: 'Улс орон (A1)',
    exampleGerman: 'Deutschland liegt in Europa.',
    exampleMongolian: 'Герман улс Европт байдаг.'
  },
  {
    german: 'Entschuldigung',
    mongolian: 'Уучлаарай',
    category: 'Хүндэтгэл (A1)',
    exampleGerman: 'Entschuldigung, wo ist der Bahnhof?',
    exampleMongolian: 'Уучлаарай, галт тэрэгний буудал хаана вэ?'
  },
  {
    german: 'Krankenhaus',
    article: 'das',
    mongolian: 'Эмнэлэг',
    category: 'Нэр үг (Дундаж - A2)',
    exampleGerman: 'Er muss ins Krankenhaus gehen.',
    exampleMongolian: 'Тэр эмнэлэгт очих ёстой.'
  },
  {
    german: 'Flughafen',
    article: 'der',
    mongolian: 'Нисэх онгоцны буудал',
    category: 'Нэр үг (Эрэгтэй - A2)',
    exampleGerman: 'Der Flughafen ist sehr weit weg.',
    exampleMongolian: 'Нисэх онгоцны буудал маш хол байдаг.'
  },

  // --- Түгээмэл нэр үг (High-frequency nouns) ---
  {
    german: 'Tag',
    article: 'der',
    mongolian: 'Өдөр',
    category: 'Нэр үг (Эрэгтэй - A1)',
    exampleGerman: 'Jeden Tag lerne ich Deutsch.',
    exampleMongolian: 'Би өдөр бүр герман хэл сурдаг.'
  },
  {
    german: 'Nacht',
    article: 'die',
    mongolian: 'Шөнө',
    category: 'Нэр үг (Эмэгтэй - A1)',
    exampleGerman: 'Die Nacht ist sehr ruhig.',
    exampleMongolian: 'Шөнө маш нам гүм байна.'
  },
  {
    german: 'Jahr',
    article: 'das',
    mongolian: 'Жил',
    category: 'Нэр үг (Дунд - A1)',
    exampleGerman: 'Das Jahr hat zwölf Monate.',
    exampleMongolian: 'Жил арван хоёр сартай.'
  },
  {
    german: 'Zeit',
    article: 'die',
    mongolian: 'Цаг хугацаа',
    category: 'Нэр үг (Эмэгтэй - A1)',
    exampleGerman: 'Ich habe heute keine Zeit.',
    exampleMongolian: 'Надад өнөөдөр цаг алга.'
  },
  {
    german: 'Wasser',
    article: 'das',
    mongolian: 'Ус',
    category: 'Нэр үг (Дунд - A1)',
    exampleGerman: 'Ich trinke gern kaltes Wasser.',
    exampleMongolian: 'Би хүйтэн ус уух дуртай.'
  },
  {
    german: 'Haus',
    article: 'das',
    mongolian: 'Байшин, гэр',
    category: 'Нэр үг (Дунд - A1)',
    exampleGerman: 'Mein Haus ist nicht groß.',
    exampleMongolian: 'Миний гэр тийм ч том биш.'
  },
  {
    german: 'Frau',
    article: 'die',
    mongolian: 'Эмэгтэй, эхнэр',
    category: 'Нэр үг (Эмэгтэй - A1)',
    exampleGerman: 'Die Frau liest ein Buch.',
    exampleMongolian: 'Эмэгтэй ном уншиж байна.'
  },
  {
    german: 'Mann',
    article: 'der',
    mongolian: 'Эрэгтэй, нөхөр',
    category: 'Нэр үг (Эрэгтэй - A1)',
    exampleGerman: 'Der Mann arbeitet im Büro.',
    exampleMongolian: 'Эрэгтэй хүн оффист ажилладаг.'
  },
  {
    german: 'Kind',
    article: 'das',
    mongolian: 'Хүүхэд',
    category: 'Нэр үг (Дунд - A1)',
    exampleGerman: 'Das Kind spielt im Garten.',
    exampleMongolian: 'Хүүхэд цэцэрлэгт тоглож байна.'
  },
  {
    german: 'Stadt',
    article: 'die',
    mongolian: 'Хот',
    category: 'Нэр үг (Эмэгтэй - A1)',
    exampleGerman: 'Berlin ist eine große Stadt.',
    exampleMongolian: 'Берлин бол том хот.'
  },
  {
    german: 'Land',
    article: 'das',
    mongolian: 'Улс, хөдөө орон нутаг',
    category: 'Нэр үг (Дунд - A1)',
    exampleGerman: 'Welches Land möchtest du besuchen?',
    exampleMongolian: 'Чи аль улс руу зочлохыг хүсэж байна вэ?'
  },
  {
    german: 'Schule',
    article: 'die',
    mongolian: 'Сургууль',
    category: 'Нэр үг (Эмэгтэй - A1)',
    exampleGerman: 'Die Kinder gehen in die Schule.',
    exampleMongolian: 'Хүүхдүүд сургуульд явдаг.'
  },
  {
    german: 'Arbeit',
    article: 'die',
    mongolian: 'Ажил',
    category: 'Нэр үг (Эмэгтэй - A1)',
    exampleGerman: 'Die Arbeit beginnt um acht Uhr.',
    exampleMongolian: 'Ажил найман цагт эхэлдэг.'
  },
  {
    german: 'Geld',
    article: 'das',
    mongolian: 'Мөнгө',
    category: 'Нэр үг (Дунд - A1)',
    exampleGerman: 'Ich habe nicht genug Geld.',
    exampleMongolian: 'Надад хангалттай мөнгө алга.'
  },
  {
    german: 'Freund',
    article: 'der',
    mongolian: 'Найз (эр)',
    category: 'Нэр үг (Эрэгтэй - A1)',
    exampleGerman: 'Mein Freund wohnt in München.',
    exampleMongolian: 'Миний найз Мюнхенд амьдардаг.'
  },
  {
    german: 'Familie',
    article: 'die',
    mongolian: 'Гэр бүл',
    category: 'Нэр үг (Эмэгтэй - A1)',
    exampleGerman: 'Meine Familie ist sehr groß.',
    exampleMongolian: 'Манай гэр бүл маш том.'
  },
  {
    german: 'Essen',
    article: 'das',
    mongolian: 'Хоол',
    category: 'Нэр үг (Дунд - A1)',
    exampleGerman: 'Das Essen schmeckt gut.',
    exampleMongolian: 'Хоол амттай байна.'
  },
  {
    german: 'Tisch',
    article: 'der',
    mongolian: 'Ширээ',
    category: 'Нэр үг (Эрэгтэй - A1)',
    exampleGerman: 'Das Buch liegt auf dem Tisch.',
    exampleMongolian: 'Ном ширээн дээр байна.'
  },
  {
    german: 'Tür',
    article: 'die',
    mongolian: 'Хаалга',
    category: 'Нэр үг (Эмэгтэй - A1)',
    exampleGerman: 'Bitte schließ die Tür.',
    exampleMongolian: 'Хаалгаа хаагаач.'
  },
  {
    german: 'Buch',
    article: 'das',
    mongolian: 'Ном',
    category: 'Нэр үг (Дунд - A1)',
    exampleGerman: 'Ich lese ein interessantes Buch.',
    exampleMongolian: 'Би сонирхолтой ном уншиж байна.'
  },

  // --- Түгээмэл үйл үг (High-frequency verbs) ---
  {
    german: 'sein',
    mongolian: 'байх (am/is/are)',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Ich bin müde.',
    exampleMongolian: 'Би ядарсан байна.'
  },
  {
    german: 'haben',
    mongolian: 'эзэмших, байх (have)',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Wir haben einen Hund.',
    exampleMongolian: 'Бид нохойтой.'
  },
  {
    german: 'gehen',
    mongolian: 'явах, алхах',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Ich gehe nach Hause.',
    exampleMongolian: 'Би гэр лүүгээ явж байна.'
  },
  {
    german: 'kommen',
    mongolian: 'ирэх',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Woher kommst du?',
    exampleMongolian: 'Чи хаанаас ирсэн бэ?'
  },
  {
    german: 'machen',
    mongolian: 'хийх',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Was machst du gerade?',
    exampleMongolian: 'Чи яг одоо юу хийж байна?'
  },
  {
    german: 'essen',
    mongolian: 'идэх',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Am Morgen esse ich Brot.',
    exampleMongolian: 'Өглөө би талх иддэг.'
  },
  {
    german: 'trinken',
    mongolian: 'уух',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Sie trinkt jeden Morgen Tee.',
    exampleMongolian: 'Тэр өглөө бүр цай уудаг.'
  },
  {
    german: 'lernen',
    mongolian: 'сурах',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Wir lernen zusammen Deutsch.',
    exampleMongolian: 'Бид хамтдаа герман хэл сурдаг.'
  },
  {
    german: 'arbeiten',
    mongolian: 'ажиллах',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Er arbeitet in einem Krankenhaus.',
    exampleMongolian: 'Тэр эмнэлэгт ажилладаг.'
  },
  {
    german: 'wohnen',
    mongolian: 'амьдрах, оршин суух',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Ich wohne in der Stadt.',
    exampleMongolian: 'Би хотод амьдардаг.'
  },
  {
    german: 'sprechen',
    mongolian: 'ярих',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Sprichst du Englisch?',
    exampleMongolian: 'Чи англиар ярьдаг уу?'
  },
  {
    german: 'verstehen',
    mongolian: 'ойлгох',
    category: 'Үйл үг (A2)',
    exampleGerman: 'Ich verstehe die Frage nicht.',
    exampleMongolian: 'Би асуултыг ойлгохгүй байна.'
  },
  {
    german: 'kaufen',
    mongolian: 'худалдаж авах',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Ich möchte Brot kaufen.',
    exampleMongolian: 'Би талх худалдаж авмаар байна.'
  },
  {
    german: 'fahren',
    mongolian: 'жолоодох, (тээврээр) явах',
    category: 'Үйл үг (A1)',
    exampleGerman: 'Wir fahren mit dem Zug.',
    exampleMongolian: 'Бид галт тэргээр явдаг.'
  },

  // --- Тэмдэг нэр (Common adjectives) ---
  {
    german: 'gut',
    mongolian: 'сайн, сайхан',
    category: 'Тэмдэг нэр (A1)',
    exampleGerman: 'Das Wetter ist heute gut.',
    exampleMongolian: 'Өнөөдөр цаг агаар сайхан байна.'
  },
  {
    german: 'groß',
    mongolian: 'том, өндөр',
    category: 'Тэмдэг нэр (A1)',
    exampleGerman: 'Der Baum ist sehr groß.',
    exampleMongolian: 'Мод маш том.'
  },
  {
    german: 'klein',
    mongolian: 'жижиг, намхан',
    category: 'Тэмдэг нэр (A1)',
    exampleGerman: 'Die Wohnung ist klein.',
    exampleMongolian: 'Орон сууц жижигхэн.'
  },
  {
    german: 'neu',
    mongolian: 'шинэ',
    category: 'Тэмдэг нэр (A1)',
    exampleGerman: 'Ich habe ein neues Auto.',
    exampleMongolian: 'Надад шинэ машин бий.'
  },
  {
    german: 'alt',
    mongolian: 'хуучин, настай',
    category: 'Тэмдэг нэр (A1)',
    exampleGerman: 'Mein Großvater ist sehr alt.',
    exampleMongolian: 'Миний өвөө маш настай.'
  },
  {
    german: 'schön',
    mongolian: 'сайхан, гоё',
    category: 'Тэмдэг нэр (A1)',
    exampleGerman: 'Das ist ein schönes Bild.',
    exampleMongolian: 'Энэ бол сайхан зураг.'
  },
  {
    german: 'schnell',
    mongolian: 'хурдан',
    category: 'Тэмдэг нэр (A1)',
    exampleGerman: 'Der Zug ist sehr schnell.',
    exampleMongolian: 'Галт тэрэг маш хурдан.'
  },
  {
    german: 'teuer',
    mongolian: 'үнэтэй',
    category: 'Тэмдэг нэр (A2)',
    exampleGerman: 'Das Auto ist zu teuer.',
    exampleMongolian: 'Машин хэт үнэтэй байна.'
  },

  // --- Дайвар үг ба түгээмэл үг (Adverbs & common words) ---
  {
    german: 'heute',
    mongolian: 'өнөөдөр',
    category: 'Дайвар үг (A1)',
    exampleGerman: 'Heute ist Montag.',
    exampleMongolian: 'Өнөөдөр Даваа гараг.'
  },
  {
    german: 'morgen',
    mongolian: 'маргааш',
    category: 'Дайвар үг (A1)',
    exampleGerman: 'Morgen habe ich frei.',
    exampleMongolian: 'Маргааш би чөлөөтэй.'
  },
  {
    german: 'immer',
    mongolian: 'үргэлж, байнга',
    category: 'Дайвар үг (A1)',
    exampleGerman: 'Sie ist immer freundlich.',
    exampleMongolian: 'Тэр үргэлж найрсаг байдаг.'
  },
  {
    german: 'jetzt',
    mongolian: 'одоо',
    category: 'Дайвар үг (A1)',
    exampleGerman: 'Ich muss jetzt gehen.',
    exampleMongolian: 'Би одоо явах ёстой.'
  },
  {
    german: 'vielleicht',
    mongolian: 'магадгүй',
    category: 'Дайвар үг (A2)',
    exampleGerman: 'Vielleicht regnet es morgen.',
    exampleMongolian: 'Магадгүй маргааш бороо орно.'
  },
  {
    german: 'natürlich',
    mongolian: 'мэдээж, мэдээжийн хэрэг',
    category: 'Дайвар үг (A2)',
    exampleGerman: 'Natürlich helfe ich dir.',
    exampleMongolian: 'Мэдээж би чамд туслана.'
  }
];

// --- Dictionary (Browse) -------------------------------------------------
// The in-app vocabeo-style dictionary needs structured word-class + CEFR level
// for filtering. The original VOCABULARY_DATABASE encodes these inside the
// Mongolian `category` label, so we derive them here, then merge with the
// generated set into a single deduplicated DICTIONARY.

function deriveWordClass(category: string, article?: string): WordClass {
  if (category.includes('Үйл үг')) return 'verb';
  if (category.includes('Тэмдэг нэр')) return 'adjective';
  if (category.includes('Дайвар үг')) return 'adverb';
  if (category.includes('Угтвар үг')) return 'preposition';
  if (category.includes('Нэр үг') || article) return 'noun';
  if (category.includes('Хүндэтгэл') || category.includes('Мэндчилгээ') || category.includes('Хэллэг')) return 'phrase';
  return 'noun';
}

function deriveLevel(category: string): CEFRLevel {
  if (category.includes('B1')) return 'B1';
  if (category.includes('A2')) return 'A2';
  return 'A1';
}

function withMetadata(word: VocabularyWord): VocabularyWord {
  const wordClass = word.wordClass ?? deriveWordClass(word.category, word.article);
  // The vocabeo-generated bulk only ships English glosses; fill Mongolian from
  // the batch-translated gloss map (see scripts/fillMongolianGlosses.ts).
  const mongolian = word.mongolian?.trim()
    || MONGOLIAN_GLOSSES[`${word.german}|${word.wordClass ?? ''}`]
    || word.english
    || '';
  return {
    ...word,
    mongolian,
    wordClass,
    level: word.level ?? deriveLevel(word.category),
  };
}

// Curated core words first, then the seeded set, then the full vocabeo.com
// frequency dictionary (6274 words). Deduped by sense — headword + word class +
// English gloss — so curated entries win over duplicates while genuine homonyms
// (e.g. "See" = lake vs sea, "gut" as adjective/adverb/noun) are each preserved.
export const DICTIONARY: VocabularyWord[] = (() => {
  const out: VocabularyWord[] = [];
  const baseHeadwords = new Set<string>(); // curated + generated, keyed by headword
  const seenSense = new Set<string>();      // all entries, keyed by headword|class|english

  // Curated core, then the seeded set — deduped against each other by headword.
  for (const word of [...VOCABULARY_DATABASE, ...GENERATED_VOCABULARY]) {
    const w = withMetadata(word);
    const head = w.german.trim().toLowerCase();
    if (baseHeadwords.has(head)) continue;
    baseHeadwords.add(head);
    seenSense.add(`${head}|${w.wordClass}|${(w.english ?? '').toLowerCase()}`);
    out.push(w);
  }

  // Append the vocabeo dictionary: skip any headword already provided above
  // (nothing existing is lost), but keep vocabeo's own distinct senses/homonyms.
  const vocabeoHeadwords = new Set<string>();
  for (const word of VOCABEO_VOCABULARY) {
    const w = withMetadata(word);
    const head = w.german.trim().toLowerCase();
    vocabeoHeadwords.add(head);
    if (baseHeadwords.has(head)) continue;
    const key = `${head}|${w.wordClass}|${(w.english ?? '').toLowerCase()}`;
    if (seenSense.has(key)) continue;
    seenSense.add(key);
    out.push(w);
  }

  // Append the advanced C1/C2 set (Mongolian glosses from the Bolor-toli
  // German→Mongolian dictionary). Only genuinely new headwords are added, so
  // a word vocabeo already lists (at its existing level) is never duplicated.
  for (const word of C1C2_VOCABULARY) {
    const w = withMetadata(word);
    const head = w.german.trim().toLowerCase();
    if (baseHeadwords.has(head) || vocabeoHeadwords.has(head)) continue;
    baseHeadwords.add(head);
    out.push(w);
  }
  return out;
})();

export interface ExamQuestion {
  question: string;
  choices: string[];
  correctChoiceIndex: number;
  explanation: string;
}

export const EXAM_QUESTIONS: ExamQuestion[] = [
  {
    question: 'Герман хэлний "Hallo" мэндчилгээ ямар утгатай вэ?',
    choices: [
      'Баяртай',
      'Өглөөний мэнд',
      'Сайн байна уу / Сайн уу',
      'Оройн мэнд'
    ],
    correctChoiceIndex: 2,
    explanation: '"Hallo" нь герман хэлэнд хамгийн өргөн хэрэглэгддэг, албан бус "Сайн уу" гэсэн мэндчилгээ юм.'
  },
  {
    question: '"Миний нэр Бат" гэж хэлэхэд тохирох зөв өгүүлбэрийг сонгоно уу.',
    choices: [
      'Mein Name ist Bat.',
      'Ich bin aus Bat.',
      'Name ist mein Bat.',
      'Ich heisse aus Bat.'
    ],
    correctChoiceIndex: 0,
    explanation: 'Нэрээ танилцуулахад "Mein Name ist [Нэр]" (Миний нэр бол ...) гэсэн бүтцийг ашигладаг бөгөөд "Name" гэж томоор бичнэ.'
  },
  {
    question: 'Германоор "Баярлалаа" гэхийг юу гэж хэлэх вэ?',
    choices: [
      'Bitte',
      'Entschuldigung',
      'Danke',
      'Guten Tag'
    ],
    correctChoiceIndex: 2,
    explanation: '"Danke" гэдэг нь "Баярлалаа" гэсэн утгатай үг юм. "Bitte" нь "Зүгээр" эсвэл "Гуйж байна" гэсэн утгатай.'
  },
  {
    question: '"Ich komme _____ der Mongolei." (Би Монголоос ирсэн) цэгтэй талбарт тохирох угтвар үгийг сонгоно уу.',
    choices: [
      'in',
      'aus',
      'nach',
      'von'
    ],
    correctChoiceIndex: 1,
    explanation: 'Аль нэг улс орноос гаралтай гэж хэлэхэд "aus" (оос/оос гаралтай) угтвар үгийг хэрэглэдэг.'
  },
  {
    question: 'Герман улсын нийслэл хот аль нь вэ?',
    choices: [
      'München',
      'Frankfurt',
      'Berlin',
      'Hamburg'
    ],
    correctChoiceIndex: 2,
    explanation: 'Берлин (Berlin) бол Холбооны Бүгд Найрамдах Герман Улсын нийслэл бөгөөд хамгийн том хот юм.'
  },
  {
    question: 'Германоор "Нэг шар айраг, гуйж байна" гэхийг юу гэх вэ?',
    choices: [
      'Ein Wasser, bitte.',
      'Ein Bier, bitte.',
      'Ein Brot, bitte.',
      'Kaffee, bitte.'
    ],
    correctChoiceIndex: 1,
    explanation: '"Ein Bier, bitte" гэдэг нь "Нэг шар айраг, гуйж байна" гэсэн утгатай. "Bier" нь шар айраг, "Wasser" нь ус, "Brot" нь талх юм.'
  },
  {
    question: '"Wie geht es Ihnen?" гэсэн асуултанд хэрхэн зөв хариулах вэ?',
    choices: [
      'Danke, gut. Und Ihnen?',
      'Ich bin Student.',
      'Mein Name ist Bat.',
      'Ich wohne in Berlin.'
    ],
    correctChoiceIndex: 0,
    explanation: '"Wie geht es Ihnen?" (Таны бие сайн уу?) гэх асуултанд "Danke, gut. Und Ihnen?" (Баярлалаа, сайн. Таныхаар?) гэж хариулах нь зөв.'
  },
  {
    question: 'Герман хэлний "Entschuldigung" гэдэг үг ямар утгатай вэ?',
    choices: [
      'Баяртай',
      'Өглөөний мэнд',
      'Уучлаарай',
      'Тийм'
    ],
    correctChoiceIndex: 2,
    explanation: '"Entschuldigung" гэдэг нь хэн нэгний анхаарлыг татах эсвэл уучлалт гуйхад хэрэглэгддэг "Уучлаарай" гэсэн үг юм.'
  }
];
