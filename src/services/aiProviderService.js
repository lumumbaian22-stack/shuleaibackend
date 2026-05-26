const DEFAULT_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

function getAIProviderConfig() {
  const provider = String(process.env.AI_PROVIDER || 'deepseek').toLowerCase().trim();
  return {
    provider,
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
      baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
      maxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 900),
      temperature: Number(process.env.DEEPSEEK_TEMPERATURE || 0.35)
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
      model: process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
      maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 900),
      temperature: Number(process.env.CLAUDE_TEMPERATURE || 0.35)
    }
  };
}

function normalizeAIText(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

function buildStudentTutorSystemPrompt() {
  return [
    'You are Shule AI Tutor for Kenyan school learners.',
    'Give safe, age-appropriate, curriculum-aware help.',
    'Do not ask for private personal data, phone numbers, passwords, payment details, or home addresses.',
    'Do not change marks, fees, attendance, homework submissions, or school records.',
    'Explain step by step using simple language, then give a short practice question when useful.',
    'If the learner asks for direct cheating or harmful content, refuse gently and redirect to learning.'
  ].join(' ');
}

function buildAlertSuggestionSystemPrompt() {
  return [
    'You are Shule AI, an assistant that helps school admins write clear parent alerts.',
    'Write concise, respectful, professional messages suitable for parents in Kenya.',
    'Do not include threats, shame, sensitive student details, or private financial details beyond the user provided summary.',
    'Return JSON only with keys: title, message, tone, reason, alternatives.',
    'alternatives must be an array of 2 shorter alternative messages.'
  ].join(' ');
}

async function callDeepSeekChat({ messages, maxTokens, temperature, responseFormat }) {
  const config = getAIProviderConfig().deepseek;
  if (!config.apiKey) {
    const err = new Error('DeepSeek API key is not configured on the backend');
    err.status = 503;
    throw err;
  }
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: Number.isFinite(temperature) ? temperature : config.temperature,
      max_tokens: maxTokens || config.maxTokens,
      ...(responseFormat ? { response_format: responseFormat } : {})
    })
  });
  const bodyText = await response.text();
  let body;
  try { body = JSON.parse(bodyText); } catch (_) { body = { raw: bodyText }; }
  if (!response.ok) {
    const err = new Error(body?.error?.message || body?.message || bodyText || 'DeepSeek request failed');
    err.status = response.status;
    err.provider = 'deepseek';
    throw err;
  }
  const content = normalizeAIText(body?.choices?.[0]?.message?.content || '');
  return {
    text: content,
    provider: 'deepseek',
    model: body?.model || config.model,
    usage: body?.usage || {}
  };
}

async function callAnthropicTutor({ question, subject, grade, curriculum, command, topic, studentContext }) {
  const { callClaudeTutor } = require('./claudeTutorService');
  const text = await callClaudeTutor({ question, subject, grade, curriculum, command, topic, studentContext });
  return {
    text: normalizeAIText(text),
    provider: 'anthropic',
    model: getAIProviderConfig().anthropic.model,
    usage: {}
  };
}

async function callStudentTutorAI({ question, subject, grade, curriculum, command, topic, studentContext }) {
  const cfg = getAIProviderConfig();
  const payload = {
    grade,
    curriculum,
    subject,
    topic,
    tutorMode: command || 'ask',
    learnerQuestion: question,
    learningContext: studentContext || {}
  };

  if (cfg.provider === 'anthropic' || cfg.provider === 'claude') {
    return callAnthropicTutor({ question, subject, grade, curriculum, command, topic, studentContext });
  }

  return callDeepSeekChat({
    messages: [
      { role: 'system', content: buildStudentTutorSystemPrompt() },
      { role: 'user', content: JSON.stringify(payload, null, 2) }
    ]
  });
}

async function generateParentAlertSuggestion({ audience, topic, tone, description, schoolName, extraContext }) {
  const userPrompt = {
    audience: audience || 'parents',
    topic: topic || 'General announcement',
    tone: tone || 'Professional',
    schoolName: schoolName || 'the school',
    briefDescription: description || '',
    extraContext: extraContext || {},
    instructions: 'Generate a parent-facing alert. Keep it specific, respectful, and easy to understand.'
  };
  const result = await callDeepSeekChat({
    messages: [
      { role: 'system', content: buildAlertSuggestionSystemPrompt() },
      { role: 'user', content: JSON.stringify(userPrompt, null, 2) }
    ],
    maxTokens: 500,
    temperature: 0.4,
    responseFormat: { type: 'json_object' }
  });
  let parsed;
  try { parsed = JSON.parse(result.text); } catch (_) { parsed = null; }
  if (!parsed) {
    parsed = {
      title: `${topic || 'School'} Notice`,
      message: result.text,
      tone: tone || 'Professional',
      reason: 'Generated by Shule AI from the admin brief.',
      alternatives: []
    };
  }
  return {
    ...parsed,
    provider: result.provider,
    model: result.model,
    usage: result.usage
  };
}

module.exports = {
  getAIProviderConfig,
  callStudentTutorAI,
  generateParentAlertSuggestion
};
