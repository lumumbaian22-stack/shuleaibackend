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

function buildStudentTutorSystemPrompt(studentContext = {}) {
  const grade = studentContext.grade || studentContext.gradeLevel || 'the learner\'s registered class';
  const curriculum = studentContext.curriculum || 'the school curriculum';
  return [
    'You are ShuleAI Learning Assistant for school learners.',
    `Start from the learner context: class/grade ${grade}, curriculum ${curriculum}, subjects and recent learning data supplied in the user payload. Do not ask the learner what class they are in unless the backend context says it is missing.`,
    'Be a clear, patient, accurate tutor. Do not give one-line or incomplete answers for learning questions.',
    'For complex questions, especially mathematics and science, use this structure when useful: Topic, What the question is asking, Method/formula, Step-by-step solution, Final answer, Check/verification, Practice question.',
    'If a process is needed, show the complete process. Do not skip important steps. Explain why each step is done in simple student-friendly language.',
    'Students may study ahead or research beyond their current class. Allow safe advanced learning. Say that it is above their current level, then explain using a ladder: simple idea, current-level explanation, advanced explanation, practice/research extension.',
    'Help with school projects by guiding: topic, aim, research questions, materials, method, findings, conclusion, recommendation, presentation, and checklist. Do not write a full project for copying/submission.',
    'If the learner asks to cheat, copy, or submit work as their own, refuse gently and guide them to understand, attempt, and write in their own words.',
    'Do not provide dangerous experiments, weapon/explosive instructions, self-harm guidance, cyber abuse, drug-abuse instructions, sexual content involving minors, financial manipulation, or private-data requests. Redirect to a safe educational alternative.',
    'Do not ask for passwords, phone numbers, home addresses, payment details, or private family information.',
    'Use CBC/CBE language such as EE, ME, AE, BE when the context is CBC/CBE. Use the correct grading language for 8-4-4, British, or American contexts when provided.',
    'Keep the tone friendly and encouraging. End with a helpful next step or practice question when useful.'
  ].join('\n');
}

function buildAlertSuggestionSystemPrompt() {
  return [
    'You are Shule AI, an assistant that helps school admins write clear announcements and parent alerts.',
    'Write concise, respectful, professional messages suitable for parents, teachers, students, or the whole school in Kenya.',
    'Do not include threats, shame, sensitive student details, or private financial details beyond the user provided summary.',
    'Return JSON only with key options. options must be an array of 2 or 3 objects.',
    'Each option must have: title, platformMessage, smsMessage, tone. SMS message must be under 155 characters.',
    'Also include a short reason field. Do not send automatically; admin reviews first.'
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
    learningContext: studentContext || {},
    answerQualityRules: {
      completeStepsRequired: true,
      doNotAskClassUnlessMissing: true,
      studyAheadAllowedWhenSafe: true,
      projectsAreGuidedNotCopied: true,
      humanTeacherStillFinalAuthority: true
    }
  };

  if (cfg.provider === 'anthropic' || cfg.provider === 'claude') {
    return callAnthropicTutor({ question, subject, grade, curriculum, command, topic, studentContext });
  }

  return callDeepSeekChat({
    messages: [
      { role: 'system', content: buildStudentTutorSystemPrompt({ ...(studentContext || {}), grade, curriculum }) },
      { role: 'user', content: JSON.stringify(payload, null, 2) }
    ],
    maxTokens: 1800,
    temperature: 0.25
  });
}


function conciseSms(text) { return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 155); }
function titleCaseTopic(topic) {
  return String(topic || 'School announcement').replace(/_/g, ' ').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
function localAnnouncementOptions({ audience, topic, description, schoolName }) {
  const audienceText = String(audience || 'parents').replace(/_/g, ' ');
  const topicTitle = titleCaseTopic(topic || 'Announcement');
  const brief = String(description || '').trim().replace(/\s+/g, ' ');
  const school = schoolName || 'the school';
  return [
    {
      title: `${topicTitle} Notice`,
      tone: 'Professional',
      platformMessage: `Dear ${audienceText}, ${school} kindly requests your attention regarding ${topicTitle.toLowerCase()}. ${brief}. Thank you for your cooperation and continued support.`,
      smsMessage: conciseSms(`${topicTitle}: ${brief}. Thank you.`)
    },
    {
      title: `Kind Reminder: ${topicTitle}`,
      tone: 'Friendly',
      platformMessage: `Hello ${audienceText}, this is a kind reminder from ${school}: ${brief}. We appreciate your support and partnership.`,
      smsMessage: conciseSms(`Kind reminder: ${brief}. Thank you for your support.`)
    },
    {
      title: `Important ${topicTitle}`,
      tone: 'Short / Direct',
      platformMessage: `Important update: ${brief}. Please take the necessary action as soon as possible.`,
      smsMessage: conciseSms(`Important: ${brief}`)
    }
  ];
}
function dedupeAnnouncementOptions(options, fallbackContext) {
  const fallback = localAnnouncementOptions(fallbackContext);
  const seen = new Set();
  const cleaned = [];
  for (const raw of [...(Array.isArray(options) ? options : []), ...fallback]) {
    const title = String(raw.title || '').trim() || fallback[cleaned.length % fallback.length].title;
    const platformMessage = String(raw.platformMessage || raw.message || '').trim() || fallback[cleaned.length % fallback.length].platformMessage;
    const smsMessage = conciseSms(raw.smsMessage || raw.sms || platformMessage || fallback[cleaned.length % fallback.length].smsMessage);
    const tone = String(raw.tone || fallback[cleaned.length % fallback.length].tone || '').trim();
    const signature = platformMessage.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);
    if (seen.has(signature)) continue;
    seen.add(signature);
    cleaned.push({ title, platformMessage, smsMessage, tone });
    if (cleaned.length === 3) break;
  }
  return cleaned;
}

async function generateParentAlertSuggestion({ audience, topic, tone, description, schoolName, extraContext }) {
  const userPrompt = {
    audience: audience || 'parents',
    topic: topic || 'General announcement',
    tone: tone || 'Professional',
    schoolName: schoolName || 'the school',
    briefDescription: description || '',
    extraContext: extraContext || {},
    instructions: 'Generate 2 or 3 ready-to-use announcement options. Each option must include a title, a detailed platform alert version, and a short SMS version. AI only drafts; the admin must review and press Send.'
  };
  let result;
  try {
    result = await callDeepSeekChat({
      messages: [
        { role: 'system', content: buildAlertSuggestionSystemPrompt() },
        { role: 'user', content: JSON.stringify(userPrompt, null, 2) }
      ],
      maxTokens: 650,
      temperature: 0.35,
      responseFormat: { type: 'json_object' }
    });
  } catch (error) {
    const options = dedupeAnnouncementOptions([], { audience, topic, description, schoolName });
    return {
      title: options[0]?.title || `${topic || 'School'} Notice`,
      message: options[0]?.platformMessage || '',
      options,
      reason: 'Smart local templates generated because the AI provider is unavailable. Admin must review before sending.',
      provider: 'local_template',
      model: 'system_rules',
      usage: null,
      localFallback: true
    };
  }
  let parsed;
  try { parsed = JSON.parse(result.text); } catch (_) { parsed = null; }
  if (!parsed) parsed = { options: [] };
  let options = Array.isArray(parsed.options) ? parsed.options : [];
  if (!options.length && (parsed.title || parsed.message)) {
    options = [{ title: parsed.title || `${topic || 'School'} Notice`, platformMessage: parsed.platformMessage || parsed.message || result.text, smsMessage: parsed.smsMessage || String(parsed.message || result.text).slice(0,155), tone: parsed.tone || tone || 'Professional' }];
  }
  if (!options.length && Array.isArray(parsed.alternatives)) {
    options = parsed.alternatives.map((x, i) => ({ title: x.title || `${topic || 'School'} Option ${i+1}`, platformMessage: x.platformMessage || x.message || String(x), smsMessage: (x.smsMessage || x.message || String(x)).slice(0,155), tone: x.tone || tone || 'Professional' }));
  }
  options = dedupeAnnouncementOptions(options, { audience, topic, description, schoolName });
  return {
    title: options[0]?.title || `${topic || 'School'} Notice`,
    message: options[0]?.platformMessage || '',
    options,
    reason: parsed.reason || 'Generated by Shule AI from the admin brief. Admin must review before sending.',
    provider: result.provider,
    model: result.model,
    usage: result.usage
  };
}

module.exports = {
  getAIProviderConfig,
  callDeepSeekChat,
  callStudentTutorAI,
  generateParentAlertSuggestion
};
