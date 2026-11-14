// Cleans up roughly typed follow-up notes with Gemini.
// Never throws: if the key is missing or the API fails, the original note is returned.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function cleanFollowUpNote(rawNote) {
  const raw = String(rawNote || '').trim();
  if (!raw) return null;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return raw;

  const prompt =
    'Rewrite this sales follow-up note as ONE short, clear, grammatically correct sentence in past or ' +
    'imperative style, fixing typos and keeping every fact (times, channels, names). Do not add anything new. ' +
    'Return only the sentence, no quotes.\n\nNote: ' + raw;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 120 },
        }),
      }
    );
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const cleaned = String(text || '').replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 300);
    return cleaned || raw;
  } catch (error) {
    console.error('Gemini note cleanup failed:', error.message);
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { cleanFollowUpNote };
