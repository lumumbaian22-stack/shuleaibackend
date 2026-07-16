const COMMANDS = [
  { command: 'unsafe', keys: ['make an explosive', 'make a bomb', 'poison', 'weapon', 'gun', 'knife attack', 'self harm', 'kill myself', 'suicide', 'hack account', 'steal password', 'bypass payment'] },
  { command: 'cheating', keys: ['give me the answer to copy', 'write the whole assignment', 'do my homework for me', 'do my project for me', 'submit as my own', 'copy and paste', 'cheat'] },
  { command: 'project', keys: ['project', 'portfolio', 'poster', 'presentation', 'model', 'experiment', 'research project', 'school project', 'science fair'] },
  { command: 'research', keys: ['research', 'find information', 'sources', 'investigate', 'learn more about', 'deep research'] },
  { command: 'study_ahead', keys: ['study ahead', 'learn ahead', 'advanced version', 'harder version', 'teach me more advanced', 'secondary school level', 'form 1', 'form one', 'university level', 'deeper explanation'] },
  { command: 'complex_math', keys: ['quadratic', 'differentiate', 'integrate', 'simultaneous equation', 'trigonometry', 'logarithm', 'surds', 'indices', 'factorize', 'factorise', 'solve for x', 'prove that'] },
  { command: 'quiz', keys: ['quiz me', 'test me', 'ask me', 'practice questions', 'give me questions', 'mcq'] },
  { command: 'explain', keys: ['explain', 'teach me', 'help me understand', 'what is', 'define', 'meaning'] },
  { command: 'solve', keys: ['solve', 'calculate', 'work out', 'answer this', 'find the answer'] },
  { command: 'summarize', keys: ['summarize', 'summary', 'short notes', 'notes on', 'key points'] },
  { command: 'revise', keys: ['revise', 'revision', 'prepare for exam', 'exam prep', 'kcse', 'kcpe', 'assessment'] },
  { command: 'homework', keys: ['homework', 'assignment', 'take away task', 'give homework'] },
  { command: 'weakness', keys: ['weak areas', 'weakness', 'what am i bad at', 'progress', 'performance'] },
  { command: 'plan', keys: ['study plan', 'timetable', 'schedule', 'plan my revision'] }
];

function detectCommand(text = '') {
  const lower = String(text || '').toLowerCase();
  const found = COMMANDS.find(c => c.keys.some(k => lower.includes(k)));
  return found ? found.command : 'ask';
}

function isUnsafeLearningRequest(text = '') {
  return detectCommand(text) === 'unsafe';
}

function isCheatingRequest(text = '') {
  return detectCommand(text) === 'cheating';
}

module.exports = { detectCommand, COMMANDS, isUnsafeLearningRequest, isCheatingRequest };
