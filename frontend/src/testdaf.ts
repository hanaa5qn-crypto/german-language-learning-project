// =============================================================================
// Vivid-Lingua — TestDaF Prüfungssimulation (pure German mock exam simulation)
// -----------------------------------------------------------------------------
// This is a complete mock exam simulation (Modellsatz) matching the structure of
// the official TestDaF:
//   • Leseverstehen   (Reading)   — 60 min · 3 texts · 30 questions
//   • Hörverstehen    (Listening) — 40 min · 3 audio texts · 25 questions
//   • Schriftlicher Ausdruck (Writing) — 60 min · 1 graph description & essay
//   • Mündlicher Ausdruck    (Speaking) — 35 min · 7 situation tasks
// All Mongolian translations and helper texts have been removed from the exam tasks
// to provide a realistic exam experience.
// =============================================================================

export type TdReadingKind = 'match' | 'mc' | 'tristate';
export type TdListeningKind = 'rf' | 'mc';

export interface TdQuestion {
  id: string;
  prompt: string;        // German question / statement
  choices: string[];     // Options (A..J for match, Ja/Nein/... for tristate, Richtig/Falsch for rf)
  correctIndex: number;
}

export interface TdMatchOption {
  label: string;         // A, B, C …
  titleDe: string;
  textDe: string;
}

export interface TdReadingTask {
  no: number;            // 1 / 2 / 3
  kind: TdReadingKind;
  titleDe: string;
  instructionDe: string;
  text: string;          // Main text (or description of options for matching tasks)
  options?: TdMatchOption[]; // Only for matching tasks (A..J)
  questions: TdQuestion[];
}

export interface TdListeningTask {
  no: number;
  kind: TdListeningKind;
  titleDe: string;
  instructionDe: string;
  audioText: string;     // German text to be read by TTS
  plays: number;         // Permitted plays count
  questions: TdQuestion[];
}

export interface TdGraphSeries { label: string; values: number[]; color: string; }
export interface TdWritingTask {
  titleDe: string;
  introDe: string;
  graph: {
    kind: 'line' | 'bar';
    captionDe: string;
    xLabels: string[];
    yUnit: string;
    series: TdGraphSeries[];
  };
  argumentPromptDe: string;
  bulletPointsDe: string[];
  minWords: number;
  modelAnswer: string;
}

export interface TdSpeakingTask {
  no: number;
  tdn: string;           // Target TDN level
  titleDe: string;
  situationDe: string;
  taskDe: string;
  prepSeconds: number;
  speakSeconds: number;
  modelAnswer: string;
}

export interface TestDafModelExam {
  reading: TdReadingTask[];
  listening: TdListeningTask[];
  writing: TdWritingTask;
  speaking: TdSpeakingTask[];
  durations: { reading: number; listening: number; writing: number; speaking: number };
}

const TRI = ['Ja', 'Nein', 'Text sagt dazu nichts'];
const RF = ['Richtig', 'Falsch'];

// =============================================================================
// LESEVERSTEHEN — 3 Texte · 30 Fragen
// =============================================================================

// --- Leseverstehen 1: Zuordnung (Matching), 10 Aufgaben ----------------------
const LV1_OPTIONS: TdMatchOption[] = [
  { label: 'A', titleDe: 'Schreibwerkstatt', textDe: 'Wie zitiert man richtig? Wie baut man eine Hausarbeit auf? Unsere Tutorinnen und Tutoren helfen beim wissenschaftlichen Schreiben – von der ersten Gliederung bis zur Endkorrektur.' },
  { label: 'B', titleDe: 'Career Service', textDe: 'Bewerbung, Lebenslauf, Vorstellungsgespräch: Wir bereiten Sie auf den Berufseinstieg vor und vermitteln Praktika in Unternehmen.' },
  { label: 'C', titleDe: 'Psychologische Beratung', textDe: 'Prüfungsangst, Stress oder persönliche Sorgen? In vertraulichen Gesprächen finden wir gemeinsam Wege aus der Belastung.' },
  { label: 'D', titleDe: 'Sprachenzentrum', textDe: 'Englisch, Spanisch, Französisch und viele weitere Sprachen – studienbegleitend und für alle Niveaus. Kurse beginnen jedes Semester.' },
  { label: 'E', titleDe: 'International Office', textDe: 'Sie möchten ein Semester im Ausland verbringen? Wir beraten Sie zu Erasmus, Partneruniversitäten und der Bewerbung.' },
  { label: 'F', titleDe: 'Studienfinanzierung', textDe: 'BAföG, Stipendien, Studienkredite: Wir informieren Sie über staatliche Förderung und private Stipendien für Studierende.' },
  { label: 'G', titleDe: 'Hochschulsport', textDe: 'Von Fußball über Yoga bis Klettern: über 80 Sportkurse zu günstigen Preisen. Bewegung als Ausgleich zum Lernalltag.' },
  { label: 'H', titleDe: 'Bibliothek: Recherchekurs', textDe: 'Wie findet man wissenschaftliche Quellen in Datenbanken? In unseren Kursen lernen Sie, gezielt nach Fachliteratur zu suchen.' },
  { label: 'I', titleDe: 'Fachschaft', textDe: 'Wir sind Studierende deines Fachs und beantworten alle Fragen rund um den Studienaufbau, Prüfungen und das erste Semester.' },
  { label: 'J', titleDe: 'IT-Service', textDe: 'Probleme mit dem WLAN, dem Uni-Account oder benötigter Software? Unser Rechenzentrum hilft bei allen technischen Fragen.' },
];

const LV1: TdReadingTask = {
  no: 1, kind: 'match',
  titleDe: 'Angebote der Universität',
  instructionDe: 'Zehn Studierende suchen Unterstützung. Lesen Sie die zehn Angebote (A–J) und ordnen Sie jeder Person das passende Angebot zu. Jedes Angebot passt nur zu einer Person.',
  text: 'Wählen Sie für jede Situation das passende Angebot (A–J).',
  options: LV1_OPTIONS,
  questions: [
    { id: 'lv1-1', prompt: 'Vor Prüfungen bin ich so nervös, dass ich nicht mehr schlafen kann. Ich hätte gern jemanden zum Reden.', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 2 },
    { id: 'lv1-2', prompt: 'Ich sitze den ganzen Tag in Vorlesungen und möchte mich endlich wieder mehr bewegen.', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 6 },
    { id: 'lv1-3', prompt: 'Ich schreibe gerade meine erste Hausarbeit und weiß nicht, wie man richtig zitiert und einen Text strukturiert.', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 0 },
    { id: 'lv1-4', prompt: 'Mein Laptop verbindet sich nicht mit dem WLAN der Uni und ich komme nicht an die nötige Software.', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 9 },
    { id: 'lv1-5', prompt: 'Ich plane, ein Semester an einer Universität im Ausland zu verbringen, weiß aber nicht, wie ich mich bewerbe.', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 4 },
    { id: 'lv1-6', prompt: 'Für meine Seminararbeit finde ich einfach keine guten wissenschaftlichen Quellen in den Datenbanken.', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 7 },
    { id: 'lv1-7', prompt: 'Nach dem Bachelor möchte ich ein Praktikum machen und brauche Hilfe bei meiner Bewerbung.', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 1 },
    { id: 'lv1-8', prompt: 'Meine Eltern können mich finanziell nicht unterstützen. Gibt es Stipendien oder staatliche Förderung?', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 5 },
    { id: 'lv1-9', prompt: 'Ich möchte neben meinem Studium Spanisch lernen, um später in Südamerika arbeiten zu können.', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 3 },
    { id: 'lv1-10', prompt: 'Ich bin neu im Studienfach und habe viele Fragen zum Studienaufbau. Am liebsten würde ich erfahrene Studierende fragen.', choices: ['A','B','C','D','E','F','G','H','I','J'], correctIndex: 8 },
  ],
};

// --- Leseverstehen 2: Multiple Choice, 10 Aufgaben ---------------------------
const LV2: TdReadingTask = {
  no: 2, kind: 'mc',
  titleDe: 'Warum wir schlafen müssen, um zu lernen',
  instructionDe: 'Lesen Sie den Text und wählen Sie für jede Frage die richtige Antwort (a, b oder c).',
  text:
`Lange galt der Schlaf als ein weitgehend passiver Zustand, in dem das Gehirn lediglich ruht. Neuere Forschung zeichnet ein anderes Bild: Während wir schlafen, ist das Gehirn ausgesprochen aktiv und erledigt Aufgaben, die für das Lernen unverzichtbar sind. Besonders die nächtliche Verarbeitung von Gedächtnisinhalten hat die Aufmerksamkeit der Wissenschaft auf sich gezogen.

Tagsüber nehmen wir eine Fülle von Eindrücken auf, die zunächst nur vorübergehend im sogenannten Hippocampus gespeichert werden. Erst im Schlaf werden diese Inhalte in andere Hirnregionen übertragen und dort dauerhaft verankert. Forscher sprechen von Konsolidierung. Dabei werden nicht alle Informationen gleich behandelt: Das Gehirn trifft eine Auswahl und stärkt vor allem jene Verbindungen, die es für bedeutsam hält. Was unwichtig erscheint, wird hingegen abgeschwächt oder gelöscht.

Eine zentrale Rolle spielt der sogenannte Tiefschlaf, der vor allem in der ersten Nachthälfte auftritt. In dieser Phase wiederholt das Gehirn die am Tag erlernten Abläufe in stark beschleunigter Form. Experimente zeigen, dass Versuchspersonen, die nach einer Lernaufgabe schlafen durften, sich am nächsten Tag deutlich besser erinnerten als jene, die wach geblieben waren. Interessanterweise profitiert nicht nur das Faktenwissen, sondern auch das Erlernen von Bewegungen, etwa beim Sport oder beim Musizieren.

Auch der Traumschlaf, die sogenannte REM-Phase, scheint eine Funktion zu erfüllen. Manche Wissenschaftler vermuten, dass in ihr emotional belastende Erlebnisse verarbeitet werden. Wer dauerhaft zu wenig schläft, riskiert daher nicht nur Konzentrationsprobleme, sondern auch eine schlechtere Gedächtnisleistung. Schlaf ist demnach keine verlorene Zeit, sondern eine Voraussetzung dafür, dass aus Erfahrungen dauerhaftes Wissen wird.`,
  questions: [
    { id: 'lv2-1', prompt: 'Wie wurde der Schlaf früher betrachtet?', choices: ['als anstrengende Tätigkeit des Gehirns', 'als weitgehend passiver Ruhezustand', 'als Ursache von Lernproblemen'], correctIndex: 1 },
    { id: 'lv2-2', prompt: 'Was geschieht tagsüber mit neuen Eindrücken?', choices: ['Sie werden sofort dauerhaft gespeichert.', 'Sie werden zunächst nur vorübergehend im Hippocampus gespeichert.', 'Sie werden vollständig gelöscht.'], correctIndex: 1 },
    { id: 'lv2-3', prompt: 'Was bedeutet „Konsolidierung“ im Text?', choices: ['das dauerhafte Verankern von Inhalten in anderen Hirnregionen', 'das Aufnehmen neuer Eindrücke am Tag', 'das Vergessen aller Inhalte'], correctIndex: 0 },
    { id: 'lv2-4', prompt: 'Wie geht das Gehirn mit den Informationen um?', choices: ['Es speichert alles gleich stark.', 'Es trifft eine Auswahl und stärkt bedeutsame Verbindungen.', 'Es löscht vor allem wichtige Inhalte.'], correctIndex: 1 },
    { id: 'lv2-5', prompt: 'Was passiert mit Informationen, die unwichtig erscheinen?', choices: ['Sie werden besonders stark gespeichert.', 'Sie werden abgeschwächt oder gelöscht.', 'Sie werden in den Hippocampus zurückgeschickt.'], correctIndex: 1 },
    { id: 'lv2-6', prompt: 'Wann tritt der Tiefschlaf vor allem auf?', choices: ['in der ersten Nachthälfte', 'kurz vor dem Aufwachen', 'nur am Tag'], correctIndex: 0 },
    { id: 'lv2-7', prompt: 'Was zeigen die erwähnten Experimente?', choices: ['Wer wach blieb, erinnerte sich besser.', 'Schlaf hatte keinen Einfluss auf das Erinnern.', 'Wer nach dem Lernen schlief, erinnerte sich besser.'], correctIndex: 2 },
    { id: 'lv2-8', prompt: 'Wovon profitiert der Schlaf außer vom Faktenwissen?', choices: ['vom Erlernen von Bewegungen', 'von der Verdauung', 'von der Körpergröße'], correctIndex: 0 },
    { id: 'lv2-9', prompt: 'Welche Funktion wird der REM-Phase zugeschrieben?', choices: ['die Stärkung der Muskeln', 'die Verarbeitung emotional belastender Erlebnisse', 'die Speicherung von Faktenwissen'], correctIndex: 1 },
    { id: 'lv2-10', prompt: 'Was ist die Hauptaussage des Textes?', choices: ['Schlaf ist verlorene Zeit.', 'Schlaf ist eine Voraussetzung dafür, dass aus Erfahrungen dauerhaftes Wissen wird.', 'Nur Tiefschlaf ist für den Körper wichtig.'], correctIndex: 1 },
  ],
};

// --- Leseverstehen 3: Ja / Nein / Text sagt dazu nichts, 10 Aufgaben ---------
const LV3: TdReadingTask = {
  no: 3, kind: 'tristate',
  titleDe: 'Auswendiglernen im digitalen Zeitalter',
  instructionDe: 'Lesen Sie den Meinungstext. Entscheiden Sie für jede Aussage: Steht das so im Text (Ja), sagt der Text das Gegenteil (Nein) oder äußert sich der Text dazu nicht (Text sagt dazu nichts)?',
  text:
`Seit Wissen jederzeit über das Internet abrufbar ist, mehren sich die Stimmen, die das Auswendiglernen für überflüssig halten. Wozu, so fragen Kritiker, sollte man sich Jahreszahlen oder Vokabeln einprägen, wenn jede Suchmaschine die Antwort in Sekunden liefert? Diese Haltung greift meiner Ansicht nach zu kurz.

Zwar trifft es zu, dass reines Faktenwissen heute schneller verfügbar ist als je zuvor. Doch wer glaubt, deshalb auf das Lernen verzichten zu können, verwechselt Information mit Verständnis. Um einen komplexen Zusammenhang zu durchdringen, muss man über ein Grundgerüst an Wissen verfügen, das im Kopf jederzeit präsent ist. Nur wer die Vokabeln einer Sprache beherrscht, kann flüssig sprechen; ständiges Nachschlagen unterbricht jedes Gespräch.

Hinzu kommt, dass das Gedächtnis wie ein Muskel trainiert werden will. Wer es nicht mehr beansprucht, dessen Fähigkeit, sich Dinge zu merken, lässt mit der Zeit nach. Insofern ist das Auswendiglernen auch eine Übung für das Gehirn selbst.

Gleichwohl wäre es falsch, das stumpfe Wiederholen ohne Verständnis zu verherrlichen. Sinnvoll ist Auswendiglernen nur dann, wenn es mit dem Begreifen der Inhalte einhergeht. Wer eine Formel auswendig kann, sie aber nicht anzuwenden weiß, hat wenig gewonnen.

Die Schule der Zukunft sollte deshalb beides vermitteln: ein solides Fundament an gesichertem Wissen und zugleich die Fähigkeit, dieses Wissen kritisch zu nutzen. Wer Auswendiglernen und Verstehen gegeneinander ausspielt, stellt eine falsche Wahl in den Raum.`,
  questions: [
    { id: 'lv3-1', prompt: 'Auswendiglernen ist heute völlig überflüssig.', choices: TRI, correctIndex: 1 },
    { id: 'lv3-2', prompt: 'Faktenwissen ist heute schneller verfügbar als früher.', choices: TRI, correctIndex: 0 },
    { id: 'lv3-3', prompt: 'Wer eine Sprache fließend sprechen will, kommt ohne beherrschte Vokabeln aus.', choices: TRI, correctIndex: 1 },
    { id: 'lv3-4', prompt: 'Das Gedächtnis muss wie ein Muskel trainiert werden.', choices: TRI, correctIndex: 0 },
    { id: 'lv3-5', prompt: 'Kinder sollten in der Schule keine Tablets benutzen.', choices: TRI, correctIndex: 2 },
    { id: 'lv3-6', prompt: 'Stumpfes Wiederholen ohne Verständnis ist sinnvoll.', choices: TRI, correctIndex: 1 },
    { id: 'lv3-7', prompt: 'Auswendiglernen sollte mit dem Verstehen der Inhalte verbunden sein.', choices: TRI, correctIndex: 0 },
    { id: 'lv3-8', prompt: 'Die Schule der Zukunft sollte sowohl Wissen als auch kritisches Denken vermitteln.', choices: TRI, correctIndex: 0 },
    { id: 'lv3-9', prompt: 'In anderen Ländern wird mehr auswendig gelernt als in Deutschland.', choices: TRI, correctIndex: 2 },
    { id: 'lv3-10', prompt: 'Auswendiglernen und Verstehen schließen sich gegenseitig aus.', choices: TRI, correctIndex: 1 },
  ],
};

// =============================================================================
// HÖRVERSTEHEN — 3 Hörtexte · 25 Fragen
// =============================================================================

// --- Hörverstehen 1: Dialog, Richtig/Falsch, 8 Aufgaben ----------------------
const HV1: TdListeningTask = {
  no: 1, kind: 'rf',
  titleDe: 'Im Studierendensekretariat',
  instructionDe: 'Sie hören ein Gespräch zwischen einer Studentin und einem Mitarbeiter. Entscheiden Sie, ob die Aussagen richtig oder falsch sind. Sie hören den Text einmal.',
  plays: 1,
  audioText:
`Mitarbeiter: Guten Tag, willkommen im Studierendensekretariat. Wie kann ich Ihnen helfen?
Studentin: Guten Tag. Ich bin neu hier und möchte mich für das Wintersemester einschreiben. Ich studiere Biologie.
Mitarbeiter: Sehr gern. Haben Sie Ihren Zulassungsbescheid und Ihren Ausweis dabei?
Studentin: Den Zulassungsbescheid habe ich hier. Aber meinen Personalausweis habe ich leider zu Hause vergessen.
Mitarbeiter: Das ist kein Problem, ein Foto auf dem Handy reicht heute aus. Den Semesterbeitrag von 320 Euro haben Sie bereits überwiesen?
Studentin: Ja, vorgestern. Wie lange dauert es, bis ich meinen Studierendenausweis bekomme?
Mitarbeiter: In der Regel etwa eine Woche. Wir schicken ihn Ihnen per Post zu.
Studentin: Und gilt der Ausweis auch als Fahrkarte für Busse und Bahnen?
Mitarbeiter: Ja, das Semesterticket ist im Beitrag enthalten. Sie können damit im ganzen Bundesland fahren.
Studentin: Wunderbar. Eine letzte Frage: Wo finde ich Informationen zu den Vorlesungen?
Mitarbeiter: Den Stundenplan finden Sie im Online-Portal. Ihre Zugangsdaten bekommen Sie zusammen mit dem Ausweis.
Studentin: Vielen Dank für Ihre Hilfe!
Mitarbeiter: Gern geschehen. Einen schönen Tag noch.`,
  questions: [
    { id: 'hv1-1', prompt: 'Die Studentin möchte sich für das Sommersemester einschreiben.', choices: RF, correctIndex: 1 },
    { id: 'hv1-2', prompt: 'Sie studiert Biologie.', choices: RF, correctIndex: 0 },
    { id: 'hv1-3', prompt: 'Sie hat ihren Personalausweis dabei.', choices: RF, correctIndex: 1 },
    { id: 'hv1-4', prompt: 'Ein Foto des Ausweises auf dem Handy reicht aus.', choices: RF, correctIndex: 0 },
    { id: 'hv1-5', prompt: 'Der Semesterbeitrag beträgt 320 Euro.', choices: RF, correctIndex: 0 },
    { id: 'hv1-6', prompt: 'Den Studierendenausweis bekommt sie sofort.', choices: RF, correctIndex: 1 },
    { id: 'hv1-7', prompt: 'Das Semesterticket ist im Beitrag enthalten.', choices: RF, correctIndex: 0 },
    { id: 'hv1-8', prompt: 'Den Stundenplan findet sie im Online-Portal.', choices: RF, correctIndex: 0 },
  ],
};

// --- Hörverstehen 2: Radiointerview, Multiple Choice, 10 Aufgaben -------------
const HV2: TdListeningTask = {
  no: 2, kind: 'mc',
  titleDe: 'Interview: Weniger Autos in der Stadt',
  instructionDe: 'Sie hören ein Radiointerview mit einer Verkehrsforscherin. Wählen Sie für jede Frage die richtige Antwort. Sie hören den Text einmal.',
  plays: 1,
  audioText:
`Moderator: Guten Morgen und herzlich willkommen zu unserem Wissenschaftsmagazin. Heute zu Gast ist Frau Dr. Lehmann, Verkehrsforscherin an der Technischen Universität. Frau Lehmann, viele Städte wollen den Autoverkehr reduzieren. Warum eigentlich?
Dr. Lehmann: Guten Morgen. Der Hauptgrund ist der Platz. Ein Auto steht im Durchschnitt 23 Stunden am Tag ungenutzt herum und blockiert dabei wertvolle Fläche, die man auch für Wohnungen, Parks oder Radwege nutzen könnte.
Moderator: Aber viele Menschen sind doch auf ihr Auto angewiesen.
Dr. Lehmann: Das stimmt, vor allem auf dem Land. In den Städten jedoch ließe sich ein großer Teil der Fahrten leicht ersetzen. Über die Hälfte aller Autofahrten in der Stadt ist kürzer als fünf Kilometer – solche Strecken kann man oft bequem mit dem Fahrrad zurücklegen.
Moderator: Was müsste sich ändern, damit mehr Menschen umsteigen?
Dr. Lehmann: Entscheidend ist die Sicherheit. Solange sich Radfahrer zwischen den Autos bedroht fühlen, werden viele nicht aufs Rad steigen. Breite, geschützte Radwege sind deshalb wichtiger als alle Appelle.
Moderator: Und der öffentliche Nahverkehr?
Dr. Lehmann: Der muss zuverlässig und bezahlbar sein. Wenn der Bus nur einmal pro Stunde fährt, nimmt niemand freiwillig den Bus. Manche Städte experimentieren inzwischen sogar mit kostenlosem Nahverkehr, finanziert über Steuern.
Moderator: Kritiker sagen, solche Maßnahmen seien zu teuer.
Dr. Lehmann: Kurzfristig kosten sie Geld, das ist richtig. Doch langfristig sparen die Städte enorm – durch weniger Lärm, sauberere Luft und geringere Gesundheitskosten. Die Rechnung geht am Ende auf.
Moderator: Frau Lehmann, vielen Dank für das Gespräch.`,
  questions: [
    { id: 'hv2-1', prompt: 'Welchen Beruf hat Frau Dr. Lehmann?', choices: ['Ärztin', 'Verkehrsforscherin', 'Politikerin'], correctIndex: 1 },
    { id: 'hv2-2', prompt: 'Was ist der Hauptgrund, den Autoverkehr zu reduzieren?', choices: ['der Platz, den Autos blockieren', 'der hohe Benzinpreis', 'die Lautstärke der Motoren'], correctIndex: 0 },
    { id: 'hv2-3', prompt: 'Wie lange steht ein Auto im Durchschnitt ungenutzt?', choices: ['5 Stunden', '12 Stunden', '23 Stunden'], correctIndex: 2 },
    { id: 'hv2-4', prompt: 'Wo sind die Menschen besonders auf das Auto angewiesen?', choices: ['in der Innenstadt', 'auf dem Land', 'an Bahnhöfen'], correctIndex: 1 },
    { id: 'hv2-5', prompt: 'Wie lang ist über die Hälfte aller Autofahrten in der Stadt?', choices: ['kürzer als verboten', 'kürzer als fünf Kilometer', 'genau zehn Kilometer'], correctIndex: 1 },
    { id: 'hv2-6', prompt: 'Was ist entscheidend, damit Menschen aufs Rad umsteigen?', choices: ['bessere Werbung', 'die Sicherheit bzw. geschützte Radwege', 'billigere Fahrräder'], correctIndex: 1 },
    { id: 'hv2-7', prompt: 'Wie soll der öffentliche Nahverkehr sein?', choices: ['schnell und teuer', 'zuverlässig und bezahlbar', 'selten, aber komfortabel'], correctIndex: 1 },
    { id: 'hv2-8', prompt: 'Was passiert, wenn der Bus nur einmal pro Stunde fährt?', choices: ['Die Menschen nehmen ihn trotzdem gern.', 'Niemand nimmt freiwillig den Bus.', 'Die Stadt verdient daran.'], correctIndex: 1 },
    { id: 'hv2-9', prompt: 'Womit experimentieren manche Städte?', choices: ['mit kostenlosem Nahverkehr', 'mit fliegenden Autos', 'mit höheren Parkgebühren'], correctIndex: 0 },
    { id: 'hv2-10', prompt: 'Wie bewertet die Expertin die Kosten langfristig?', choices: ['Sie bleiben dauerhaft sehr hoch.', 'Langfristig sparen die Städte.', 'Sie lassen sich nicht berechnen.'], correctIndex: 1 },
  ],
};

// --- Hörverstehen 3: Vortrag, Multiple Choice, 7 Aufgaben ---------------------
const HV3: TdListeningTask = {
  no: 3, kind: 'mc',
  titleDe: 'Vortrag: Bäume in der Stadt',
  instructionDe: 'Sie hören einen Ausschnitt aus einem wissenschaftlichen Vortrag. Wählen Sie für jede Frage die richtige Antwort. Sie hören den Text einmal.',
  plays: 1,
  audioText:
`Meine Damen und Herren, in meinem heutigen Vortrag möchte ich Ihnen erläutern, welche Rolle Bäume für das Klima unserer Städte spielen. Dabei geht es um weit mehr als um Ästhetik.

Beginnen wir mit der Temperatur. An heißen Sommertagen kann es in dicht bebauten Vierteln bis zu zehn Grad wärmer sein als im Umland. Fachleute sprechen von der städtischen Wärmeinsel. Bäume wirken dieser Erwärmung auf zweifache Weise entgegen: Zum einen spenden sie Schatten, zum anderen geben sie über ihre Blätter Wasser ab und kühlen so die Luft – ähnlich wie eine natürliche Klimaanlage.

Ein zweiter Punkt ist das Regenwasser. Bei starken Regenfällen sind die Kanalisationen vieler Städte überlastet. Bäume und begrünte Flächen nehmen einen Teil des Wassers auf und geben es langsam wieder ab. Auf diese Weise verringern sie die Gefahr von Überschwemmungen.

Drittens verbessern Bäume die Luftqualität, indem sie Staubpartikel binden. Allerdings – und das wird oft übersehen – können sie die Luftverschmutzung nicht vollständig ausgleichen. Sie sind eine Ergänzung, kein Ersatz für eine kluge Verkehrspolitik.

Schließlich darf man die Wirkung auf den Menschen nicht unterschätzen. Studien belegen, dass schon der Blick auf Grün den Stresspegel senkt und die Konzentration fördert. Patienten in Krankenhäusern mit Blick ins Grüne erholen sich nachweislich schneller.

Sie sehen also: Der Baum in der Stadt ist kein Luxus, sondern ein unverzichtbarer Bestandteil einer lebenswerten und zukunftsfähigen Stadt.`,
  questions: [
    { id: 'hv3-1', prompt: 'Worum geht es im Vortrag vor allem?', choices: ['um die Schönheit von Bäumen', 'um die Rolle der Bäume für das Stadtklima', 'um die Geschichte der Städte'], correctIndex: 1 },
    { id: 'hv3-2', prompt: 'Wie viel wärmer kann es in dicht bebauten Vierteln sein?', choices: ['bis zu zehn Grad', 'bis zu zwanzig Grad', 'bis zu drei Grad'], correctIndex: 0 },
    { id: 'hv3-3', prompt: 'Wie kühlen Bäume die Luft außer durch Schatten?', choices: ['Sie geben über die Blätter Wasser ab.', 'Sie erzeugen Wind.', 'Sie speichern Sonnenlicht.'], correctIndex: 0 },
    { id: 'hv3-4', prompt: 'Welchen Nutzen haben Bäume bei starkem Regen?', choices: ['Sie verstärken Überschwemmungen.', 'Sie nehmen Wasser auf und verringern Überschwemmungen.', 'Sie leiten das Wasser in die Kanalisation.'], correctIndex: 1 },
    { id: 'hv3-5', prompt: 'Was sagt die Rednerin über die Luftreinigung durch Bäume?', choices: ['Bäume gleichen die Luftverschmutzung vollständig aus.', 'Bäume sind eine Ergänzung, kein Ersatz für gute Verkehrspolitik.', 'Bäume verschlechtern die Luft.'], correctIndex: 1 },
    { id: 'hv3-6', prompt: 'Welche Wirkung auf den Menschen wird genannt?', choices: ['Grün senkt den Stresspegel und fördert die Konzentration.', 'Grün macht müde.', 'Grün hat keine messbare Wirkung.'], correctIndex: 0 },
    { id: 'hv3-7', prompt: 'Was ist die Schlussfolgerung der Rednerin?', choices: ['Bäume in der Stadt sind ein Luxus.', 'Bäume sind ein unverzichtbarer Bestandteil einer lebenswerten Stadt.', 'Bäume sollten durch Klimaanlagen ersetzt werden.'], correctIndex: 1 },
  ],
};

// =============================================================================
// SCHRIFTLICHER AUSDRUCK — 1 Aufgabe (Grafikbeschreibung + Stellungnahme)
// =============================================================================
const WRITING: TdWritingTask = {
  titleDe: 'Schriftlicher Ausdruck',
  introDe: 'Sie nehmen an einem Studienkolleg teil. Ihre Aufgabe ist es, einen zusammenhängenden Text zu schreiben. Beschreiben Sie zunächst die Grafik und nehmen Sie anschließend Stellung. Schreiben Sie mindestens 250 Wörter. Planen Sie etwa 60 Minuten ein.',
  graph: {
    kind: 'line',
    captionDe: 'Studienanfängerinnen und Studienanfänger an Universitäten und Fachhochschulen in Deutschland (in Tausend)',
    xLabels: ['2005', '2009', '2013', '2017', '2021'],
    yUnit: 'Tsd.',
    series: [
      { label: 'Universität', values: [200, 247, 266, 281, 290], color: '#7c3aed' },
      { label: 'Fachhochschule', values: [120, 150, 200, 230, 245], color: '#0ea5e9' },
    ],
  },
  argumentPromptDe: 'Immer mehr junge Menschen entscheiden sich für ein Studium statt für eine berufliche Ausbildung. Diskutieren Sie Vor- und Nachteile dieser Entwicklung, vergleichen Sie die Situation mit Ihrem Heimatland und nehmen Sie begründet Stellung.',
  bulletPointsDe: [
    'Beschreiben Sie die wichtigsten Informationen der Grafik (Entwicklung, Anfangs- und Endwerte).',
    'Vergleichen Sie die Entwicklung an Universitäten und Fachhochschulen.',
    'Nennen Sie Vor- und Nachteile eines Studiums gegenüber einer Ausbildung.',
    'Gehen Sie auf die Situation in Ihrem Heimatland ein.',
    'Begründen Sie Ihre eigene Meinung.',
  ],
  minWords: 250,
  modelAnswer:
`Die Grafik zeigt die Entwicklung der Zahl der Studienanfängerinnen und Studienanfänger an Universitäten und Fachhochschulen in Deutschland zwischen 2005 und 2021, angegeben in Tausend.

Auf den ersten Blick fällt auf, dass beide Werte im gesamten Zeitraum gestiegen sind. Die Zahl der Universitätsanfänger nahm von 200.000 im Jahr 2005 auf 290.000 im Jahr 2021 zu. Noch deutlicher wuchs die Zahl an den Fachhochschulen: Sie verdoppelte sich nahezu von 120.000 auf 245.000. Der Abstand zwischen beiden Hochschultypen wurde dadurch kleiner.

Diese Entwicklung hat mehrere Ursachen und bringt Vor- und Nachteile mit sich. Einerseits eröffnet ein Studium bessere Berufschancen und ein höheres Einkommen; eine akademische Ausbildung gilt zudem als Voraussetzung für viele moderne Berufe. Andererseits führt der Trend dazu, dass praktische Ausbildungsberufe an Ansehen verlieren, obwohl die Wirtschaft dringend Fachkräfte benötigt. Nicht jeder Studienabschluss garantiert außerdem einen Arbeitsplatz.

In meinem Heimatland lässt sich eine ähnliche Tendenz beobachten: Auch hier streben immer mehr Jugendliche ein Hochschulstudium an, während handwerkliche Berufe weniger beliebt sind.

Meiner Meinung nach ist Bildung grundsätzlich positiv, doch sollte ein Studium nicht der einzige anerkannte Weg sein. Wichtig wäre, auch die berufliche Ausbildung aufzuwerten, damit junge Menschen ihre Entscheidung nach Interesse und Begabung treffen können und nicht allein nach dem Prestige eines Abschlusses.`,
};

// =============================================================================
// MÜNDLICHER AUSDRUCK — 7 Situationsaufgaben (TDN 3 → 5)
// =============================================================================
const SPEAKING: TdSpeakingTask[] = [
  {
    no: 1, tdn: 'TDN 3',
    titleDe: 'Eine Auskunft geben',
    situationDe: 'Ihre Freundin Sophie möchte vielleicht an Ihrer Universität studieren. Sie ruft an und fragt Sie, wie das Studentenleben dort ist.',
    taskDe: 'Erzählen Sie Sophie kurz, wie das Leben an Ihrer Hochschule ist: Wohnen, Mensa, Freizeit. Geben Sie ihr einen freundlichen Überblick.',
    prepSeconds: 30, speakSeconds: 60,
    modelAnswer: 'Hallo Sophie, schön, dass du dich für meine Uni interessierst! Das Studentenleben hier ist wirklich angenehm. Die meisten Studierenden wohnen in Wohnheimen oder WGs, die nicht zu teuer sind. In der Mensa kann man günstig und ziemlich gut essen, ein Mittagessen kostet nur etwa drei Euro. In der Freizeit gibt es viele Angebote: Hochschulsport, Sprachkurse und am Wochenende oft kleine Partys. Ich glaube, du würdest dich hier schnell wohlfühlen. Wenn du willst, zeige ich dir bald den Campus.',
  },
  {
    no: 2, tdn: 'TDN 3–4',
    titleDe: 'Aus einer Statistik berichten',
    situationDe: 'In einem Seminar haben Sie eine Umfrage gesehen, wie Studierende ihre Freizeit verbringen: Freunde treffen 35 %, Sport 25 %, soziale Medien 20 %, Lesen 12 %, Sonstiges 8 %.',
    taskDe: 'Berichten Sie Ihren Kommilitonen, was diese Zahlen zeigen. Nennen Sie die wichtigsten Werte und vergleichen Sie sie.',
    prepSeconds: 60, speakSeconds: 60,
    modelAnswer: 'Die Umfrage zeigt, wie Studierende ihre Freizeit verbringen. An erster Stelle steht das Treffen mit Freunden mit 35 Prozent, also mehr als ein Drittel. Danach folgt Sport mit 25 Prozent. Soziale Medien nehmen mit 20 Prozent den dritten Platz ein. Auffällig ist, dass nur 12 Prozent in ihrer Freizeit lesen – deutlich weniger als Sport treiben. Die restlichen 8 Prozent entfallen auf sonstige Aktivitäten. Insgesamt scheinen soziale Kontakte und Bewegung den Studierenden wichtiger zu sein als das Lesen.',
  },
  {
    no: 3, tdn: 'TDN 4',
    titleDe: 'Über eigene Erfahrungen berichten',
    situationDe: 'In Ihrem Deutschkurs sprechen Sie über das Thema „Sprachen lernen“.',
    taskDe: 'Berichten Sie, wie Sie am besten eine Fremdsprache lernen. Welche Methoden helfen Ihnen und warum? Geben Sie konkrete Beispiele.',
    prepSeconds: 60, speakSeconds: 90,
    modelAnswer: 'Ich lerne eine Fremdsprache am besten, wenn ich sie regelmäßig benutze und nicht nur Grammatikregeln auswendig lerne. Erstens schaue ich gern Serien und Videos mit Untertiteln, weil ich so neue Wörter im Zusammenhang höre. Zweitens schreibe ich mir wichtige Vokabeln auf kleine Karten und wiederhole sie jeden Tag ein paar Minuten. Besonders hilfreich finde ich es, mit anderen zu sprechen, auch wenn ich Fehler mache – denn aus Fehlern lerne ich am meisten. Außerdem versuche ich, jeden Tag wenigstens ein bisschen zu üben, weil regelmäßiges Lernen wirksamer ist als langes Lernen am Wochenende. So habe ich in einem Jahr große Fortschritte gemacht.',
  },
  {
    no: 4, tdn: 'TDN 4',
    titleDe: 'Stellung nehmen und begründen',
    situationDe: 'Ein Freund überlegt, sein Studium abzubrechen, um sofort Geld zu verdienen.',
    taskDe: 'Sagen Sie ihm Ihre Meinung. Sind Sie dafür oder dagegen? Begründen Sie Ihre Position mit mindestens zwei Argumenten.',
    prepSeconds: 90, speakSeconds: 90,
    modelAnswer: 'Ich verstehe, dass du schnell Geld verdienen möchtest, aber ehrlich gesagt würde ich dir raten, dein Studium nicht abzubrechen. Erstens hast du schon viel Zeit und Energie investiert; es wäre schade, kurz vor dem Abschluss aufzugeben. Zweitens hast du mit einem Abschluss langfristig deutlich bessere Berufschancen und meistens auch ein höheres Gehalt. Ein gut bezahlter Job ohne Abschluss ist oft schwerer zu finden, als man denkt. Wenn das Geld das eigentliche Problem ist, könntest du vielleicht einen Nebenjob annehmen oder ein Stipendium beantragen, statt ganz aufzuhören. Überlege es dir also gut, bevor du eine endgültige Entscheidung triffst.',
  },
  {
    no: 5, tdn: 'TDN 4–5',
    titleDe: 'Vor- und Nachteile abwägen',
    situationDe: 'An Ihrer Universität wird diskutiert, ob alle Vorlesungen nur noch online stattfinden sollen.',
    taskDe: 'Wägen Sie die Vor- und Nachteile von Online-Vorlesungen ab und sagen Sie am Ende, was Sie für sinnvoller halten.',
    prepSeconds: 90, speakSeconds: 120,
    modelAnswer: 'Online-Vorlesungen haben sowohl Vorteile als auch Nachteile. Ein klarer Vorteil ist die Flexibilität: Man spart den Weg zur Uni und kann Aufzeichnungen jederzeit wiederholen, was besonders beim Lernen für Prüfungen hilft. Außerdem können auch Studierende teilnehmen, die weit weg wohnen oder arbeiten müssen. Auf der anderen Seite gibt es deutliche Nachteile. Der persönliche Kontakt zu den Dozenten und Kommilitonen geht verloren, und es fällt vielen schwerer, sich zu Hause zu konzentrieren. Auch spontane Diskussionen entstehen online seltener. Alles in allem halte ich eine Mischung für am sinnvollsten: große Vorlesungen könnten online stattfinden, während Seminare und Übungen besser in Präsenz bleiben. So verbindet man Flexibilität mit dem wichtigen persönlichen Austausch.',
  },
  {
    no: 6, tdn: 'TDN 5',
    titleDe: 'Hypothesen bilden / spekulieren',
    situationDe: 'Stellen Sie sich vor, an den Universitäten gäbe es überhaupt keine Prüfungen mehr.',
    taskDe: 'Spekulieren Sie darüber, welche Folgen das hätte – für die Studierenden und für die Qualität der Ausbildung. Nennen Sie mögliche positive und negative Auswirkungen.',
    prepSeconds: 120, speakSeconds: 120,
    modelAnswer: 'Wenn es an den Universitäten gar keine Prüfungen mehr gäbe, hätte das vermutlich weitreichende Folgen. Einerseits stünden die Studierenden unter viel weniger Druck und Prüfungsangst würde verschwinden. Manche würden vielleicht freier und aus echtem Interesse lernen, ohne nur für eine Note zu büffeln. Andererseits befürchte ich, dass viele ohne Prüfungen die Motivation verlieren würden, regelmäßig zu arbeiten. Prüfungen geben schließlich auch eine klare Struktur und ein Ziel. Außerdem wäre es schwieriger zu beurteilen, ob jemand die nötigen Kenntnisse tatsächlich besitzt – Arbeitgeber könnten den Abschlüssen weniger vertrauen. Denkbar wäre, dass man Prüfungen durch Projekte oder Präsentationen ersetzt. Insgesamt glaube ich, dass eine völlige Abschaffung mehr Probleme schaffen als lösen würde; sinnvoller wäre es, die Prüfungsformen zu verbessern, statt sie ganz abzuschaffen.',
  },
  {
    no: 7, tdn: 'TDN 5',
    titleDe: 'Alternativen abwägen und sich entscheiden',
    situationDe: 'Eine Stadt hat Geld übrig und kann genau eines bauen: eine neue Bibliothek, ein Sportzentrum oder günstige Studentenwohnungen.',
    taskDe: 'Wägen Sie die drei Möglichkeiten gegeneinander ab. Nennen Sie Vor- und Nachteile und entscheiden Sie sich am Ende begründet für eine Option.',
    prepSeconds: 180, speakSeconds: 120,
    modelAnswer: 'Die Stadt hat drei sinnvolle Möglichkeiten, und jede hat ihre Berechtigung. Eine neue Bibliothek würde Bildung und Kultur fördern und allen Bürgern offenstehen; allerdings nutzen heute viele Menschen eher digitale Quellen. Ein Sportzentrum käme der Gesundheit zugute und brächte Menschen zusammen, doch es spricht vielleicht nicht alle Altersgruppen gleichermaßen an. Günstige Studentenwohnungen schließlich würden ein sehr konkretes Problem lösen, denn in vielen Städten ist bezahlbarer Wohnraum knapp und die Mieten sind hoch. Wägt man alles ab, würde ich mich für die Studentenwohnungen entscheiden. Bildung und Sport sind zwar wichtig, aber wer keine bezahlbare Unterkunft findet, kann gar nicht erst studieren. Wohnraum ist also die Grundlage, auf der alles andere aufbaut. Deshalb halte ich diese Investition für am dringendsten und am nachhaltigsten.',
  },
];

// =============================================================================
// TESTDAF EXAM DATA STRUCTURE
// =============================================================================
export const TESTDAF_EXAM: TestDafModelExam = {
  reading: [LV1, LV2, LV3],
  listening: [HV1, HV2, HV3],
  writing: WRITING,
  speaking: SPEAKING,
  durations: { reading: 60 * 60, listening: 40 * 60, writing: 60 * 60, speaking: 35 * 60 },
};

// Total questions counts for auto-grading
export const TD_READING_COUNT = LV1.questions.length + LV2.questions.length + LV3.questions.length; // 30
export const TD_LISTENING_COUNT = HV1.questions.length + HV2.questions.length + HV3.questions.length; // 25

// TestDaF levels approximation
export function tdnFromScore(correct: number, total: number): { tdn: string; label: string } {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.8) return { tdn: 'TDN 5', label: 'Sehr gut (C1)' };
  if (pct >= 0.6) return { tdn: 'TDN 4', label: 'Gut (B2+)' };
  if (pct >= 0.45) return { tdn: 'TDN 3', label: 'Befriedigend (B2)' };
  return { tdn: 'unter TDN 3', label: 'Nicht bestanden / Unter TDN 3' };
}
