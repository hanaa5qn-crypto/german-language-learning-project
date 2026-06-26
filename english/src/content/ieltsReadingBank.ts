// =============================================================================
// IELTS Reading — mass-produced graded practice bank.
// -----------------------------------------------------------------------------
// 20 questions at EACH CEFR level (A1–C2) = 120 MCQs, grouped into short
// passages (4 passages × 5 questions per level). Passages are level-scaled:
// concrete present-tense at A1, rising to dense abstract argument at C2. Each
// question mirrors an authentic IELTS Reading task (main idea, detail,
// vocabulary-in-context, inference, purpose). Merged into READING_LIBRARY via
// content/index.ts. Item ids start at 1001 to avoid colliding with the core
// library (1–21).
// =============================================================================
import { ReadingItem } from '../types';

export const IELTS_READING_BANK: ReadingItem[] = [
  // ===========================================================================
  // A1 — concrete, present tense, everyday topics
  // ===========================================================================
  {
    id: 1001,
    level: 'A1',
    topic: 'Daily life',
    title: 'Tom’s Morning',
    text:
      'Tom is a student. He gets up at seven o’clock every day. He has bread and milk for breakfast. Then he takes the bus to school. The bus is green. School starts at half past eight. Tom likes English and sport, but he does not like maths. After school, he plays football with his friends in the park.',
    questions: [
      { id: 1, question: 'What time does Tom get up?', choices: ['Six o’clock', 'Seven o’clock', 'Eight o’clock', 'Half past eight'], correctIndex: 1, explanation: '"He gets up at seven o’clock every day."' },
      { id: 2, question: 'What does Tom have for breakfast?', choices: ['Eggs and tea', 'Bread and milk', 'Rice and water', 'Fruit and juice'], correctIndex: 1, explanation: '"He has bread and milk for breakfast."' },
      { id: 3, question: 'How does Tom go to school?', choices: ['By car', 'By bike', 'By bus', 'On foot'], correctIndex: 2, explanation: '"Then he takes the bus to school."' },
      { id: 4, question: 'Which subject does Tom NOT like?', choices: ['English', 'Sport', 'Maths', 'Music'], correctIndex: 2, explanation: '"he does not like maths."' },
      { id: 5, question: 'What does Tom do after school?', choices: ['He sleeps', 'He plays football', 'He reads books', 'He cooks dinner'], correctIndex: 1, explanation: '"he plays football with his friends in the park."' },
    ],
  },
  {
    id: 1002,
    level: 'A1',
    topic: 'Family',
    title: 'My Family',
    text:
      'I have a small family. My mother is a nurse and my father is a driver. I have one sister. Her name is Lucy and she is ten years old. We have a cat. The cat is black and white. We live in a small house near the river. On Sundays, we eat lunch together.',
    questions: [
      { id: 1, question: 'What is the mother’s job?', choices: ['A teacher', 'A nurse', 'A driver', 'A cook'], correctIndex: 1, explanation: '"My mother is a nurse."' },
      { id: 2, question: 'How old is Lucy?', choices: ['Eight', 'Nine', 'Ten', 'Eleven'], correctIndex: 2, explanation: '"she is ten years old."' },
      { id: 3, question: 'What colour is the cat?', choices: ['All black', 'Black and white', 'Grey', 'Brown'], correctIndex: 1, explanation: '"The cat is black and white."' },
      { id: 4, question: 'Where does the family live?', choices: ['Near the sea', 'Near the river', 'In the city centre', 'On a farm'], correctIndex: 1, explanation: '"We live in a small house near the river."' },
      { id: 5, question: 'When does the family eat lunch together?', choices: ['On Saturdays', 'On Sundays', 'Every day', 'On Mondays'], correctIndex: 1, explanation: '"On Sundays, we eat lunch together."' },
    ],
  },
  {
    id: 1003,
    level: 'A1',
    topic: 'Shopping',
    title: 'At the Shop',
    text:
      'Anna goes to the shop on Saturday. She wants to buy apples, bread and milk. The apples are red. They cost two dollars. The shop is open from nine in the morning to six in the evening. Anna pays the man and says thank you. Then she walks home with her bag.',
    questions: [
      { id: 1, question: 'When does Anna go to the shop?', choices: ['On Friday', 'On Saturday', 'On Sunday', 'On Monday'], correctIndex: 1, explanation: '"Anna goes to the shop on Saturday."' },
      { id: 2, question: 'What does Anna want to buy?', choices: ['Apples, bread and milk', 'Eggs and cheese', 'Meat and rice', 'Tea and sugar'], correctIndex: 0, explanation: '"She wants to buy apples, bread and milk."' },
      { id: 3, question: 'How much do the apples cost?', choices: ['One dollar', 'Two dollars', 'Three dollars', 'Five dollars'], correctIndex: 1, explanation: '"They cost two dollars."' },
      { id: 4, question: 'What time does the shop close?', choices: ['Nine in the morning', 'Six in the evening', 'Eight in the evening', 'Midday'], correctIndex: 1, explanation: '"open from nine in the morning to six in the evening."' },
      { id: 5, question: 'How does Anna go home?', choices: ['By bus', 'By car', 'She walks', 'By bike'], correctIndex: 2, explanation: '"she walks home with her bag."' },
    ],
  },
  {
    id: 1004,
    level: 'A1',
    topic: 'Weather',
    title: 'The Weather Today',
    text:
      'Today it is sunny and warm. The sky is blue. Many people are in the park. Some children play with a ball. An old man sits on a bench and reads a newspaper. A woman walks her dog. In the afternoon, it is hot, so people drink cold water and eat ice cream.',
    questions: [
      { id: 1, question: 'What is the weather like today?', choices: ['Cold and rainy', 'Sunny and warm', 'Cloudy', 'Windy'], correctIndex: 1, explanation: '"Today it is sunny and warm."' },
      { id: 2, question: 'Where are many people?', choices: ['At home', 'In the park', 'At school', 'At the beach'], correctIndex: 1, explanation: '"Many people are in the park."' },
      { id: 3, question: 'What does the old man do?', choices: ['He plays football', 'He reads a newspaper', 'He sleeps', 'He runs'], correctIndex: 1, explanation: '"An old man sits on a bench and reads a newspaper."' },
      { id: 4, question: 'What is the weather like in the afternoon?', choices: ['Cold', 'Hot', 'Snowy', 'Foggy'], correctIndex: 1, explanation: '"In the afternoon, it is hot."' },
      { id: 5, question: 'What do people eat?', choices: ['Hot soup', 'Ice cream', 'Bread', 'Cake'], correctIndex: 1, explanation: '"people drink cold water and eat ice cream."' },
    ],
  },

  // ===========================================================================
  // A2 — simple past/future, short narratives and routines
  // ===========================================================================
  {
    id: 1005,
    level: 'A2',
    topic: 'Travel',
    title: 'A Trip to the Mountains',
    text:
      'Last summer, my friend and I travelled to the mountains. We took an early train because the journey was long. When we arrived, the air was cool and fresh. We stayed in a small wooden cabin for three nights. Every morning we walked to a lake and went swimming. The water was very cold, but we loved it. On the last day, it rained, so we stayed inside and played cards. I want to go back next year.',
    questions: [
      { id: 1, question: 'When did the writer travel to the mountains?', choices: ['Last winter', 'Last summer', 'Next year', 'Last weekend'], correctIndex: 1, explanation: '"Last summer, my friend and I travelled to the mountains."' },
      { id: 2, question: 'Why did they take an early train?', choices: ['It was cheaper', 'The journey was long', 'The train was faster', 'They woke up early'], correctIndex: 1, explanation: '"We took an early train because the journey was long."' },
      { id: 3, question: 'How long did they stay in the cabin?', choices: ['Two nights', 'Three nights', 'A week', 'One night'], correctIndex: 1, explanation: '"We stayed in a small wooden cabin for three nights."' },
      { id: 4, question: 'What did they do every morning?', choices: ['Went swimming', 'Played cards', 'Took the train', 'Cooked breakfast'], correctIndex: 0, explanation: '"Every morning we walked to a lake and went swimming."' },
      { id: 5, question: 'Why did they stay inside on the last day?', choices: ['They were tired', 'It rained', 'The lake was closed', 'They were ill'], correctIndex: 1, explanation: '"On the last day, it rained, so we stayed inside."' },
    ],
  },
  {
    id: 1006,
    level: 'A2',
    topic: 'Shopping',
    title: 'New Shoes',
    text:
      'Maria needed new shoes for work. On Saturday, she went to a shoe shop in the city centre. The shop was busy. She tried on three pairs. The first pair was too small and the second was too expensive. The third pair was comfortable and not expensive, so she bought it. The shoes were brown. The assistant gave her a box and a receipt. Maria was happy with her choice.',
    questions: [
      { id: 1, question: 'Why did Maria need new shoes?', choices: ['For a party', 'For work', 'For sport', 'For a holiday'], correctIndex: 1, explanation: '"Maria needed new shoes for work."' },
      { id: 2, question: 'How many pairs did she try on?', choices: ['Two', 'Three', 'Four', 'Five'], correctIndex: 1, explanation: '"She tried on three pairs."' },
      { id: 3, question: 'What was wrong with the second pair?', choices: ['Too small', 'Too big', 'Too expensive', 'The wrong colour'], correctIndex: 2, explanation: '"the second was too expensive."' },
      { id: 4, question: 'Which pair did she buy?', choices: ['The first', 'The second', 'The third', 'None of them'], correctIndex: 2, explanation: '"The third pair was comfortable and not expensive, so she bought it."' },
      { id: 5, question: 'What did the assistant give her?', choices: ['A bag and a gift', 'A box and a receipt', 'A card', 'A discount'], correctIndex: 1, explanation: '"The assistant gave her a box and a receipt."' },
    ],
  },
  {
    id: 1007,
    level: 'A2',
    topic: 'Hobbies',
    title: 'Learning the Guitar',
    text:
      'Six months ago, Daniel decided to learn the guitar. At first, it was difficult and his fingers hurt. He watched free videos on the internet and practised for thirty minutes every evening. After a few weeks, he could play some simple songs. His sister sometimes sang while he played. Daniel is not a professional, but he enjoys playing in his free time. Next month, he will play a song at a family party.',
    questions: [
      { id: 1, question: 'When did Daniel start learning the guitar?', choices: ['Last week', 'Six months ago', 'A year ago', 'Last month'], correctIndex: 1, explanation: '"Six months ago, Daniel decided to learn the guitar."' },
      { id: 2, question: 'Why was it difficult at first?', choices: ['The guitar was broken', 'His fingers hurt', 'He had no teacher', 'He had no time'], correctIndex: 1, explanation: '"At first, it was difficult and his fingers hurt."' },
      { id: 3, question: 'How did Daniel learn?', choices: ['With a private teacher', 'At a music school', 'From free internet videos', 'From a book'], correctIndex: 2, explanation: '"He watched free videos on the internet."' },
      { id: 4, question: 'How long does he practise each evening?', choices: ['Ten minutes', 'Thirty minutes', 'One hour', 'Two hours'], correctIndex: 1, explanation: '"practised for thirty minutes every evening."' },
      { id: 5, question: 'What will Daniel do next month?', choices: ['Buy a new guitar', 'Play at a family party', 'Start lessons', 'Join a band'], correctIndex: 1, explanation: '"Next month, he will play a song at a family party."' },
    ],
  },
  {
    id: 1008,
    level: 'A2',
    topic: 'Food',
    title: 'A Simple Recipe',
    text:
      'My grandmother taught me to make vegetable soup. It is cheap, healthy and easy. First, you cut some carrots, potatoes and onions. Then you put them in a pot with water and a little salt. You cook the soup for about thirty minutes. When the vegetables are soft, the soup is ready. I often make this soup in winter because it keeps me warm. My friends like it too.',
    questions: [
      { id: 1, question: 'Who taught the writer to make the soup?', choices: ['A friend', 'A chef', 'The grandmother', 'A teacher'], correctIndex: 2, explanation: '"My grandmother taught me to make vegetable soup."' },
      { id: 2, question: 'Which word best describes the soup?', choices: ['Expensive', 'Difficult', 'Healthy', 'Spicy'], correctIndex: 2, explanation: '"It is cheap, healthy and easy."' },
      { id: 3, question: 'What do you do first?', choices: ['Add salt', 'Cut the vegetables', 'Boil water', 'Cook for an hour'], correctIndex: 1, explanation: '"First, you cut some carrots, potatoes and onions."' },
      { id: 4, question: 'How long do you cook the soup?', choices: ['Ten minutes', 'About thirty minutes', 'One hour', 'All day'], correctIndex: 1, explanation: '"You cook the soup for about thirty minutes."' },
      { id: 5, question: 'Why does the writer make the soup in winter?', choices: ['It is colourful', 'It keeps them warm', 'It is fast', 'It is famous'], correctIndex: 1, explanation: '"in winter because it keeps me warm."' },
    ],
  },

  // ===========================================================================
  // B1 — opinions, descriptions, simple argument
  // ===========================================================================
  {
    id: 1009,
    level: 'B1',
    topic: 'City life',
    title: 'Living in a Big City',
    text:
      'Many young people move to big cities to find work. Cities offer more jobs, better universities and a wide range of entertainment. However, life in a city is not always easy. Rents are high, the streets are crowded, and the air can be polluted. Some people feel lonely even when they are surrounded by thousands of others. Despite these problems, most newcomers say the opportunities are worth the difficulties, at least while they are young.',
    questions: [
      { id: 1, question: 'Why do many young people move to cities?', choices: ['For cheaper housing', 'To find work and study', 'For cleaner air', 'For a quieter life'], correctIndex: 1, explanation: '"to find work" and cities offer "better universities".' },
      { id: 2, question: 'Which is mentioned as a problem of city life?', choices: ['Low salaries', 'High rents', 'Too few people', 'No universities'], correctIndex: 1, explanation: '"Rents are high, the streets are crowded."' },
      { id: 3, question: 'What does the writer say about loneliness?', choices: ['People are never lonely in cities', 'People can feel lonely among many others', 'Only old people feel lonely', 'Loneliness is the worst problem'], correctIndex: 1, explanation: '"Some people feel lonely even when they are surrounded by thousands of others."' },
      { id: 4, question: 'As used in the text, “opportunities” most nearly means:', choices: ['dangers', 'chances', 'mistakes', 'costs'], correctIndex: 1, explanation: 'Opportunities = chances (to work and study).' },
      { id: 5, question: 'What is the main idea of the text?', choices: ['Cities are perfect places to live', 'City life offers opportunities but also difficulties', 'Everyone should leave the city', 'Cities have no advantages'], correctIndex: 1, explanation: 'The passage balances opportunities against problems — a mixed view.' },
    ],
  },
  {
    id: 1010,
    level: 'B1',
    topic: 'Health',
    title: 'The Benefits of Walking',
    text:
      'Walking is one of the simplest ways to stay healthy. Unlike many sports, it needs no special equipment and costs nothing. Doctors say that a brisk walk of thirty minutes a day can lower stress, strengthen the heart and help people sleep better. Walking is also good for the environment, because people who walk short distances use their cars less. For these reasons, many cities are now building more footpaths and safe crossings to encourage their residents to walk.',
    questions: [
      { id: 1, question: 'According to the text, why is walking convenient?', choices: ['It is fast', 'It needs no special equipment', 'It is a team sport', 'It requires a gym'], correctIndex: 1, explanation: '"it needs no special equipment and costs nothing."' },
      { id: 2, question: 'How long should people walk each day?', choices: ['Ten minutes', 'Thirty minutes', 'One hour', 'Two hours'], correctIndex: 1, explanation: '"a brisk walk of thirty minutes a day."' },
      { id: 3, question: 'Which benefit is NOT mentioned?', choices: ['Lower stress', 'Stronger heart', 'Better sleep', 'Weight gain'], correctIndex: 3, explanation: 'The text lists lower stress, stronger heart and better sleep — not weight gain.' },
      { id: 4, question: 'Why is walking good for the environment?', choices: ['It cleans the streets', 'People use their cars less', 'It plants trees', 'It reduces noise'], correctIndex: 1, explanation: '"people who walk short distances use their cars less."' },
      { id: 5, question: 'Why are cities building more footpaths?', choices: ['To reduce traffic fines', 'To encourage residents to walk', 'To attract tourists', 'To sell more cars'], correctIndex: 1, explanation: '"to encourage their residents to walk."' },
    ],
  },
  {
    id: 1011,
    level: 'B1',
    topic: 'Technology',
    title: 'Smartphones in the Classroom',
    text:
      'Smartphones have become common in schools, and teachers disagree about them. Supporters argue that phones give students instant access to information and useful learning apps. Critics, on the other hand, say that phones distract students and make cheating easier. A recent survey found that students who kept their phones in their bags scored higher in tests than those who kept them on their desks. As a result, some schools now ask students to switch off their phones during lessons rather than ban them completely.',
    questions: [
      { id: 1, question: 'What do supporters of phones in school argue?', choices: ['Phones are cheap', 'Phones give access to information and apps', 'Phones are fun', 'Phones replace teachers'], correctIndex: 1, explanation: '"phones give students instant access to information and useful learning apps."' },
      { id: 2, question: 'What problem do critics mention?', choices: ['Phones are heavy', 'Phones distract students', 'Phones are expensive', 'Phones break easily'], correctIndex: 1, explanation: '"phones distract students and make cheating easier."' },
      { id: 3, question: 'What did the survey find?', choices: ['Phones improve all scores', 'Students with phones in their bags scored higher', 'Phones have no effect', 'Students prefer phones on desks'], correctIndex: 1, explanation: '"students who kept their phones in their bags scored higher."' },
      { id: 4, question: 'What do some schools now ask students to do?', choices: ['Buy new phones', 'Switch off phones during lessons', 'Leave phones at home', 'Use phones freely'], correctIndex: 1, explanation: '"ask students to switch off their phones during lessons rather than ban them."' },
      { id: 5, question: 'The writer’s attitude to phones in school is best described as:', choices: ['strongly against', 'balanced', 'enthusiastic', 'uninterested'], correctIndex: 1, explanation: 'The text presents both sides and a compromise — balanced.' },
    ],
  },
  {
    id: 1012,
    level: 'B1',
    topic: 'Money',
    title: 'Saving for the Future',
    text:
      'Learning to save money is an important life skill, yet many young adults find it hard. One common method is the “50/30/20 rule”: spend half your income on needs, thirty per cent on wants, and save the remaining twenty per cent. Experts also advise people to save automatically, by moving money into a savings account on the day they are paid, before they can spend it. Small, regular savings may seem unimportant, but over many years they can grow into a large amount.',
    questions: [
      { id: 1, question: 'Under the 50/30/20 rule, how much should you save?', choices: ['Fifty per cent', 'Thirty per cent', 'Twenty per cent', 'Ten per cent'], correctIndex: 2, explanation: '"save the remaining twenty per cent."' },
      { id: 2, question: 'What should the thirty per cent be spent on?', choices: ['Needs', 'Wants', 'Savings', 'Taxes'], correctIndex: 1, explanation: '"thirty per cent on wants."' },
      { id: 3, question: 'What does “save automatically” mean here?', choices: ['Save by hand each week', 'Move money to savings on payday', 'Use a machine', 'Spend first, save later'], correctIndex: 1, explanation: '"moving money into a savings account on the day they are paid."' },
      { id: 4, question: 'Why save before you can spend?', choices: ['Banks require it', 'To avoid spending the money', 'It earns more interest', 'It is the law'], correctIndex: 1, explanation: '"before they can spend it."' },
      { id: 5, question: 'What is the main message about small savings?', choices: ['They are pointless', 'They can grow large over time', 'They should be avoided', 'They are only for the rich'], correctIndex: 1, explanation: '"over many years they can grow into a large amount."' },
    ],
  },

  // ===========================================================================
  // B2 — academic-leaning, more abstract
  // ===========================================================================
  {
    id: 1013,
    level: 'B2',
    topic: 'Work',
    title: 'The Rise of Remote Work',
    text:
      'The shift towards remote work, accelerated by recent global events, has transformed the modern workplace. Employees increasingly value the flexibility of working from home, which eliminates lengthy commutes and allows a better balance between professional and personal life. Employers, meanwhile, have discovered that they can reduce office costs and recruit talent from a wider geographical area. Nevertheless, the transition is not without drawbacks. Remote workers can struggle to separate work from leisure, and the spontaneous conversations that spark innovation are harder to replicate over video calls. Many organisations have therefore adopted a hybrid model, combining the focus of home with the collaboration of the office.',
    questions: [
      { id: 1, question: 'What benefit of remote work do employees value most, according to the text?', choices: ['Higher salaries', 'Flexibility', 'More holidays', 'Free equipment'], correctIndex: 1, explanation: '"Employees increasingly value the flexibility of working from home."' },
      { id: 2, question: 'How do employers benefit?', choices: ['They pay less tax', 'They reduce office costs and widen recruitment', 'They work fewer hours', 'They avoid regulation'], correctIndex: 1, explanation: '"reduce office costs and recruit talent from a wider geographical area."' },
      { id: 3, question: 'Which drawback is mentioned?', choices: ['Slower internet', 'Difficulty separating work from leisure', 'Higher commuting costs', 'Fewer job openings'], correctIndex: 1, explanation: '"struggle to separate work from leisure."' },
      { id: 4, question: 'Why is innovation said to be harder remotely?', choices: ['Computers are slow', 'Spontaneous conversations are harder to replicate', 'Workers are less skilled', 'There are too many meetings'], correctIndex: 1, explanation: '"spontaneous conversations that spark innovation are harder to replicate over video calls."' },
      { id: 5, question: 'What is the “hybrid model”?', choices: ['Working only at home', 'Working only in the office', 'Combining home and office work', 'Working two jobs'], correctIndex: 2, explanation: '"combining the focus of home with the collaboration of the office."' },
    ],
  },
  {
    id: 1014,
    level: 'B2',
    topic: 'Science',
    title: 'Why We Sleep',
    text:
      'For a long time, sleep was viewed as a passive state in which the body simply shut down to rest. Modern research has overturned this assumption. While we sleep, the brain is remarkably active: it consolidates memories, clears out waste products that build up during the day, and regulates the hormones that control appetite and mood. Studies show that people who are regularly deprived of sleep are more likely to suffer from poor concentration, weakened immunity and even long-term illnesses such as heart disease. Despite this evidence, many adults continue to treat sleep as a luxury rather than a necessity.',
    questions: [
      { id: 1, question: 'How was sleep traditionally viewed?', choices: ['As dangerous', 'As a passive state of rest', 'As a waste of time', 'As an active process'], correctIndex: 1, explanation: '"sleep was viewed as a passive state in which the body simply shut down."' },
      { id: 2, question: 'What does the brain do during sleep?', choices: ['Nothing at all', 'Consolidates memories and clears waste', 'Only dreams', 'Stops working'], correctIndex: 1, explanation: '"it consolidates memories, clears out waste products."' },
      { id: 3, question: 'What can sleep deprivation lead to?', choices: ['Better memory', 'Weakened immunity', 'Stronger hearts', 'Increased appetite control'], correctIndex: 1, explanation: '"weakened immunity and even long-term illnesses."' },
      { id: 4, question: 'As used in the text, “overturned” most nearly means:', choices: ['confirmed', 'reversed', 'ignored', 'repeated'], correctIndex: 1, explanation: 'Overturned an assumption = reversed/contradicted it.' },
      { id: 5, question: 'What is the writer’s main criticism of many adults?', choices: ['They sleep too much', 'They treat sleep as a luxury, not a necessity', 'They ignore exercise', 'They eat too late'], correctIndex: 1, explanation: '"many adults continue to treat sleep as a luxury rather than a necessity."' },
    ],
  },
  {
    id: 1015,
    level: 'B2',
    topic: 'History',
    title: 'A Short History of Coffee',
    text:
      'Coffee, now one of the world’s most traded commodities, has a history stretching back centuries. According to legend, an Ethiopian goatherd noticed that his animals became unusually lively after eating the berries of a particular shrub. Cultivation later spread to the Arabian Peninsula, where coffee houses became lively centres of conversation and debate. When the drink reached Europe in the seventeenth century, it was initially regarded with suspicion, but it soon became fashionable. Today, the global coffee trade supports millions of farmers, although critics point out that many of them earn very little compared with the retailers who sell the final product.',
    questions: [
      { id: 1, question: 'According to legend, who first noticed coffee’s effects?', choices: ['A European trader', 'An Ethiopian goatherd', 'An Arabian doctor', 'A farmer in Europe'], correctIndex: 1, explanation: '"an Ethiopian goatherd noticed that his animals became unusually lively."' },
      { id: 2, question: 'What did coffee houses on the Arabian Peninsula become?', choices: ['Places of worship', 'Centres of conversation and debate', 'Schools', 'Markets'], correctIndex: 1, explanation: '"coffee houses became lively centres of conversation and debate."' },
      { id: 3, question: 'How was coffee first received in Europe?', choices: ['With great enthusiasm', 'With suspicion', 'It was banned forever', 'It was ignored'], correctIndex: 1, explanation: '"it was initially regarded with suspicion."' },
      { id: 4, question: 'What criticism of the modern coffee trade is mentioned?', choices: ['Coffee is unhealthy', 'Many farmers earn very little', 'There is too much coffee', 'Coffee houses have closed'], correctIndex: 1, explanation: '"many of them earn very little compared with the retailers."' },
      { id: 5, question: 'What is the main purpose of the text?', choices: ['To give a recipe', 'To trace the history and trade of coffee', 'To advertise a brand', 'To warn against caffeine'], correctIndex: 1, explanation: 'The passage outlines coffee’s history and modern trade.' },
    ],
  },
  {
    id: 1016,
    level: 'B2',
    topic: 'Environment',
    title: 'Plastic and the Oceans',
    text:
      'Each year, millions of tonnes of plastic waste flow into the world’s oceans, where they pose a serious threat to marine life. Larger items, such as bags and bottles, can trap or choke animals, but scientists are increasingly concerned about “microplastics” — tiny fragments less than five millimetres across. These particles are eaten by fish and can travel up the food chain to humans. Although recycling helps, researchers argue that it cannot keep pace with production. The most effective solution, they claim, is to reduce the manufacture of single-use plastics in the first place.',
    questions: [
      { id: 1, question: 'What is the main threat described in the text?', choices: ['Oil spills', 'Plastic waste in the oceans', 'Rising sea levels', 'Overfishing'], correctIndex: 1, explanation: '"millions of tonnes of plastic waste flow into the world’s oceans."' },
      { id: 2, question: 'What are microplastics?', choices: ['Large plastic bottles', 'Tiny fragments under five millimetres', 'A type of fish', 'Recycled bags'], correctIndex: 1, explanation: '"tiny fragments less than five millimetres across."' },
      { id: 3, question: 'Why are microplastics a concern for humans?', choices: ['They cause storms', 'They can travel up the food chain', 'They block rivers', 'They are expensive'], correctIndex: 1, explanation: '"can travel up the food chain to humans."' },
      { id: 4, question: 'What do researchers say about recycling?', choices: ['It solves the problem completely', 'It cannot keep pace with production', 'It is useless', 'It causes pollution'], correctIndex: 1, explanation: '"it cannot keep pace with production."' },
      { id: 5, question: 'What solution do researchers consider most effective?', choices: ['More recycling plants', 'Reducing single-use plastic production', 'Cleaning beaches', 'Banning fishing'], correctIndex: 1, explanation: '"reduce the manufacture of single-use plastics in the first place."' },
    ],
  },

  // ===========================================================================
  // C1 — complex argument, nuance, abstraction
  // ===========================================================================
  {
    id: 1017,
    level: 'C1',
    topic: 'Psychology',
    title: 'The Paradox of Choice',
    text:
      'Conventional economic thinking assumes that more options always benefit the consumer. Yet a body of psychological research suggests that an abundance of choice can be counter-productive. When confronted with dozens of broadly similar products, shoppers often experience a kind of paralysis: rather than feeling liberated, they become anxious about making the wrong decision and, in some cases, buy nothing at all. Even after a purchase, the awareness of so many rejected alternatives can breed dissatisfaction. This does not imply that choice is undesirable, but it does indicate that there is an optimal range beyond which additional options yield diminishing, and eventually negative, returns.',
    questions: [
      { id: 1, question: 'What does conventional economic thinking assume about choice?', choices: ['Less choice is better', 'More options always benefit consumers', 'Choice is irrelevant', 'Choice causes anxiety'], correctIndex: 1, explanation: '"more options always benefit the consumer."' },
      { id: 2, question: 'What happens when shoppers face many similar products?', choices: ['They feel liberated', 'They may experience paralysis', 'They buy more', 'They become experts'], correctIndex: 1, explanation: '"shoppers often experience a kind of paralysis."' },
      { id: 3, question: 'Why might satisfaction fall even after a purchase?', choices: ['The product breaks', 'Awareness of rejected alternatives breeds dissatisfaction', 'Prices rise', 'They forget what they bought'], correctIndex: 1, explanation: '"the awareness of so many rejected alternatives can breed dissatisfaction."' },
      { id: 4, question: 'As used in the text, “diminishing returns” most nearly means:', choices: ['increasing benefits', 'benefits that shrink as more is added', 'sudden profits', 'fixed outcomes'], correctIndex: 1, explanation: 'Diminishing returns = each extra option adds less value.' },
      { id: 5, question: 'Which statement best captures the writer’s conclusion?', choices: ['Choice should be eliminated', 'There is an optimal range of choice', 'More choice is always worse', 'Consumers never benefit from choice'], correctIndex: 1, explanation: '"there is an optimal range beyond which additional options yield ... negative returns."' },
    ],
  },
  {
    id: 1018,
    level: 'C1',
    topic: 'Energy',
    title: 'The Transition to Renewable Energy',
    text:
      'The global shift from fossil fuels to renewable sources is frequently presented as a straightforward technological upgrade. In reality, the transition raises complex questions of timing and equity. Solar and wind power have become dramatically cheaper, yet their output is intermittent, depending on weather and time of day. Without large-scale storage or flexible grids, countries cannot rely on them alone. Moreover, the burden of transition is unevenly distributed: communities that have depended on coal mining for generations may face unemployment, while the mineral demands of new technologies create environmental pressures elsewhere. A just transition, advocates argue, must address these social costs rather than treat them as unfortunate side effects.',
    questions: [
      { id: 1, question: 'How is the energy transition often presented?', choices: ['As impossible', 'As a straightforward technological upgrade', 'As unnecessary', 'As complete'], correctIndex: 1, explanation: '"frequently presented as a straightforward technological upgrade."' },
      { id: 2, question: 'What problem with solar and wind is noted?', choices: ['They are too expensive', 'Their output is intermittent', 'They harm the climate', 'They are illegal'], correctIndex: 1, explanation: '"their output is intermittent, depending on weather and time of day."' },
      { id: 3, question: 'What is needed to rely on renewables, according to the text?', choices: ['Cheaper oil', 'Large-scale storage or flexible grids', 'Fewer regulations', 'More coal'], correctIndex: 1, explanation: '"Without large-scale storage or flexible grids, countries cannot rely on them alone."' },
      { id: 4, question: 'Why is the transition described as uneven?', choices: ['Some regions get more sun', 'Coal communities may face unemployment', 'Renewables are banned somewhere', 'Prices vary by country'], correctIndex: 1, explanation: '"communities that have depended on coal mining ... may face unemployment."' },
      { id: 5, question: 'What does a “just transition” require?', choices: ['Ignoring social costs', 'Addressing social costs directly', 'Faster technology only', 'Lower energy prices'], correctIndex: 1, explanation: '"must address these social costs rather than treat them as unfortunate side effects."' },
    ],
  },
  {
    id: 1019,
    level: 'C1',
    topic: 'Society',
    title: 'The Bystander Effect',
    text:
      'In 1964, the murder of a woman in New York, reportedly witnessed by numerous neighbours who failed to intervene, prompted psychologists to investigate why people sometimes fail to help in emergencies. Their experiments revealed a counter-intuitive pattern now known as the bystander effect: the more people who are present, the less likely any individual is to offer assistance. Two mechanisms appear to be at work. First, responsibility is diffused — each witness assumes someone else will act. Second, individuals look to others for cues, and if no one reacts, they interpret the situation as less serious than it is. Understanding these mechanisms is the first step towards overcoming them.',
    questions: [
      { id: 1, question: 'What did the 1964 case prompt psychologists to study?', choices: ['Why crime rates rise', 'Why people fail to help in emergencies', 'How cities grow', 'How witnesses lie'], correctIndex: 1, explanation: '"to investigate why people sometimes fail to help in emergencies."' },
      { id: 2, question: 'What does the bystander effect state?', choices: ['Crowds always help', 'More people present means less likely to help', 'People help strangers easily', 'Help depends on age'], correctIndex: 1, explanation: '"the more people who are present, the less likely any individual is to offer assistance."' },
      { id: 3, question: 'What is meant by “responsibility is diffused”?', choices: ['No one is responsible by law', 'Each witness assumes someone else will act', 'Police take over', 'Everyone helps at once'], correctIndex: 1, explanation: '"each witness assumes someone else will act."' },
      { id: 4, question: 'Why might witnesses underestimate an emergency?', choices: ['They are far away', 'They see no one else reacting', 'They are distracted', 'They do not care'], correctIndex: 1, explanation: '"if no one reacts, they interpret the situation as less serious."' },
      { id: 5, question: 'Why does the writer say understanding the mechanisms matters?', choices: ['To excuse inaction', 'It is the first step to overcoming them', 'To blame witnesses', 'To increase crowds'], correctIndex: 1, explanation: '"the first step towards overcoming them."' },
    ],
  },
  {
    id: 1020,
    level: 'C1',
    topic: 'Language',
    title: 'Does Language Shape Thought?',
    text:
      'The idea that the language we speak influences the way we think has fascinated and divided scholars for decades. Its strongest version, which holds that language determines the limits of thought, has largely been discredited; speakers can clearly conceive of ideas for which their language has no single word. A weaker version, however, retains considerable support. Experiments suggest that the categories a language emphasises — for instance, how it divides the colour spectrum or marks the passage of time — can subtly affect perception and memory. The consensus today is not that language imprisons thought, but that it nudges it along certain well-worn paths.',
    questions: [
      { id: 1, question: 'What is the “strongest version” of the idea?', choices: ['Language has no effect', 'Language determines the limits of thought', 'Thought shapes language', 'All languages are identical'], correctIndex: 1, explanation: '"language determines the limits of thought."' },
      { id: 2, question: 'Why has the strongest version largely been discredited?', choices: ['It is too popular', 'Speakers can conceive ideas their language lacks words for', 'No one studied it', 'It is illegal'], correctIndex: 1, explanation: '"speakers can clearly conceive of ideas for which their language has no single word."' },
      { id: 3, question: 'What does the weaker version claim?', choices: ['Language controls thought entirely', 'Language can subtly affect perception and memory', 'Language is meaningless', 'Thought is impossible without speech'], correctIndex: 1, explanation: '"can subtly affect perception and memory."' },
      { id: 4, question: 'Which example of a language category is given?', choices: ['Spelling rules', 'How it divides the colour spectrum', 'Number of letters', 'Volume of speech'], correctIndex: 1, explanation: '"how it divides the colour spectrum or marks the passage of time."' },
      { id: 5, question: 'What is today’s consensus, according to the text?', choices: ['Language imprisons thought', 'Language nudges thought along certain paths', 'Language has no role', 'Thought has no role'], correctIndex: 1, explanation: '"it nudges it along certain well-worn paths."' },
    ],
  },

  // ===========================================================================
  // C2 — dense, sophisticated, highly abstract
  // ===========================================================================
  {
    id: 1021,
    level: 'C2',
    topic: 'Science',
    title: 'The Replication Crisis',
    text:
      'Over the past decade, several scientific disciplines have been unsettled by what is termed the “replication crisis”: the discovery that a substantial proportion of published findings cannot be reproduced when the original experiments are repeated. The causes are manifold. Researchers, under pressure to publish novel and statistically significant results, may unconsciously analyse their data in ways that favour a positive outcome — a practice sometimes called “p-hacking”. Journals, for their part, have historically been reluctant to publish negative results, distorting the scientific record. Far from signalling the failure of science, however, the crisis arguably demonstrates its self-correcting character: the very methods that exposed the problem are now being marshalled to remedy it, through pre-registration of studies and a renewed emphasis on transparency.',
    questions: [
      { id: 1, question: 'What is the “replication crisis”?', choices: ['Too many experiments', 'Many findings cannot be reproduced', 'A shortage of scientists', 'Fraud in all studies'], correctIndex: 1, explanation: '"a substantial proportion of published findings cannot be reproduced."' },
      { id: 2, question: 'What is “p-hacking”?', choices: ['Stealing data', 'Analysing data to favour a positive outcome', 'Hacking computers', 'Repeating experiments'], correctIndex: 1, explanation: '"analyse their data in ways that favour a positive outcome."' },
      { id: 3, question: 'How have journals contributed to the problem?', choices: ['By publishing too much', 'By being reluctant to publish negative results', 'By rejecting all studies', 'By paying researchers'], correctIndex: 1, explanation: '"reluctant to publish negative results, distorting the scientific record."' },
      { id: 4, question: 'What is the writer’s overall interpretation of the crisis?', choices: ['It proves science has failed', 'It demonstrates science’s self-correcting character', 'It is exaggerated', 'It is unimportant'], correctIndex: 1, explanation: '"the crisis arguably demonstrates its self-correcting character."' },
      { id: 5, question: 'Which remedy is mentioned?', choices: ['Banning experiments', 'Pre-registration of studies', 'Fewer scientists', 'Secret data'], correctIndex: 1, explanation: '"through pre-registration of studies and a renewed emphasis on transparency."' },
    ],
  },
  {
    id: 1022,
    level: 'C2',
    topic: 'Economics',
    title: 'The Limits of Rational Self-Interest',
    text:
      'Classical economics rests on the figure of homo economicus, a perfectly rational agent who weighs costs and benefits to maximise personal utility. Behavioural research has steadily eroded the plausibility of this caricature. People reliably exhibit systematic biases: they overvalue immediate rewards relative to future ones, judge probabilities poorly, and are influenced by how choices are framed rather than by their substance alone. Crucially, these deviations are not random noise that cancels out in aggregate; they are predictable and therefore exploitable, whether by marketers nudging consumers towards a purchase or by policymakers designing schemes that gently steer citizens towards more prudent behaviour. The implication is profound: if irrationality is structured, it can be engineered, for good or ill.',
    questions: [
      { id: 1, question: 'What is “homo economicus”?', choices: ['A modern consumer', 'A perfectly rational economic agent', 'A type of bias', 'A marketing tool'], correctIndex: 1, explanation: '"a perfectly rational agent who weighs costs and benefits to maximise personal utility."' },
      { id: 2, question: 'What has behavioural research shown?', choices: ['People are perfectly rational', 'People exhibit systematic biases', 'Economics is useless', 'Markets are fair'], correctIndex: 1, explanation: '"People reliably exhibit systematic biases."' },
      { id: 3, question: 'Which bias is mentioned?', choices: ['Overvaluing immediate rewards', 'Perfect probability judgement', 'Ignoring all rewards', 'Disliking choice'], correctIndex: 0, explanation: '"they overvalue immediate rewards relative to future ones."' },
      { id: 4, question: 'Why does the writer say biases are significant?', choices: ['They are random', 'They are predictable and therefore exploitable', 'They disappear in groups', 'They affect no one'], correctIndex: 1, explanation: '"predictable and therefore exploitable."' },
      { id: 5, question: 'What is the “profound implication”?', choices: ['Irrationality is structured and can be engineered', 'People are unpredictable', 'Economics should be abandoned', 'Marketing never works'], correctIndex: 0, explanation: '"if irrationality is structured, it can be engineered, for good or ill."' },
    ],
  },
  {
    id: 1023,
    level: 'C2',
    topic: 'Technology',
    title: 'The Alignment Problem',
    text:
      'As artificial intelligence grows more capable, a deceptively simple question acquires urgency: how do we ensure that such systems pursue the goals we actually intend? This is the so-called alignment problem. The difficulty is not that machines will spontaneously become malevolent, a notion borrowed more from fiction than from engineering, but that a system optimising relentlessly for a poorly specified objective may produce outcomes that are technically faithful to its instructions yet wildly at odds with our intentions. Specifying human values with the precision a machine requires turns out to be extraordinarily hard, not least because those values are often implicit, context-dependent and mutually inconsistent. The challenge, then, is less about controlling a rebellious intelligence than about articulating, with unprecedented exactness, what we want.',
    questions: [
      { id: 1, question: 'What is the “alignment problem”?', choices: ['Machines becoming evil', 'Ensuring AI systems pursue our intended goals', 'Building faster computers', 'Reducing AI costs'], correctIndex: 1, explanation: '"how do we ensure that such systems pursue the goals we actually intend?"' },
      { id: 2, question: 'What does the writer say about machine malevolence?', choices: ['It is the main danger', 'It is borrowed more from fiction than engineering', 'It is inevitable', 'It is already happening'], correctIndex: 1, explanation: '"a notion borrowed more from fiction than from engineering."' },
      { id: 3, question: 'What is the real risk described?', choices: ['Machines disobeying instructions', 'Faithfully following a poorly specified objective', 'Machines breaking down', 'Slow processing'], correctIndex: 1, explanation: '"technically faithful to its instructions yet wildly at odds with our intentions."' },
      { id: 4, question: 'Why is specifying human values hard?', choices: ['Values are simple', 'Values are implicit, context-dependent and inconsistent', 'Machines refuse them', 'No one has values'], correctIndex: 1, explanation: '"those values are often implicit, context-dependent and mutually inconsistent."' },
      { id: 5, question: 'How does the writer reframe the challenge?', choices: ['Controlling a rebellious intelligence', 'Articulating exactly what we want', 'Building cheaper AI', 'Banning AI research'], correctIndex: 1, explanation: '"less about controlling a rebellious intelligence than about articulating ... what we want."' },
    ],
  },
  {
    id: 1024,
    level: 'C2',
    topic: 'Biology',
    title: 'The Evolution of Cooperation',
    text:
      'Natural selection, with its emphasis on the survival of the fittest, might seem to predict a world of unrelenting competition. Yet cooperation is pervasive in nature, from cells that bind into organisms to animals that share food and warn one another of predators. Explaining this apparent paradox has been one of the triumphs of evolutionary theory. Cooperation can be favoured when it benefits genetic relatives, who carry copies of the same genes, or when individuals interact repeatedly, so that today’s generosity is reciprocated tomorrow. What looks like altruism at the level of the individual may thus be, at a deeper level, a sophisticated strategy for propagating one’s genes — a reconciliation that dissolves the paradox without diminishing the wonder of the behaviour it explains.',
    questions: [
      { id: 1, question: 'What might natural selection seem to predict?', choices: ['Total cooperation', 'A world of unrelenting competition', 'No survival', 'Random behaviour'], correctIndex: 1, explanation: '"might seem to predict a world of unrelenting competition."' },
      { id: 2, question: 'What is described as the “apparent paradox”?', choices: ['Competition exists', 'Cooperation is pervasive despite selection', 'Genes are selfish', 'Animals die young'], correctIndex: 1, explanation: 'Cooperation is widespread even though selection emphasises competition.' },
      { id: 3, question: 'When can cooperation be favoured, according to the text?', choices: ['Only among strangers', 'When it benefits genetic relatives', 'Never', 'Only in humans'], correctIndex: 1, explanation: '"when it benefits genetic relatives, who carry copies of the same genes."' },
      { id: 4, question: 'What role does repeated interaction play?', choices: ['It prevents cooperation', 'Today’s generosity may be reciprocated tomorrow', 'It causes conflict', 'It has no effect'], correctIndex: 1, explanation: '"individuals interact repeatedly, so that today’s generosity is reciprocated tomorrow."' },
      { id: 5, question: 'How does the writer reconcile altruism with selection?', choices: ['Altruism is an illusion only', 'Apparent altruism can be a strategy for propagating genes', 'Selection does not exist', 'Genes are irrelevant'], correctIndex: 1, explanation: '"a sophisticated strategy for propagating one’s genes."' },
    ],
  },
];
