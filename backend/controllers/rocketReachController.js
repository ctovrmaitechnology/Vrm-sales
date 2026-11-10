const axios = require('axios');
const xlsx = require('xlsx');

const RR_BASE = 'https://api.rocketreach.co/api/v2';
const MAX_RESULTS = 25;
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

// POST /api/rocketreach/parse   body: { prompt, limit? }
async function parsePrompt(req, res) {
  const prompt = clean(req.body?.prompt);
  if (prompt.length < 3) return res.status(400).json({ error: 'Type what kind of leads you want.' });
  let raw;
  let via = 'basic';
  if ((process.env.ANTHROPIC_API_KEY || '').trim()) {
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
  if (c.job_titles.length) q.current_title = c.job_titles;
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

function bestEmail(p) {
  if (p.recommended_email) return clean(p.recommended_email);
  if (p.current_work_email) return clean(p.current_work_email);
  const l = Array.isArray(p.emails) ? p.emails : [];
  const valid = l.find((e) => e && (e.smtp_valid === 'valid' || e.grade === 'A' || e.grade === 'A-'));
  return clean((valid || l[0] || {}).email);
}
function bestPhone(p) {
  const l = Array.isArray(p.phones) ? p.phones : [];
  const mobile = l.find((x) => x && /mobile/i.test(x.type || ''));
  return clean((mobile || l[0] || {}).number);
}
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

// POST /api/rocketreach/search   body: { criteria }
async function searchPeople(req, res) {
  const c = normalizeCriteria(req.body?.criteria || req.body);
  const hasFilter = c.job_titles.length || c.seniority.length || c.departments.length || c.locations.length
    || c.industries.length || c.company_names.length || c.min_employees || c.keywords;
  if (!hasFilter) return res.status(400).json({ error: 'No filters found. Describe who you are looking for.' });
  if (isMock()) return res.json({ mock: true, results: mockPeople(c) });
  try {
    const { data } = await rr().post('/person/search', { query: buildRrQuery(c), start: 1, page_size: c.limit });
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    return res.json({ mock: false, results: profiles.map(mapProfile) });
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
      for (let i = 0; i < 5 && data && data.status && data.status !== 'complete'; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        const poll = await rr().get('/person/checkStatus', { params: { ids: id } });
        data = Array.isArray(poll.data) ? poll.data[0] : poll.data;
      }
      out.push({ id, email: bestEmail(data || {}), phone: bestPhone(data || {}), revealed: true });
    } catch (error) {
      console.error('[RocketReach] lookup failed for', id, error.response?.status || error.message);
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