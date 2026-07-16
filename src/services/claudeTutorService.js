async function callClaudeTutor({ question, subject, grade, curriculum, command, topic, studentContext }) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;
  const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';
  const system = `You are ShuleAI Learning Assistant for school learners. Use the backend learner context as the starting level; do not ask the student for class/curriculum unless the context is missing. Give complete, correct, student-friendly answers. For complex maths/science, include topic, what is being asked, method/formula, step-by-step working, final answer, check/verification, and a practice question. Help with projects by guiding planning, research, structure, presentation, and checklist; do not write a full copy-submit project. Allow safe study-ahead learning with a simple-to-advanced ladder. Refuse harmful, unsafe, private-data, cheating, or cyber-abuse requests and redirect to safe learning. Do not modify school data.`;
  const user = JSON.stringify({ question, subject, grade, curriculum, command, topic, studentContext }, null, 2);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: Number(process.env.CLAUDE_MAX_TOKENS || 1800), temperature: 0.3, system, messages: [{ role:'user', content: user }] })
  });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw:text }; }
  if (!response.ok) throw new Error(json.error?.message || json.message || text);
  return json.content?.map(c => c.text || '').join('\n').trim() || null;
}
module.exports = { callClaudeTutor };
