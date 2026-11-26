const axios = require('axios');
const xlsx = require('xlsx');
const prisma = require('../prismaClient');
const RR_BASE = 'https://api.rocketreach.co/api/v2';
const MAX_RESULTS = 50;
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

// Same headers (same order) as the Leads page import template.
const LEAD_TEMPLATE_COLUMNS = [
  'full_name', 'email', 'phone_number', 'whatsapp_number', 'company_name', 'role',
  'linkedin_url', 'facebook_url', 'source', 'note', 'address', 'assigned_user_name',
];

const rrKey = () => (process.env.ROCKETREACH_API_KEY || '').trim();
const isMock = () => !rrKey();
const rr = () => axios.create({ baseURL: RR_BASE, headers: { 'Api-Key': rrKey() }, timeout: 30000 });
const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(clean).filter(Boolean);

// ---------------------------------------------------------------------------
// 1) PROMPT -> SEARCH CRITERIA
// ---------------------------------------------------------------------------
const SENIORITY = ['C-Suite', 'VP', 'Director', 'Manager', 'Head', 'Founder', 'Senior', 'Entry'];

function normalizeCriteria(c = {}) {
  const minEmp = Number(c.min_employees);
  const limit = Math.min(Math.max(Number(c.limit) || 10, 1), MAX_RESULTS);
  return {
    job_titles: list(c.job_titles),
    seniority: list(c.seniority).filter((s) => SENIORITY.includes(s)),
    departments: list(c.departments),
    locations: list(c.locations),
    industries: list(c.industries),
    company_names: list(c.company_names),
    min_employees: Number.isFinite(minEmp) && minEmp > 0 ? Math.round(minEmp) : null,
    keywords: clean(c.keywords),
    limit,
  };
}

const COUNTRY_ALIASES = { us: 'United States', usa: 'United States', 'u.s.': 'United States', uk: 'United Kingdom', uae: 'United Arab Emirates' };

// No AI key? A simple rule-based reader so the page still works (less smart).
function basicParse(prompt) {
  const text = clean(prompt);
  const c = { job_titles: [], seniority: [], departments: [], locations: [], industries: [], company_names: [], keywords: '' };

  const lim = text.match(/\b(?:top|first)?\s*(\d{1,2})\s*(?:leads|people|contacts|prospects|profiles)\b/i) || text.match(/\b(?:top|first)\s+(\d{1,2})\b/i);
  if (lim) c.limit = Number(lim[1]);

  const emp = text.match(/(\d[\d,]*)\s*\+?\s*(?:employees|staff|people)/i);
  if (emp) c.min_employees = Number(emp[1].replace(/,/g, ''));

  const loc = text.match(/\bin\s+(?:the\s+)?([A-Za-z][A-Za-z .]*?)(?=\s+(?:at|with|who|from|working|that|for)\b|[,.]|$)/i);
  if (loc) {
    const raw = loc[1].trim();
    c.locations.push(COUNTRY_ALIASES[raw.toLowerCase()] || raw);
  }

  const ind = text.match(/([A-Za-z/&-]+(?:\s+[A-Za-z/&-]+){0,2})\s+(?:companies|firms|startups|businesses|organisations|organizations)\b/i);
  if (ind) {
    const industry = ind[1].split(/\s+(?:at|in|for|with)\s+/i).pop().trim();
    if (industry && !/\b(at|in|for|with)$/i.test(industry)) c.industries.push(industry);
  }

  let title = text
    .replace(/^(?:please\s+)?(?:build|find|get|give|show|list|search)(?:\s+me)?(?:\s+an?)?(?:\s+list\s+of)?\s*/i, '')
    .split(/\s+(?:in|at|from|with|who|working|that|for)\s+/i)[0]
    .replace(/^(?:\d+\s+)?/, '')
    .trim();
  title = title
    .replace(/\s+(leads|people|contacts|prospects)$/i, '')
    .replace(/\b(VP|CTO|CEO|CFO|CMO|COO)s\b/gi, '$1')
    .replace(/\b(director|manager|head|founder|owner|engineer|executive|officer|president|lead)s\b/gi, '$1');
  if (title && title.length < 60) c.job_titles.push(title);

  if (/\b(vps?|vice presidents?)\b/i.test(text)) c.seniority.push('VP');
  if (/\b(ctos?|ceos?|cfos?|cmos?|coos?|chief)\b/i.test(text)) c.seniority.push('C-Suite');
  if (/\bdirector/i.test(text)) c.seniority.push('Director');
  if (/\bmanager/i.test(text)) c.seniority.push('Manager');
  if (/\bfounder|owner/i.test(text)) c.seniority.push('Founder');
  const dept = text.match(/\b(marketing|sales|engineering|finance|hr|human resources|operations|product|it)\b/i);
  if (dept) {
    const key = dept[1].toLowerCase();
    const names = { hr: 'Human Resources', it: 'IT' };
    c.departments.push(names[key] || key[0].toUpperCase() + key.slice(1));
  }
  return c;
}

async function parseWithClaude(prompt) {
  const system = [
    'You convert a request for a B2B lead list into search filters for RocketReach.',
    'Reply with ONLY one JSON object, no markdown, with exactly these keys:',
    'job_titles (array of strings), seniority (array, each one of: C-Suite, VP, Director, Manager, Head, Founder, Senior, Entry),',
    'departments (array, e.g. Marketing, Sales, Engineering, Finance, Operations, Product, IT, Human Resources),',
    'locations (array of full country/state/city names, e.g. "United States"), industries (array, e.g. "Software", "SaaS"),',
    'company_names (array), min_employees (integer or null; "500+ employees" means 500), keywords (string), limit (integer 1-25, default 10).',
    'Use empty arrays / null / "" for anything the user did not state. Never invent filters.',
  ].join(' ');
  const { data } = await axios.post(
    'https://api.anthropic.com/v1/messages',
    { model: CLAUDE_MODEL, max_tokens: 600, system, messages: [{ role: 'user', content: prompt }] },
    {
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      timeout: 30000,
    }
  );
  const text = (data.content || []).map((b) => b.text || '').join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(json);
}
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PARSE_SYSTEM = [
  'You convert a request for a B2B lead list into search filters for RocketReach (sales team in India selling to companies).',
  'Reply with ONLY one JSON object with exactly these keys:',
  'job_titles (array of strings), seniority (array, each one of: C-Suite, VP, Director, Manager, Head, Founder, Senior, Entry),',
  'departments (array), locations (array of full country/state/city names), industries (array of strings),',
  'company_names (array), min_employees (integer or null), keywords (string), limit (integer 1-50, default 10).',
  'RULES:',
  '1) "decision makers" / "decision-makers" / "owners" means seniority ["C-Suite","Founder","VP","Director"] and job_titles ["CEO","Founder","Co-Founder","Managing Director","Director","Owner","President","COO","CTO","CFO","VP","Head of Operations"].',
  '2) Split lists: "CEOs, founders and directors" becomes separate items in job_titles - never one combined string.',
  '3) Industries: BPO -> ["Outsourcing/Offshoring","Business Process Outsourcing"]; IT -> ["Information Technology & Services","Computer Software"]; Recruitment / staffing -> ["Staffing & Recruiting"]; "non IT" -> use the specific industries the user names (Manufacturing, Retail, Healthcare, Financial Services, Real Estate, Education...), if none named leave industries empty and put "non-IT" in keywords. If the user lists several (BPO, IT, recruitment) put all of them in industries.',
  '4) If no location is given, use ["India"].',
  '5) Roles the user names (HR, Operations, Sales, Procurement...) go to departments and job_titles.',
  '6) Use empty arrays / null / "" for anything not stated. Never invent company names.',
].join(' ');

async function parseWithGemini(prompt) {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      systemInstruction: { parts: [{ text: PARSE_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    },
    { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' }, timeout: 30000 }
  );
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

// POST /api/rocketreach/parse   body: { prompt, limit? }
async function parsePrompt(req, res) {
  const prompt = clean(req.body?.prompt);
  if (prompt.length < 3) return res.status(400).json({ error: 'Type what kind of leads you want.' });
  let raw;
  let via = 'basic';
  if ((process.env.GEMINI_API_KEY || '').trim()) {
    try {
      raw = await parseWithGemini(prompt);
      via = 'gemini';
    } catch (error) {
      console.error('[RocketReach] Gemini parse failed, using basic parser:', error.response?.status || error.message, JSON.stringify(error.response?.data || '').slice(0, 300));
    }
  }
  if (!raw && (process.env.ANTHROPIC_API_KEY || '').trim()) {
    try {
      raw = await parseWithClaude(prompt);
      via = 'claude';
    } catch (error) {
      console.error('[RocketReach] Claude parse failed, using basic parser:', error.response?.status || error.message);
    }
  }
  if (!raw) raw = basicParse(prompt);
  if (req.body?.limit) raw.limit = req.body.limit;
  return res.json({ via, criteria: normalizeCriteria(raw) });
}

// ---------------------------------------------------------------------------
// 2) SEARCH
// ---------------------------------------------------------------------------
const SIZE_BUCKETS = [
  [1, 10, '1-10'], [11, 50, '11-50'], [51, 200, '51-200'], [201, 500, '201-500'],
  [501, 1000, '501-1000'], [1001, 5000, '1001-5000'], [5001, 10000, '5001-10000'], [10001, Infinity, '10001+'],
];
function sizeBuckets(min) {
  if (!min) return [];
  return SIZE_BUCKETS.filter(([, hi]) => hi >= min).map(([, , label]) => label);
}

// Build the RocketReach /person/search query. Names follow RocketReach's docs; verify on your first real call.
function buildRrQuery(c) {
  const q = {};
    const titles = c.job_titles.flatMap((t) => t.split(/,| and | or /i)).map((t) => t.trim()).filter(Boolean);
  if (titles.length) q.current_title = titles;
  if (c.seniority.length) q.management_levels = c.seniority;
  if (c.departments.length) q.department = c.departments;
  if (c.locations.length) q.location = c.locations;
  if (c.industries.length) q.company_industry = c.industries;
  if (c.company_names.length) q.current_employer = c.company_names;
  if (c.min_employees) q.company_size = sizeBuckets(c.min_employees);
  if (c.keywords) q.keyword = [c.keywords];
  return q;
}

const FAKE_NAMES = ['Aarav Mehta', 'Sophia Turner', 'Rahul Nair', 'Emily Carter', 'Karthik Raman', 'Olivia Brooks', 'Vikram Rao', 'Hannah Lee', 'Arjun Das', 'Grace Miller'];
function mockPeople(c) {
  const role = c.job_titles[0] || 'Vice President';
  const industry = c.industries[0] || 'Software';
  const place = c.locations[0] || '';
  return Array.from({ length: Math.min(c.limit, FAKE_NAMES.length) }, (_, i) => ({
    id: `mock-${i + 1}`,
    name: FAKE_NAMES[i],
    company: `${['Nimbus', 'Brightlane', 'Cloudwave', 'Stackly', 'Orbit', 'Pivotal', 'Zenith', 'Harbor', 'Lumen', 'Vertex'][i]} ${industry}`,
    role,
    email: '',
    phone: '',
    linkedin_url: `https://www.linkedin.com/in/sample-${i + 1}`,
    location: place,
    revealed: false,
  }));
}

function allEmails(p) {
  const out = [];
  const add = (v) => { const s = clean(v).toLowerCase(); if (s && !out.includes(s)) out.push(s); };
  add(p.recommended_email);
  add(p.current_work_email);
  add(p.current_personal_email);
  (Array.isArray(p.emails) ? p.emails : []).forEach((e) => add(typeof e === 'string' ? e : e && e.email));
  return out;
}
function allPhones(p) {
  const out = [];
  const add = (v) => { const s = clean(v); if (s && !out.includes(s)) out.push(s); };
  (Array.isArray(p.phones) ? p.phones : [])
    .slice()
    .sort((a, b) => (/mobile/i.test(b && b.type || '') ? 1 : 0) - (/mobile/i.test(a && a.type || '') ? 1 : 0))
    .forEach((x) => add(typeof x === 'string' ? x : x && x.number));
  add(p.phone);
  return out;
}
const bestEmail = (p) => {
  const l = Array.isArray(p.emails) ? p.emails : [];
  const valid = l.find((e) => e && typeof e === 'object' && (e.smtp_valid === 'valid' || e.grade === 'A' || e.grade === 'A-'));
  return clean(p.recommended_email) || clean(p.current_work_email) || clean(valid && valid.email) || allEmails(p)[0] || '';
};
const bestPhone = (p) => allPhones(p)[0] || '';   // mobile numbers are sorted first
function mapProfile(p) {
  return {
    id: String(p.id),
    name: clean(p.name),
    company: clean(p.current_employer),
    role: clean(p.current_title),
    email: bestEmail(p),
    phone: bestPhone(p),
    linkedin_url: clean(p.linkedin_url),
    location: clean(p.location),
    revealed: Boolean(bestEmail(p) || bestPhone(p)),
  };
}

// POST /api/rocketreach/search   body: { criteria, exclude_ids?, start? }
// Skips people already used (exclude_ids), people already in the Leads table, and duplicates inside the batch.
// If a page has too many repeats it reads the next page, up to 5 pages, so you still get new people.
const normUrl = (u) => clean(u).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');

async function searchPeople(req, res) {
  const c = normalizeCriteria(req.body?.criteria || req.body);
  const hasFilter = c.job_titles.length || c.seniority.length || c.departments.length || c.locations.length
    || c.industries.length || c.company_names.length || c.min_employees || c.keywords;
  if (!hasFilter) return res.status(400).json({ error: 'No filters found. Describe who you are looking for.' });
  if (isMock()) return res.json({ mock: true, results: mockPeople(c), next_start: 0, skipped: { seen: 0, in_leads: 0 } });

  const exclude = new Set((Array.isArray(req.body?.exclude_ids) ? req.body.exclude_ids : []).map(String));
  let start = Math.max(Number(req.body?.start) || 1, 1);
  const out = [];
  const batchIds = new Set();
  let skippedSeen = 0;
  let skippedLeads = 0;
  let exhausted = false;

  try {
    // what the Leads table already has (a few thousand rows, cheap)
    const existing = await prisma.leads.findMany({ select: { linkedin_url: true, email: true } });
    const haveUrl = new Set(existing.map((l) => normUrl(l.linkedin_url)).filter(Boolean));
    const haveEmail = new Set(existing.map((l) => clean(l.email).toLowerCase()).filter(Boolean));

    for (let page = 0; page < 5 && out.length < c.limit && !exhausted; page += 1) {
      const { data } = await rr().post('/person/search', { query: buildRrQuery(c), start, page_size: c.limit });
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      if (!profiles.length) { exhausted = true; break; }
      start += profiles.length;
      if (profiles.length < c.limit) exhausted = true;

      for (const p of profiles.map(mapProfile)) {
        if (out.length >= c.limit) break;
        if (exclude.has(p.id) || batchIds.has(p.id)) { skippedSeen += 1; continue; }
        const url = normUrl(p.linkedin_url);
        const mail = clean(p.email).toLowerCase();
        if ((url && haveUrl.has(url)) || (mail && haveEmail.has(mail))) { skippedLeads += 1; continue; }
        batchIds.add(p.id);
        out.push(p);
      }
    }
    console.log('[RocketReach] search returned', out.length, 'new profiles; skipped seen:', skippedSeen, 'in leads:', skippedLeads, 'next start:', exhausted ? 0 : start);
    return res.json({ mock: false, results: out, next_start: exhausted ? 0 : start, skipped: { seen: skippedSeen, in_leads: skippedLeads } });
  } catch (error) {
    const status = error.response?.status;
    const apiMessage = clean(error.response?.data?.detail || error.response?.data?.message || error.response?.data?.error);
    console.error('[RocketReach] search failed:', status, error.response?.data || error.message);
    if (/subscribe|plan/i.test(apiMessage)) {
      return res.status(402).json({ error: 'RocketReach says: your plan does not include search results. Upgrade the plan, then try again.' });
    }
    return res.status(status === 401 || status === 403 ? 502 : 500).json({
      error: status === 401 || status === 403
        ? 'RocketReach rejected the API key, or your plan has no API access.'
        : 'RocketReach search failed.',
    });
  }
}
// ---------------------------------------------------------------------------
// 3) REVEAL (spends credits) and 4) EXPORT
// ---------------------------------------------------------------------------
async function revealContacts(req, res) {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).slice(0, MAX_RESULTS);
  if (!ids.length) return res.status(400).json({ error: 'Select at least one person.' });
  if (isMock()) {
    return res.json({
      mock: true,
      results: ids.map((id) => {
        const n = Number(String(id).replace('mock-', '')) || 1;
        return { id, email: `sample${n}@example.com`, phone: `98000000${10 + n}`, revealed: true };
      }),
    });
  }
  const out = [];
    for (const id of ids) {
    try {
      let { data } = await rr().get('/person/lookup', { params: { id } });
      for (let i = 0; i < 10 && data && data.status && data.status !== 'complete'; i += 1) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await rr().get('/person/checkStatus', { params: { ids: id } });
        data = Array.isArray(poll.data) ? poll.data[0] : poll.data;
      }
      const email = bestEmail(data || {});
      const phone = bestPhone(data || {});
      console.log('[RocketReach] reveal', id, 'status:', data && data.status, 'emails:', (data && data.emails || []).length, 'phones:', (data && data.phones || []).length);
      if (!email && !phone) console.warn('[RocketReach] lookup returned no contact for', id, 'status:', data && data.status);
      out.push({ id, email, phone, revealed: Boolean(email || phone), error: email || phone ? undefined : 'No contact found' });
    } catch (error) {
      console.error('[RocketReach] lookup failed for', id, error.response?.status, JSON.stringify(error.response?.data || error.message));
      out.push({ id, email: '', phone: '', revealed: false, error: 'Lookup failed' });
    }
  }
  return res.json({ mock: false, results: out });
}

const SOURCE_OPTIONS = ['Non-IT', 'IT', 'Recruitment', 'BPO'];

// POST /api/rocketreach/export   body: { rows, user_id, source }
// Produces the same workbook as the Leads page template (Leads + Instructions sheets),
// with the chosen Source and Assigned User filled into every row.
async function exportExcel(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const source = clean(req.body?.source);
  const userId = Number(req.body?.user_id);
  const people = rows.filter((r) => clean(r.name));
  if (!people.length) return res.status(400).json({ error: 'No leads to export.' });
  if (!SOURCE_OPTIONS.includes(source)) {
    return res.status(400).json({ error: 'Select a source before downloading.' });
  }
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: 'Select an assigned user before downloading.' });
  }
  try {
    const { getActiveUserById } = require('../unifiedDb');
    const user = await getActiveUserById(userId);
    if (!user) return res.status(400).json({ error: 'Selected employee was not found or is inactive.' });

    const data = people.map((r) => [
      clean(r.name), clean(r.email).toLowerCase(), clean(r.phone), '', clean(r.company), clean(r.role),
      clean(r.linkedin_url), '', source, '', clean(r.location), user.employee_name,
    ]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([LEAD_TEMPLATE_COLUMNS, ...data]), 'Leads');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([
      ['Field', 'Value'],
      ['Source', source],
      ['Assigned User', user.employee_name],
      ['Selected user', user.employee_name],
      ['Selected source', source],
      ['Instructions', 'Add one contact per row. The first data row has the selected user and source prefilled; copy those cells down for additional rows.'],
      ['Per-row assignment', 'Change Assigned User Name on a row to assign it to another active user.'],
      ['Source field', 'Source can be specified per row, or kept as the prefilled source.'],
      ['Required field', 'Full Name'],
      ['Optional fields', 'Email, phone numbers, company, role, links, source, note, and address'],
    ]), 'Instructions');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="leads_template.xlsx"');
    return res.send(buffer);
  } catch (error) {
    console.error('[RocketReach] export failed:', error.message);
    return res.status(500).json({ error: 'Failed to create the Excel file.' });
  }
}

module.exports = { parsePrompt, searchPeople, revealContacts, exportExcel, _test: { basicParse, normalizeCriteria, buildRrQuery } };