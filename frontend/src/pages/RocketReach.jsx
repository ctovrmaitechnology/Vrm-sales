import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Send, Download, Unlock, Sparkles, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, X, ExternalLink, Search, ChevronUp,
} from 'lucide-react';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${BACKEND_BASE_URL}${path}`;

const SOURCE_OPTIONS = ['Non-IT', 'IT', 'Recruitment', 'BPO'];

// ---------- ready-made prompt ideas (grouped, collapsible) ----------
const PROMPT_GROUPS = [
  {
    "id": "bpo",
    "label": "BPO & Call Center",
    "items": [
      {
        "label": "CEOs & owners",
        "prompt": "Find CEOs, founders, co-founders, owners, presidents, managing directors, CTOs, CIOs, COOs, CSOs, CHROs, CHOs, CPOs, CROs, vice presidents and directors at BPO, BPM, outsourcing, contact center and call center companies across India, including small, medium and large companies"
      },
      {
        "label": "Operations & delivery heads",
        "prompt": "Find COOs, VPs of Operations, operations directors, general managers, delivery heads, service delivery directors, process heads and business unit heads at domestic and international BPO, customer support and business process outsourcing companies in India"
      },
      {
        "label": "Call center, by city",
        "prompt": "Find CEOs, founders, managing directors, presidents, operations heads, customer service directors and contact center managers at inbound call centers, outbound call centers, telemarketing companies and customer experience outsourcing firms in Chennai, Bengaluru, Hyderabad, Mumbai, Pune and Delhi NCR"
      },
      {
        "label": "Customer experience heads",
        "prompt": "Find Chief Customer Officers, Chief Experience Officers, customer experience heads, customer support directors, technical support heads and back-office operations heads at customer experience, technical support and shared services companies across India"
      },
      {
        "label": "HR & talent heads",
        "prompt": "Find CHROs, CHOs, CPOs, HR directors, talent acquisition heads, recruitment directors and workforce management heads at BPO, BPM, call center and outsourcing companies across India"
      }
    ]
  },
  {
    "id": "it",
    "label": "IT & Software",
    "items": [
      {
        "label": "CEOs & owners",
        "prompt": "Find CEOs, founders, co-founders, owners, presidents, managing directors, CTOs, CIOs, COOs, CDOs, vice presidents and directors at IT services, IT consulting, software development and technology outsourcing companies across India"
      },
      {
        "label": "CTOs & tech heads",
        "prompt": "Find CTOs, CIOs, CDOs, CISO, IT directors, technology heads, engineering heads, software development heads and infrastructure heads at software companies, SaaS companies, cloud computing firms and technology startups in India"
      },
      {
        "label": "Delivery & engineering heads",
        "prompt": "Find CEOs, founders, managing directors, business heads, delivery heads, project directors, VPs of Engineering and operations directors at IT consulting, application development, web development and digital transformation companies in India"
      },
      {
        "label": "SaaS, AI & cloud",
        "prompt": "Find senior decision makers at SaaS, PaaS, enterprise software, AI, machine learning, cybersecurity, cloud services and product engineering companies across India, including startups and established enterprises"
      },
      {
        "label": "IT companies, by city & size",
        "prompt": "Find CEOs, CTOs, CIOs, COOs, founders, presidents and directors at IT companies with 10 to 10000 employees in Chennai, Bengaluru, Hyderabad, Mumbai, Pune, Coimbatore, Ahmedabad and Delhi NCR"
      }
    ]
  },
  {
    "id": "staff",
    "label": "Staffing & Recruitment",
    "items": [
      {
        "label": "CEOs & owners",
        "prompt": "Find CEOs, founders, co-founders, owners, presidents, managing directors and directors at recruitment agencies, staffing firms, manpower consultancies and workforce management companies across India"
      },
      {
        "label": "HR & talent heads",
        "prompt": "Find CHROs, CHOs, CPOs, HR vice presidents, HR directors, HR heads, talent acquisition directors and recruitment heads at IT, BPO, staffing and recruitment companies across India"
      },
      {
        "label": "Executive search & RPO",
        "prompt": "Find decision makers at executive search firms, recruitment process outsourcing companies, temporary staffing agencies, permanent recruitment agencies and HR consulting firms in India"
      },
      {
        "label": "Recruitment heads, by city",
        "prompt": "Find recruitment directors, staffing heads, talent acquisition heads, workforce management directors, HR operations heads and business development heads at recruitment and staffing companies in Chennai, Bengaluru, Hyderabad, Mumbai, Pune and Delhi NCR"
      }
    ]
  },
  {
    "id": "mfg",
    "label": "Manufacturing",
    "items": [
      {
        "label": "CEOs & plant heads",
        "prompt": "Find CEOs, founders, owners, presidents, managing directors, COOs, plant heads, manufacturing directors and operations heads at manufacturing, engineering, automotive, electronics and industrial companies across India"
      },
      {
        "label": "HR & recruitment heads",
        "prompt": "Find CHROs, CHOs, CPOs, HR directors, HR managers, talent acquisition heads and recruitment managers at manufacturing, automotive, textile, pharmaceutical and industrial companies across India"
      },
      {
        "label": "Procurement & supply chain",
        "prompt": "Find procurement directors, chief procurement officers, purchase heads, sourcing directors, supply chain heads and operations directors at manufacturing, engineering and industrial companies across India"
      }
    ]
  },
  {
    "id": "other",
    "label": "Healthcare, Finance, Logistics",
    "items": [
      {
        "label": "Healthcare & pharma",
        "prompt": "Find CEOs, founders, managing directors, presidents, COOs and operations directors at hospitals, healthcare providers, diagnostic centers, pharmaceutical companies and healthcare service providers across India"
      },
      {
        "label": "Banking, fintech & insurance",
        "prompt": "Find CEOs, founders, CFOs, COOs, CTOs, CIOs and business heads at banking, financial services, insurance, fintech and financial technology companies across India"
      },
      {
        "label": "Logistics & supply chain",
        "prompt": "Find CEOs, managing directors, operations heads, logistics directors, supply chain heads and warehouse heads at logistics, transportation, shipping, courier and supply chain companies across India"
      },
      {
        "label": "Retail & e-commerce",
        "prompt": "Find CEOs, founders, COOs, regional directors and operations heads at retail chains, e-commerce companies, distribution companies, wholesale businesses and consumer goods companies across India"
      },
      {
        "label": "Education & EdTech",
        "prompt": "Find CEOs, founders, managing directors, presidents and operations heads at educational institutions, EdTech companies, training organizations and education service providers across India"
      }
    ]
  },
  {
    "id": "sales",
    "label": "Sales & Procurement",
    "items": [
      {
        "label": "Sales & revenue heads",
        "prompt": "Find Chief Sales Officers, Chief Revenue Officers, Chief Business Officers, Chief Commercial Officers, VPs of Sales, sales directors, business development directors and partnership heads at BPO, IT services, SaaS and consulting companies across India"
      },
      {
        "label": "B2B business heads",
        "prompt": "Find CEOs, COOs, CSOs, CROs, business development heads, commercial directors and regional sales heads at small, medium and large B2B companies across India"
      },
      {
        "label": "Finance & procurement heads",
        "prompt": "Find CFOs, finance directors, procurement directors, chief procurement officers, purchase managers, sourcing heads and supply chain directors at companies across IT, manufacturing, healthcare, logistics and retail industries in India"
      }
    ]
  },
  {
    "id": "size",
    "label": "By company size",
    "items": [
      {
        "label": "Startups (1-50)",
        "prompt": "Find CEOs, founders, owners, managing directors, presidents, CTOs, COOs and directors at Indian startups and companies with 1 to 50 employees across all industries"
      },
      {
        "label": "SMBs (50-500)",
        "prompt": "Find CEOs, founders, COOs, CTOs, CHROs, presidents, vice presidents and directors at small and medium-sized businesses with 50 to 500 employees across India"
      },
      {
        "label": "Mid-size (500-2000)",
        "prompt": "Find senior decision makers including C-suite executives, founders, owners, presidents, vice presidents and department heads at mid-sized companies with 500 to 2000 employees across India"
      },
      {
        "label": "Enterprise (2000+)",
        "prompt": "Find CEOs, CTOs, CIOs, COOs, CHROs, CSOs, CROs, presidents, executive vice presidents and directors at large enterprises with 2000 to 10000+ employees across India"
      }
    ]
  },
  {
    "id": "city",
    "label": "By city",
    "items": [
      {
        "label": "Chennai",
        "prompt": "Find CEOs, founders, owners, managing directors, presidents, COOs, CTOs, CHROs and vice presidents at BPO, IT, staffing, recruitment and non-IT companies in Chennai, Tamil Nadu"
      },
      {
        "label": "Bengaluru",
        "prompt": "Find CEOs, founders, owners, managing directors, presidents, COOs, CTOs, CHROs and vice presidents at BPO, IT, staffing, recruitment and non-IT companies in Bengaluru, Karnataka"
      },
      {
        "label": "Hyderabad",
        "prompt": "Find CEOs, founders, owners, managing directors, presidents, COOs, CTOs, CHROs and vice presidents at BPO, IT, staffing, recruitment and non-IT companies in Hyderabad, Telangana"
      },
      {
        "label": "Mumbai & Pune",
        "prompt": "Find CEOs, founders, owners, managing directors, presidents, COOs, CTOs, CHROs and vice presidents at BPO, IT, staffing, recruitment and non-IT companies in Mumbai and Pune, Maharashtra"
      },
      {
        "label": "Delhi NCR",
        "prompt": "Find CEOs, founders, owners, managing directors, presidents, COOs, CTOs, CHROs and vice presidents at BPO, IT, staffing, recruitment and non-IT companies in Delhi NCR, Noida and Gurugram"
      },
      {
        "label": "Other cities",
        "prompt": "Find senior decision makers at BPO, IT services, SaaS, staffing, recruitment, manufacturing, healthcare, logistics and consulting companies across Coimbatore, Madurai, Ahmedabad, Kochi, Kolkata, Jaipur and other Indian cities"
      }
    ]
  },
  {
    "id": "broad",
    "label": "Broad search",
    "items": [
      {
        "label": "All senior decision makers",
        "prompt": "Find all types of senior decision makers including CEOs, founders, co-founders, owners, chairmen, presidents, managing directors, CTOs, CIOs, COOs, CFOs, CMOs, CHROs, CHOs, CPOs, CSOs, CROs, CCOs, VPs, SVPs, EVPs, directors, general managers and department heads at companies across all industries and locations in India"
      }
    ]
  }
];

// Compact, grouped prompt picker: one row of category tabs, short cards for the active category.
// Clicking a card calls onPick(fullPromptText) - the full text goes into the prompt box.
function PromptLibrary({ onPick }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(PROMPT_GROUPS[0].id);
  const group = PROMPT_GROUPS.find((g) => g.id === active) || PROMPT_GROUPS[0];

  const tab = (on) => ({
    padding: '0.35rem 0.8rem', borderRadius: 999, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${on ? 'var(--primary, #2563eb)' : 'var(--border, #e2e8f0)'}`,
    background: on ? 'var(--primary, #2563eb)' : 'var(--surface, #fff)',
    color: on ? '#fff' : 'var(--text, #334155)',
  });

  return (
    <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 14, padding: '0.7rem 0.9rem', marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-strong, #0f172a)', fontWeight: 700, fontSize: '0.92rem', padding: 0 }}
      >
        <Sparkles size={16} /> Prompt ideas
        <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-muted, #64748b)' }}>
          {PROMPT_GROUPS.reduce((n, g) => n + g.items.length, 0)} ready-made searches
        </span>
        <span style={{ marginLeft: 'auto' }}>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
            {PROMPT_GROUPS.map((g) => (
              <button key={g.id} type="button" style={tab(g.id === active)} onClick={() => setActive(g.id)}>{g.label}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8, marginTop: 8 }}>
            {group.items.map((it) => (
              <button
                key={it.label}
                type="button"
                title={it.prompt}
                onClick={() => { onPick(it.prompt); setOpen(false); }}
                style={{
                  textAlign: 'left', padding: '0.6rem 0.75rem', borderRadius: 10, cursor: 'pointer',
                  border: '1px solid var(--border, #e2e8f0)', background: 'var(--surface-hover, #f8fafc)',
                  color: 'var(--text-strong, #0f172a)', fontSize: '0.84rem', fontWeight: 600,
                }}
              >
                {it.label}
                <div style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-muted, #64748b)', marginTop: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {it.prompt.replace(/^Find /, '')}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- selectable filter options (nothing to type) ----------
const SENIORITY_OPTIONS = ['C-Suite', 'Founder', 'VP', 'Director', 'Manager', 'Head', 'Senior'];
const TITLE_OPTIONS = [
  'CEO', 'Founder', 'Co-Founder', 'Managing Director', 'Owner', 'President', 'COO', 'CTO', 'CIO', 'CFO', 'CHRO',
  'General Manager', 'Head of Operations', 'HR Head', 'Talent Acquisition Head', 'Procurement Head',
];
const DEPARTMENT_OPTIONS = ['Operations', 'Sales', 'Marketing', 'Engineering', 'IT', 'Human Resources', 'Finance', 'Product'];
// label -> the RocketReach industry names it searches (adjust here if RocketReach uses other names)
const INDUSTRY_OPTIONS = [
  { label: 'BPO / Call Center', values: ['Outsourcing/Offshoring', 'Business Process Outsourcing'] },
  { label: 'IT Services', values: ['Information Technology & Services'] },
  { label: 'Software / SaaS', values: ['Computer Software'] },
  { label: 'Staffing & Recruitment', values: ['Staffing & Recruiting'] },
  { label: 'Manufacturing', values: ['Manufacturing'] },
  { label: 'Healthcare', values: ['Hospital & Health Care'] },
  { label: 'Financial Services', values: ['Financial Services'] },
  { label: 'Logistics', values: ['Logistics & Supply Chain'] },
  { label: 'Retail', values: ['Retail'] },
  { label: 'Education', values: ['Education Management'] },
];
const LOCATION_OPTIONS = [
  'India', 'Chennai', 'Bengaluru', 'Hyderabad', 'Mumbai', 'Pune', 'Delhi', 'Noida', 'Gurugram',
  'Kolkata', 'Coimbatore', 'Ahmedabad', 'Kochi', 'Jaipur',
];
const SIZE_OPTIONS = [
  { label: 'Any size', value: 0 }, { label: '10+ employees', value: 10 }, { label: '50+ employees', value: 50 },
  { label: '200+ employees', value: 200 }, { label: '500+ employees', value: 500 },
  { label: '1,000+ employees', value: 1000 }, { label: '5,000+ employees', value: 5000 },
];

const EMPTY_FILTERS = {
  job_titles: [], seniority: [], departments: [], locations: [], industries: [], company_names: [], min_employees: 0, keywords: '',
};

// ---------- small style helpers (theme-aware via CSS variables) ----------
const V = {
  surface: 'var(--surface, #ffffff)',
  hover: 'var(--surface-hover, #f8fafc)',
  border: 'var(--border, #e2e8f0)',
  strong: 'var(--text-strong, #0f172a)',
  text: 'var(--text, #334155)',
  muted: 'var(--text-muted, #64748b)',
  accent: 'var(--accent-soft, #eff6ff)',
};
const card = { background: V.surface, border: `1px solid ${V.border}`, borderRadius: 14 };
const btn = (bg, disabled) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.85rem', border: 'none', borderRadius: 8,
  background: disabled ? '#94a3b8' : bg, color: '#fff', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.85rem',
});
const lbl = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: V.text };
const sel = { padding: '0.45rem 0.6rem', border: `1.5px solid ${V.border}`, borderRadius: 8, fontSize: '0.85rem', background: V.surface, color: V.strong };

async function postJson(path, body) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Request failed');
  }
  return res;
}

const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

// ---------- collapsible filter section ----------
function Section({ title, count, open, onToggle, children }) {
  return (
    <div style={{ borderTop: `1px solid ${V.border}` }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '0.6rem 0.2rem', background: 'none', border: 'none', cursor: 'pointer', color: V.strong, fontWeight: 700, fontSize: '0.86rem' }}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        {title}
        {count > 0 && (
          <span style={{ marginLeft: 'auto', background: '#2563eb', color: '#fff', borderRadius: 999, padding: '0 7px', fontSize: '0.72rem', lineHeight: '18px' }}>{count}</span>
        )}
      </button>
      {open && <div style={{ padding: '0 0.2rem 0.7rem', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>{children}</div>}
    </div>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.83rem', color: V.text, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

export default function RocketReach() {
  const [prompt, setPrompt] = useState('');
  const [limit, setLimit] = useState(10);
  const [onlyPhone, setOnlyPhone] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [panelOpen, setPanelOpen] = useState(true);
  const [openSec, setOpenSec] = useState({ seniority: true, industry: true, location: true });

  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | parsing | searching | done | error
  const [error, setError] = useState('');
  const [via, setVia] = useState('');
  const [mock, setMock] = useState(false);
  const [notice, setNotice] = useState('');
  const [revealing, setRevealing] = useState(false);
  const [nextStart, setNextStart] = useState(0);   // where "Find more" continues (0 = no more)
  const [skipped, setSkipped] = useState({ seen: 0, in_leads: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  // people already revealed / exported are remembered here so they do not come back again and again
  const [seen, setSeen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vrm_lf_seen') || '[]'); } catch { return []; }
  });
  const markSeen = (ids) => {
    setSeen((prev) => {
      const next = [...new Set([...prev, ...ids.map(String)])].slice(-3000);
      try { localStorage.setItem('vrm_lf_seen', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const resetSeen = () => {
    setSeen([]);
    try { localStorage.removeItem('vrm_lf_seen'); } catch { /* ignore */ }
  };

  const [source, setSource] = useState('');
  const [userId, setUserId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vrm_lf_recent') || '[]'); } catch { return []; }
  });

  const usersQuery = useQuery({
    queryKey: ['rocketreach-users'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/users'));
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to load users.');
      const list = Array.isArray(data) ? data : data?.data;
      if (!Array.isArray(list)) throw new Error('The users API returned an unexpected response.');
      return list;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const users = (usersQuery.data || []).filter((u) => u && u.id != null);
  const userName = (u) => u.employee_name || u.name || u.email || `User ${u.id}`;

  const busy = status === 'parsing' || status === 'searching';
  const sec = (k) => ({ open: Boolean(openSec[k]), onToggle: () => setOpenSec((o) => ({ ...o, [k]: !o[k] })) });
  const setF = (patch) => setFilters((f) => ({ ...f, ...patch }));

  // options filled by the AI that are not in our fixed lists still show up (so nothing is hidden)
  const extra = (list, base) => list.filter((v) => !base.includes(v));
  const industryBaseValues = INDUSTRY_OPTIONS.flatMap((o) => o.values);
  const extraIndustries = extra(filters.industries, industryBaseValues);

  const activeChips = useMemo(() => {
    const chips = [];
    filters.seniority.forEach((v) => chips.push({ k: 'seniority', v, label: v }));
    filters.job_titles.forEach((v) => chips.push({ k: 'job_titles', v, label: v }));
    filters.departments.forEach((v) => chips.push({ k: 'departments', v, label: v }));
    INDUSTRY_OPTIONS.forEach((o) => {
      if (o.values.some((x) => filters.industries.includes(x))) chips.push({ k: 'industry', v: o.label, label: o.label });
    });
    extraIndustries.forEach((v) => chips.push({ k: 'industries', v, label: v }));
    filters.locations.forEach((v) => chips.push({ k: 'locations', v, label: v }));
    filters.company_names.forEach((v) => chips.push({ k: 'company_names', v, label: `Company: ${v}` }));
    if (filters.min_employees) chips.push({ k: 'min_employees', v: 0, label: `${filters.min_employees}+ employees` });
    if (filters.keywords) chips.push({ k: 'keywords', v: '', label: `Keyword: ${filters.keywords}` });
    return chips;
  }, [filters, extraIndustries]);

  const removeChip = (c) => {
    if (c.k === 'industry') {
      const opt = INDUSTRY_OPTIONS.find((o) => o.label === c.v);
      setF({ industries: filters.industries.filter((x) => !opt.values.includes(x)) });
    } else if (c.k === 'min_employees') setF({ min_employees: 0 });
    else if (c.k === 'keywords') setF({ keywords: '' });
    else setF({ [c.k]: filters[c.k].filter((x) => x !== c.v) });
  };

  const toggleIndustry = (opt) => {
    const on = opt.values.some((x) => filters.industries.includes(x));
    setF({ industries: on ? filters.industries.filter((x) => !opt.values.includes(x)) : [...filters.industries, ...opt.values] });
  };

  const remember = (text) => {
    const next = [text, ...recent.filter((r) => r !== text)].slice(0, 5);
    setRecent(next);
    try { localStorage.setItem('vrm_lf_recent', JSON.stringify(next)); } catch { /* ignore */ }
  };

  const runSearch = async (f, more = false) => {
    if (more) setLoadingMore(true); else setStatus('searching');
    setNotice('');
    try {
      const exclude = more ? [...seen, ...rows.map((r) => r.id)] : seen;
      const found = await (await postJson('/api/rocketreach/search', {
        criteria: { ...f, limit }, exclude_ids: exclude, start: more ? nextStart : 1,
      })).json();
      const incoming = found.results || [];
      if (more) {
        const have = new Set(rows.map((r) => r.id));
        setRows([...rows, ...incoming.filter((r) => !have.has(r.id))]);
      } else {
        setRows(incoming);
        setSelected([]);
      }
      setNextStart(found.next_start || 0);
      setSkipped(found.skipped || { seen: 0, in_leads: 0 });
      setMock(Boolean(found.mock));
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    } finally {
      setLoadingMore(false);
    }
  };

  // Send: if something is typed, the AI fills the filters first; otherwise the ticked filters are searched.
  const submit = async (text) => {
    const message = (text ?? prompt).trim();
    setError('');
    if (!message) { await runSearch(filters); return; }
    remember(message);
    setStatus('parsing');
    try {
      const parsed = await (await postJson('/api/rocketreach/parse', { prompt: message, limit })).json();
      const c = parsed.criteria || {};
      const next = {
        job_titles: c.job_titles || [], seniority: c.seniority || [], departments: c.departments || [],
        locations: c.locations || [], industries: c.industries || [], company_names: c.company_names || [],
        min_employees: Number(c.min_employees) || 0, keywords: c.keywords || '',
      };
      setFilters(next);
      setVia(parsed.via || '');
      setPrompt('');
      await runSearch(next);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const clearAll = () => setFilters(EMPTY_FILTERS);

  const toggleRow = (id) => setSelected((s) => toggleIn(s, id));
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((r) => r.id));

  const reveal = async () => {
    const ids = rows.filter((r) => selected.includes(r.id) && !r.revealed).map((r) => r.id);
    if (!ids.length) { setNotice('Tick people whose email and phone are still hidden.'); return; }
    if (!mock && !window.confirm(`Reveal email and phone for ${ids.length} people? This uses RocketReach credits.`)) return;
    setRevealing(true);
    setNotice('');
    try {
      const data = await (await postJson('/api/rocketreach/reveal', { ids })).json();
      const byId = new Map((data.results || []).map((r) => [r.id, r]));
      const firstErr = (data.results || []).find((r) => r.error)?.error;
      let merged = rows.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r));
      let dropped = 0;
      if (onlyPhone) {
        const before = merged.length;
        merged = merged.filter((r) => !byId.has(r.id) || r.phone);
        dropped = before - merged.length;
      }
      setRows(merged);
      markSeen([...byId.keys()]);
      setSelected((s) => s.filter((id) => merged.some((r) => r.id === id)));
      if (onlyPhone && dropped) setNotice(`${dropped} people removed because no phone number was found.`);
      else if (firstErr) setNotice(firstErr);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setRevealing(false);
    }
  };

  const exportLeads = async () => {
    setExportMsg('');
    if (!rows.length) { setExportMsg('Search for leads first, then export.'); return; }
    if (!source && !userId) { setExportMsg('Please select both a Source and an Assigned User before exporting.'); return; }
    if (!source) { setExportMsg('Please select a Source before exporting.'); return; }
    if (!userId) { setExportMsg('Please select an Assigned User before exporting.'); return; }
    const chosen = rows.filter((r) => selected.includes(r.id));
    const out = chosen.length ? chosen : rows;
    setExporting(true);
    try {
      const res = await postJson('/api/rocketreach/export', { rows: out, source, user_id: userId });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = 'leads_template.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      markSeen(out.map((r) => r.id));
    } catch (err) {
      setExportMsg(err.message);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => { if (status === 'done' || status === 'error') window.scrollTo({ top: 0, behavior: 'smooth' }); }, [status]);

  // ---------------- filter panel ----------------
  const filterPanel = (
    <div style={{ ...card, padding: '0.8rem 0.9rem', alignSelf: 'start', position: 'sticky', top: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 800, color: V.strong, fontSize: '0.95rem' }}>Search filters</span>
        <button type="button" onClick={clearAll} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Clear all</button>
        <button type="button" onClick={() => setPanelOpen(false)} title="Hide filters" aria-label="Hide filters" style={{ background: 'none', border: 'none', cursor: 'pointer', color: V.muted, display: 'flex' }}>
          <PanelLeftClose size={18} />
        </button>
      </div>

      <Section title="Seniority" count={filters.seniority.length} {...sec('seniority')}>
        {SENIORITY_OPTIONS.map((o) => <Check key={o} label={o} checked={filters.seniority.includes(o)} onChange={() => setF({ seniority: toggleIn(filters.seniority, o) })} />)}
      </Section>
      <Section title="Job title" count={filters.job_titles.length} {...sec('title')}>
        {[...TITLE_OPTIONS, ...extra(filters.job_titles, TITLE_OPTIONS)].map((o) => <Check key={o} label={o} checked={filters.job_titles.includes(o)} onChange={() => setF({ job_titles: toggleIn(filters.job_titles, o) })} />)}
      </Section>
      <Section title="Department" count={filters.departments.length} {...sec('dept')}>
        {[...DEPARTMENT_OPTIONS, ...extra(filters.departments, DEPARTMENT_OPTIONS)].map((o) => <Check key={o} label={o} checked={filters.departments.includes(o)} onChange={() => setF({ departments: toggleIn(filters.departments, o) })} />)}
      </Section>
      <Section title="Industry" count={INDUSTRY_OPTIONS.filter((o) => o.values.some((x) => filters.industries.includes(x))).length + extraIndustries.length} {...sec('industry')}>
        {INDUSTRY_OPTIONS.map((o) => <Check key={o.label} label={o.label} checked={o.values.some((x) => filters.industries.includes(x))} onChange={() => toggleIndustry(o)} />)}
        {extraIndustries.map((o) => <Check key={o} label={o} checked onChange={() => setF({ industries: filters.industries.filter((x) => x !== o) })} />)}
      </Section>
      <Section title="Location" count={filters.locations.length} {...sec('location')}>
        {[...LOCATION_OPTIONS, ...extra(filters.locations, LOCATION_OPTIONS)].map((o) => <Check key={o} label={o} checked={filters.locations.includes(o)} onChange={() => setF({ locations: toggleIn(filters.locations, o) })} />)}
      </Section>
      <Section title="Company size" count={filters.min_employees ? 1 : 0} {...sec('size')}>
        <select value={filters.min_employees} onChange={(e) => setF({ min_employees: Number(e.target.value) })} style={{ ...sel, width: '100%' }} aria-label="Company size">
          {SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Section>

      <button type="button" style={{ ...btn('#2563eb', busy), width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy} onClick={() => submit('')}>
        <Search size={15} /> Search with these filters
      </button>
    </div>
  );

  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* header + export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: 8, color: V.strong }}>
            <Sparkles size={22} color="#7c3aed" /> Lead Finder
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: V.muted, fontSize: '0.9rem' }}>
            Pick filters or describe who you want, reveal their contacts, then export with a Source and an Assigned User.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={lbl}>
            Source:
            <select value={source} onChange={(e) => { setSource(e.target.value); setExportMsg(''); }} aria-label="Select Source" style={sel}>
              <option value="">Select Source</option>
              {SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label style={lbl}>
            Assigned User:
            <select value={userId} onChange={(e) => { setUserId(e.target.value); setExportMsg(''); }} aria-label="Select User" style={sel}>
              <option value="">Select User</option>
              {users.map((u) => <option key={u.id} value={u.id}>{userName(u)}</option>)}
            </select>
          </label>
          {usersQuery.isError && (
            <button type="button" onClick={() => usersQuery.refetch()} style={{ color: '#b91c1c', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Could not load users: {usersQuery.error?.message} (retry)
            </button>
          )}
          <button type="button" style={btn('#2563eb', exporting)} disabled={exporting} onClick={exportLeads}>
            <Download size={15} /> {exporting ? 'Exporting...' : 'Export Leads'}
          </button>
        </div>
        {exportMsg && <div style={{ flexBasis: '100%', color: '#b45309', fontSize: '0.85rem' }}>{exportMsg}</div>}
      </div>

      {/* search bar */}
      <div style={{ ...card, padding: '0.7rem 0.8rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (!busy) submit(); }}
          style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe who you want (optional), e.g. Decision makers at BPO companies in Chennai"
            style={{ flex: 1, minWidth: 260, padding: '0.6rem 0.75rem', border: `1px solid ${V.border}`, borderRadius: 10, fontSize: '0.92rem', background: V.surface, color: V.strong }}
          />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="How many leads" style={sel}>
            {[5, 10, 15, 25, 50].map((n) => <option key={n} value={n}>{n} leads</option>)}
          </select>
          <label style={{ ...lbl, fontWeight: 500 }}>
            <input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} /> Only with phone
          </label>
          <button type="submit" style={btn('#2563eb', busy)} disabled={busy}>
            <Send size={15} /> {busy ? (status === 'parsing' ? 'Reading...' : 'Searching...') : 'Send'}
          </button>
        </form>
        {recent.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: V.muted }}>Recent:</span>
            {recent.map((r) => (
              <button key={r} type="button" onClick={() => setPrompt(r)} title={r}
                style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0.2rem 0.6rem', borderRadius: 999, border: `1px solid ${V.border}`, background: V.hover, color: V.text, fontSize: '0.75rem', cursor: 'pointer' }}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      <PromptLibrary onPick={setPrompt} />

      {/* filters + results */}
      <div style={{ display: 'grid', gridTemplateColumns: panelOpen ? 'minmax(240px, 280px) minmax(0, 1fr)' : '44px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        {panelOpen ? filterPanel : (
          <button type="button" onClick={() => setPanelOpen(true)} title="Show filters" aria-label="Show filters"
            style={{ ...card, padding: '0.6rem 0', cursor: 'pointer', color: V.muted, display: 'flex', justifyContent: 'center' }}>
            <PanelLeftOpen size={18} />
          </button>
        )}

        <div style={{ ...card, minWidth: 0, overflow: 'hidden' }}>
          {/* selected filters */}
          {activeChips.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0.7rem 0.9rem 0', alignItems: 'center' }}>
              {activeChips.map((c) => (
                <span key={`${c.k}-${c.v}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.15rem 0.3rem 0.15rem 0.6rem', borderRadius: 999, background: V.accent, color: V.strong, fontSize: '0.76rem', border: `1px solid ${V.border}` }}>
                  {c.label}
                  <button type="button" onClick={() => removeChip(c)} aria-label={`Remove ${c.label}`} style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: V.muted, padding: 2 }}><X size={12} /></button>
                </span>
              ))}
              {via && <span style={{ fontSize: '0.72rem', color: V.muted }}>(read by {via === 'basic' ? 'basic reader' : via})</span>}
            </div>
          )}

          {/* action bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '0.7rem 0.9rem', position: 'sticky', top: 0, background: V.surface, zIndex: 3, borderBottom: `1px solid ${V.border}` }}>
            <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} disabled={!rows.length} />
            <span style={{ color: V.text, fontSize: '0.85rem' }}>{rows.length} found, {selected.length} selected</span>
            <button type="button" style={btn('#7c3aed', revealing || !rows.length)} disabled={revealing || !rows.length} onClick={reveal}>
              <Unlock size={15} /> {revealing ? 'Revealing...' : 'Reveal email & phone'}
            </button>
          </div>
          {notice && <div style={{ color: '#b45309', fontSize: '0.82rem', padding: '0.5rem 0.9rem 0' }}>{notice}</div>}
          {status === 'done' && (skipped.in_leads > 0 || skipped.seen > 0 || seen.length > 0) && (
            <div style={{ color: V.muted, fontSize: '0.78rem', padding: '0.4rem 0.9rem 0' }}>
              {skipped.in_leads > 0 && `${skipped.in_leads} already in your Leads were skipped. `}
              {skipped.seen > 0 && `${skipped.seen} you already revealed or exported were skipped. `}
              {seen.length > 0 && (
                <button type="button" onClick={resetSeen} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.78rem', padding: 0, textDecoration: 'underline' }}>
                  Show them again ({seen.length} hidden)
                </button>
              )}
            </div>
          )}

          {mock && (
            <div style={{ background: 'rgba(245, 158, 11, 0.14)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#b45309', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.82rem', margin: '0.6rem 0.9rem 0' }}>
              Test mode: no RocketReach key is set, so these are sample people, not real.
            </div>
          )}

          {status === 'idle' && <div style={{ padding: '2rem 1rem', color: V.muted, textAlign: 'center' }}>Tick some filters on the left, or describe who you want above, then press Search.</div>}
          {busy && <div style={{ padding: '2rem 1rem', color: V.muted, textAlign: 'center' }}>{status === 'parsing' ? 'Reading your request...' : 'Searching RocketReach...'}</div>}
          {status === 'error' && <div style={{ padding: '1rem 0.9rem', color: '#ef4444', fontSize: '0.88rem' }}>{error}</div>}
          {status === 'done' && rows.length === 0 && <div style={{ padding: '2rem 1rem', color: V.muted, textAlign: 'center' }}>No people matched. Remove a filter or try a broader search.</div>}

          {status === 'done' && rows.length > 0 && (
            <div style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: V.muted, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '8px 10px', width: 36, position: 'sticky', top: 0, background: 'var(--surface-sunken, #f8fafc)' }} />
                    <th style={{ padding: '8px 10px', position: 'sticky', top: 0, background: 'var(--surface-sunken, #f8fafc)' }}>Person</th>
                    <th style={{ padding: '8px 10px', position: 'sticky', top: 0, background: 'var(--surface-sunken, #f8fafc)' }}>Company</th>
                    <th style={{ padding: '8px 10px', position: 'sticky', top: 0, background: 'var(--surface-sunken, #f8fafc)' }}>Contact</th>
                    <th style={{ padding: '8px 10px', position: 'sticky', top: 0, background: 'var(--surface-sunken, #f8fafc)' }}>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${V.border}`, background: selected.includes(r.id) ? V.accent : 'transparent' }}>
                      <td style={{ padding: '10px' }}>
                        <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.includes(r.id)} onChange={() => toggleRow(r.id)} />
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 700, color: V.strong }}>{r.name}</div>
                        <div style={{ color: V.muted, fontSize: '0.8rem' }}>{r.role || '-'}</div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 600, color: V.strong }}>{r.company || '-'}</div>
                        <div style={{ color: V.muted, fontSize: '0.8rem' }}>{r.location || ''}</div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {r.revealed || r.email || r.phone ? (
                          <>
                            <div style={{ color: V.strong }}>{r.email || <span style={{ color: V.muted }}>No email</span>}</div>
                            <div style={{ color: V.strong }}>{r.phone || <span style={{ color: V.muted }}>No phone found</span>}</div>
                          </>
                        ) : (
                          <span style={{ color: V.muted }}>Hidden</span>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {r.linkedin_url ? <a href={r.linkedin_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb' }}>LinkedIn <ExternalLink size={12} /></a> : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {nextStart > 0 && (
                <div style={{ padding: '0.8rem', textAlign: 'center' }}>
                  <button type="button" style={btn('#2563eb', loadingMore)} disabled={loadingMore} onClick={() => runSearch(filters, true)}>
                    {loadingMore ? 'Finding more...' : `Find ${limit} more new people`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}