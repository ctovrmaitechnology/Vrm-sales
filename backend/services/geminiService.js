// Cleans up roughly typed follow-up notes with Gemini.
// Never throws: if the key is missing or the API fails, the original note is returned.
//
// Works with both key styles (new "AQ." keys and old "AIza" keys): the key is sent in the
// x-goog-api-key header to the normal Gemini API address.
//
// Model: GEMINI_MODEL from .env is tried first. If Google says a model does not exist for your
// account (404), the next one in the list is tried, and the one that works is remembered.
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
let workingModel = null;

function modelCandidates() {
  const list = [];
  if (workingModel) list.push(workingModel);
  if (process.env.GEMINI_MODEL) list.push(process.env.GEMINI_MODEL.trim());
  for (const m of FALLBACK_MODELS) list.push(m);
  return [...new Set(list)];
}

async function callModel(model, key, prompt, signal) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 800 },
      }),
    }
  );
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    const error = new Error(`Gemini HTTP ${response.status} (${model}) ${detail}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) console.warn(`Gemini (${model}) returned no text:`, JSON.stringify(data).slice(0, 300));
  return text;
}

async function cleanFollowUpNote(rawNote) {
  const raw = String(rawNote || '').trim();
  if (!raw) return null;
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    console.warn('GEMINI_API_KEY is not set: follow-up notes are saved as typed.');
    return raw;
  }

  const prompt = `You tidy short notes that sales callers type quickly about a follow-up with a lead.
Rewrite the note as ONE short, clear sentence.

Rules:
- Third person, no "I", "we" or "you". Start with "Asked ...", "Requested ...", "Client asked ..." or "Sent ...".
- Fix spelling and grammar, but keep every fact exactly: times, dates, channels (call, WhatsApp, email, meeting), names.
- Keep dates as written (for example 17/11/26). Write times like 5:30 PM only if AM/PM is given, otherwise 5:30.
- Never add information, reasons, or words such as "as requested". Do not guess unclear words; keep an unclear word as typed.
- Output only the sentence, ending with a full stop. No quotes.

Examples:
"client asked to call at 5.30" -> Client asked to be called at 5:30.
"asked for a meeting at 17/11/26" -> Asked for a meeting on 17/11/26.
"asked to share details thru whatsapp" -> Asked to share details on WhatsApp.
"called the client as requested" -> Called the client as requested.
"asked to snet mail, mail sent today" -> Asked to send an email; email sent today.

Note: "${raw.replace(/"/g, "'")}"
Sentence:`;

  // One time budget for the whole save; each model gets its own short timeout.
  const deadline = Date.now() + 15000;
  try {
    let lastError = null;
    for (const model of modelCandidates()) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(6000, remaining));
      try {
        const text = await callModel(model, key, prompt, controller.signal);
        const cleaned = String(text || '').replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 300);
        if (cleaned) {
          workingModel = model;
          return cleaned;
        }
        return raw;
      } catch (error) {
        lastError = error;
        // busy (503/500/502/504), rate limited (429), timed out, or not available (400/404): try the next model
        const retryable = error.name === 'AbortError' || [400, 404, 429, 500, 502, 503, 504].includes(error.status);
        if (retryable) {
          console.warn(`Gemini ${model} skipped: ${error.message}`.slice(0, 200));
          continue;
        }
        throw error; // 401/403 etc.: another model will not help
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastError) throw lastError;
    return raw;
  } catch (error) {
    console.error('Gemini note cleanup failed:', error.message);
    return raw;
  }
}

module.exports = { cleanFollowUpNote };