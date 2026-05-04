const SUBJECT_ALIASES = {
  Mathematics: ['math', 'maths', 'mathematics', 'algebra', 'geometry', 'numbers', 'fractions', 'equations', 'area', 'volume', 'statistics'],
  English: ['english', 'grammar', 'composition', 'essay', 'reading', 'writing', 'comprehension', 'poem', 'literature'],
  Kiswahili: ['kiswahili', 'swahili', 'insha', 'sarufi', 'ufahamu', 'fasihi', 'methali'],
  Science: ['science', 'biology', 'chemistry', 'physics', 'plants', 'animals', 'matter', 'energy', 'force', 'electricity', 'environment'],
  'Social Studies': ['social', 'history', 'geography', 'civics', 'county', 'map', 'culture', 'community'],
  CRE: ['cre', 'christian', 'bible', 'religious education', 'religion'],
  IRE: ['ire', 'islamic', 'quran', 'hadith', 'deen'],
  Agriculture: ['agriculture', 'farming', 'soil', 'crops', 'livestock'],
  'Business Studies': ['business', 'commerce', 'entrepreneurship', 'profit', 'market', 'money'],
  'Computer Studies': ['computer', 'ict', 'coding', 'programming', 'internet', 'software', 'hardware'],
  Art: ['art', 'drawing', 'craft', 'design', 'colour', 'painting'],
  Music: ['music', 'song', 'rhythm', 'melody', 'notes'],
  'Physical Education': ['pe', 'physical education', 'sports', 'fitness', 'game']
};

const CORE_LIBRARY = {
  Mathematics: {
    foundations: ['Place value', 'fractions', 'decimals', 'percentages', 'measurement', 'algebra patterns'],
    explain: 'Break the problem into known values, operation needed, working steps, and final check. Mathematics answers must show working because that reveals the exact misconception.',
    activities: ['Solve 3 similar examples from easy to hard', 'Explain the method aloud to a parent', 'Create one word problem using the same skill']
  },
  English: {
    foundations: ['Vocabulary', 'sentence structure', 'paragraphing', 'comprehension', 'creative writing', 'grammar'],
    explain: 'Read the prompt twice, identify the task word, collect evidence from the passage, then write in complete sentences with correct punctuation.',
    activities: ['Summarize a paragraph in 3 sentences', 'Correct five grammar errors', 'Write one improved paragraph with a clear topic sentence']
  },
  Kiswahili: {
    foundations: ['Msamiati', 'sarufi', 'ufahamu', 'insha', 'fasihi simulizi', 'methali na nahau'],
    explain: 'Tambua mada, chagua msamiati mwafaka, zingatia sarufi, kisha toa jibu kwa Kiswahili sanifu kulingana na kiwango cha mwanafunzi.',
    activities: ['Andika sentensi tano ukitumia msamiati mpya', 'Sahihisha makosa ya sarufi', 'Andika insha fupi yenye utangulizi, mwili na hitimisho']
  },
  Science: {
    foundations: ['Observation', 'classification', 'matter', 'energy', 'living things', 'human body', 'environment'],
    explain: 'Use evidence from observation, connect cause and effect, and finish with a real-life example from home or school.',
    activities: ['Make a simple observation table', 'Draw and label a process', 'Explain one safety rule connected to the topic']
  },
  'Social Studies': {
    foundations: ['Map skills', 'county governance', 'community roles', 'Kenyan history', 'resources', 'culture'],
    explain: 'Connect the idea to people, place, time, and responsibility. Good answers use examples from Kenya and the learner’s community.',
    activities: ['Draw a simple map or timeline', 'List causes and effects', 'Interview an adult about the topic and record three points']
  },
  CRE: { foundations: ['Bible stories', 'values', 'prayer', 'service', 'forgiveness'], explain: 'Connect the teaching to values and daily choices.', activities: ['Retell a story', 'Write one value and one action', 'Discuss a real-life example'] },
  IRE: { foundations: ['Quran', 'Hadith', 'Akhlaq', 'Ibadah', 'Seerah'], explain: 'Connect the teaching to faith, conduct, and daily responsibility.', activities: ['State a teaching', 'Give a daily-life example', 'Reflect on one action'] },
  Agriculture: { foundations: ['Soil', 'crops', 'livestock', 'tools', 'farm management'], explain: 'Link farming practice to productivity, safety, and care for the environment.', activities: ['Inspect a home plant', 'List tools and uses', 'Plan a small garden activity'] },
  'Business Studies': { foundations: ['Needs and wants', 'production', 'trade', 'money', 'profit and loss'], explain: 'Use real examples, simple calculations, and clear business terms.', activities: ['Compare cost and selling price', 'Design a small business idea', 'List risks and solutions'] },
  'Computer Studies': { foundations: ['Hardware', 'software', 'typing', 'internet safety', 'data', 'coding logic'], explain: 'Explain the digital concept, then give a safe practical use case.', activities: ['Name input/output devices', 'Write step-by-step instructions', 'Explain one online safety rule'] },
  Art: { foundations: ['Line', 'shape', 'colour', 'texture', 'pattern', 'composition'], explain: 'Observe carefully, choose materials, and explain the design choice.', activities: ['Sketch with three shapes', 'Create a pattern', 'Describe colour choices'] },
  Music: { foundations: ['Rhythm', 'melody', 'tempo', 'pitch', 'instruments'], explain: 'Listen, clap or sing the pattern, then describe the musical element.', activities: ['Clap a rhythm', 'Identify instruments', 'Create a short tune'] },
  'Physical Education': { foundations: ['Movement', 'balance', 'coordination', 'rules', 'teamwork', 'safety'], explain: 'Focus on safe movement, fair play, and health benefits.', activities: ['Warm up safely', 'Practise one skill', 'Reflect on teamwork'] }
};

function normalize(text='') { return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' '); }
function detectSubject(message='') {
  const t = normalize(message);
  let best = { subject: 'General Learning', score: 0, confidence: 0.35 };
  for (const [subject, aliases] of Object.entries(SUBJECT_ALIASES)) {
    let score = 0;
    for (const alias of aliases) {
      const phrase = normalize(alias);
      if (t.includes(phrase)) score += phrase.split(' ').length + 2;
    }
    if (score > best.score) best = { subject, score, confidence: Math.min(0.95, 0.45 + score / 12) };
  }
  return best;
}
function detectIntent(message='') {
  const t = normalize(message);
  if (/solve|calculate|answer|work out|find/.test(t)) return 'solve';
  if (/explain|teach|understand|meaning|what is|why/.test(t)) return 'explain';
  if (/quiz|test|practice|questions/.test(t)) return 'practice';
  if (/summarize|notes|revise|revision/.test(t)) return 'revision';
  return 'tutor_help';
}
function gradeBand(grade='') {
  const g = String(grade || '').toLowerCase();
  if (/pp|grade 1|grade 2|grade 3/.test(g)) return 'lower-primary';
  if (/grade 4|grade 5|grade 6/.test(g)) return 'upper-primary';
  if (/grade 7|grade 8|grade 9/.test(g)) return 'junior-secondary';
  if (/form|grade 10|grade 11|grade 12/.test(g)) return 'secondary';
  return 'general';
}
function buildTutorAnswer({ message, subject, intent, student, weakAreas=[] }) {
  const lib = CORE_LIBRARY[subject] || { foundations: Object.keys(CORE_LIBRARY), explain: 'I will identify the subject, break the question into smaller steps, and guide the learner to the answer.', activities: ['Restate the question', 'Try one worked example', 'Do one practice question'] };
  const band = gradeBand(student?.grade);
  const focus = weakAreas.length ? `I will especially watch these weaker areas: ${weakAreas.slice(0,3).join(', ')}.` : 'I will check understanding as we go.';
  const steps = intent === 'solve'
    ? ['Write what is given.', 'Choose the rule or method.', 'Work step by step.', 'Check whether the answer makes sense.']
    : intent === 'practice'
      ? ['Start with one easy question.', 'Increase difficulty gradually.', 'Review mistakes immediately.']
      : ['Define the idea simply.', 'Connect it to a familiar example.', 'Try a short activity.'];
  return {
    answer: `Subject detected: ${subject}. Level: ${band}. ${lib.explain} ${focus}\n\nFor your question: "${String(message).slice(0, 280)}"\n\nUse this path:\n${steps.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\nKey areas to revise: ${lib.foundations.slice(0,6).join(', ')}.`,
    practice: lib.activities,
    checkpoints: ['Can the learner explain the method without copying?', 'Can the learner solve a similar question?', 'Can the learner identify the mistake if the answer is wrong?']
  };
}
module.exports = { SUBJECT_ALIASES, CORE_LIBRARY, detectSubject, detectIntent, buildTutorAnswer, gradeBand };
