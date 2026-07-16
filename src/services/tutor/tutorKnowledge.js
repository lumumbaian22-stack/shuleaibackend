const TOPIC_KEYWORDS = [
  { topic: 'Multiplication', keys: ['multiply', 'multiplication', 'times', ' x ', '×'] },
  { topic: 'Fractions', keys: ['fraction', 'numerator', 'denominator', 'half', 'quarter'] },
  { topic: 'Algebra', keys: ['algebra', 'equation', 'solve for x', 'variable'] },
  { topic: 'Quadratic Equations', keys: ['quadratic', 'x²', 'x^2', 'factorize', 'factorise'] },
  { topic: 'Geometry', keys: ['angle', 'triangle', 'circle', 'area', 'perimeter', 'volume'] },
  { topic: 'Grammar', keys: ['noun', 'verb', 'adjective', 'sentence', 'grammar'] },
  { topic: 'Reading Comprehension', keys: ['comprehension', 'passage', 'read'] },
  { topic: 'Matter', keys: ['matter', 'solid', 'liquid', 'gas'] },
  { topic: 'Forces', keys: ['force', 'motion', 'gravity', 'friction'] },
  { topic: 'Cells', keys: ['cell', 'organism', 'biology'] },
  { topic: 'School Project', keys: ['project', 'poster', 'portfolio', 'presentation', 'model', 'research'] },
  { topic: 'General', keys: [] }
];

function detectTopic(text = '', subject = '') {
  const lower = String(text || '').toLowerCase();
  const match = TOPIC_KEYWORDS.find(t => t.keys.some(k => lower.includes(k)));
  if (match) return match.topic;
  if (/math/i.test(subject)) return 'General Mathematics';
  if (/english|kiswahili|literacy/i.test(subject)) return 'Language Skills';
  if (/science|biology|chemistry|physics/i.test(subject)) return 'Science Concepts';
  return 'General';
}

function safeQuestion(question) {
  return String(question || '').trim();
}

function buildProjectGuide({ question, subject, grade, curriculum }) {
  const q = safeQuestion(question);
  return `Topic: School project help\nWhat the question is asking:\nYou want help planning or improving a school project. I will guide you step by step so you understand it and can present it in your own words.\n\nProject plan:\n1. Title: Write a clear title based on your topic.\n2. Aim: Explain what your project wants to find out or show.\n3. Research questions: Write 2–4 questions your project should answer.\n4. Materials: List the items you need.\n5. Method/steps: Explain what you will do, one step at a time.\n6. Findings: Record what you observed or learned.\n7. Conclusion: Explain the main lesson from the project.\n8. Recommendation: Say what people should do next.\n9. Presentation: Prepare 4–6 points you can explain to the class.\n\nSafety note:\nIf the project uses heat, electricity, chemicals, sharp objects, outdoor risks, or online accounts, do it only with a teacher or parent supervising.\n\nYour next step:\nTell me the project topic, subject, deadline, and whether it should be a report, poster, model, experiment, presentation, or portfolio.`;
}

function buildMathGuide({ question, topic, grade }) {
  const q = safeQuestion(question);
  return `Topic: ${topic || 'Mathematics'}\nWhat the question is asking:\n${q || 'You are asking for help with a maths question.'}\n\nMethod:\n1. Read the question carefully.\n2. Identify the topic and the formula or rule needed.\n3. Write the given values.\n4. Substitute the values into the formula or method.\n5. Work one line at a time without skipping steps.\n6. Write the final answer clearly with units if needed.\n7. Check whether the answer makes sense.\n\nStep-by-step solution:\nSend the exact full maths question, including all numbers and signs, and I will solve it completely line by line.\n\nPractice question:\nTry writing the first step: what topic is the question testing?`;
}

function buildStudyAheadGuide({ question, subject, grade, curriculum }) {
  const q = safeQuestion(question);
  return `Topic: Studying ahead\nWhat the question is asking:\nYou want to learn something that may be above your current class level. That is allowed when it is safe and educational.\n\nHow we will learn it:\nLevel 1: Simple explanation in easy words.\nLevel 2: Your current ${grade || 'class'} / ${curriculum || 'school'} level.\nLevel 3: Advanced explanation.\nLevel 4: Practice or research extension.\n\nImportant note:\nIf the topic is advanced, I will not block you. I will start from the basics and build up slowly so you do not get confused.\n\nYour question:\n${q || `Tell me what advanced part of ${subject || 'this subject'} you want to learn.`}`;
}

function buildUnsafeRedirect() {
  return `I cannot help with unsafe, harmful, private, or illegal instructions.\n\nI can still help you learn safely. Choose one safe option:\n1. A safe science project.\n2. A school-friendly explanation of the topic.\n3. A harmless experiment with teacher or parent supervision.\n4. A research outline that does not include dangerous steps.\n\nTell me which safe option you want.`;
}

function buildCheatingRedirect() {
  return `I can help you understand and improve your work, but I should not give you a complete answer to copy and submit as your own.\n\nSend the question or your draft, and I will:\n1. explain the idea,\n2. guide you step by step,\n3. check your attempt,\n4. help you write it in your own words.`;
}

function buildTutorAnswer({ question, command, subject, topic, grade, level, curriculum }) {
  const q = safeQuestion(question);
  const base = { topic, difficulty: level?.id === 'senior_school' ? 'exam' : 'medium', source: 'guided_curriculum_engine' };
  if (command === 'unsafe') return { ...base, answer: 'Let us keep this safe.', explanation: buildUnsafeRedirect(), nextQuestion: 'Would you like a safe project idea instead?' };
  if (command === 'cheating') return { ...base, answer: 'I can guide you, not help you copy.', explanation: buildCheatingRedirect(), nextQuestion: 'Send your attempt or the question and I will guide you.' };
  if (command === 'project' || command === 'research') return { ...base, answer: `Project guide for ${subject || 'school work'}`, explanation: buildProjectGuide({ question, subject, grade, curriculum }), nextQuestion: 'What is your project topic and required format?' };
  if (command === 'study_ahead') return { ...base, answer: 'You can study ahead safely.', explanation: buildStudyAheadGuide({ question, subject, grade, curriculum }), nextQuestion: 'Do you want the simple version or the advanced version first?' };
  if (command === 'quiz') return { ...base, answer: `Great — quiz mode for ${subject}.`, explanation: `Topic: ${topic}\nQuestion 1: Explain one important idea about ${topic} in your own words.\nQuestion 2: Give one example from real life.\nQuestion 3: Write one question you still have about it.`, nextQuestion: `Answer Question 1 first, and I will check it.` };
  if (command === 'summarize') return { ...base, answer: `${topic} summary for ${grade}`, explanation: `Topic: ${topic}\nKey points:\n1. Understand the meaning.\n2. Know the key rule or process.\n3. See one example.\n4. Practice one short question.\n5. Explain it back in your own words.`, nextQuestion: `Do you want short notes, examples, or practice questions on ${topic}?` };
  if (command === 'revise') return { ...base, answer: `Revision mode started for ${subject}.`, explanation: `We will revise ${topic} using:\n1. quick notes,\n2. a worked example,\n3. practice questions,\n4. correction of mistakes,\n5. a final checklist.\n\nStart by telling me the part that confuses you most.`, nextQuestion: `Should I start with notes, examples, or questions?` };
  if (command === 'homework') return { ...base, answer: `Homework help for ${subject}`, explanation: `I will not just give you work to copy.\n\nWe will do it this way:\n1. Send the exact question.\n2. I explain what it is asking.\n3. I show the method.\n4. You try one step.\n5. I check and help you improve.`, nextQuestion: `Send the full homework question.` };
  if (command === 'weakness') return { ...base, answer: `I can help with weak areas.`, explanation: `I will use your recent marks, tutor questions, and practice attempts where available.\n\nFor now, choose one subject and I will help you identify:\n1. topics you struggle with,\n2. mistakes you repeat,\n3. practice steps to improve,\n4. when to ask your teacher for help.`, nextQuestion: `Which subject should I check first?` };
  if (command === 'plan') return { ...base, answer: `Study plan for ${subject}`, explanation: `A good study plan:\n1. Start with your weakest topic.\n2. Study for 25 minutes.\n3. Take a 5-minute break.\n4. Do examples.\n5. Try practice questions.\n6. Write what you learned.\n7. Ask for help if you still do not understand.`, nextQuestion: `How many days should the plan cover?` };
  if (command === 'solve' || command === 'complex_math') return { ...base, answer: `Let's solve it completely.`, explanation: buildMathGuide({ question, topic, grade }), nextQuestion: `Send the exact full question if anything is missing.` };
  return { ...base, answer: `I can help with ${subject}.`, explanation: `${q ? `Your question is: “${q}”.\n\n` : ''}Topic: ${topic}\nWhat we will do:\n1. Explain the idea in simple words.\n2. Give examples.\n3. Show steps if there is a process.\n4. Check understanding with a short question.\n\nAsk your question in detail, or tell me whether you want a simple, exam-style, or advanced explanation.`, nextQuestion: `Would you like a simple explanation, examples, or a practice question?` };
}

module.exports = { detectTopic, buildTutorAnswer };
