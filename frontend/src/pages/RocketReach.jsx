import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, Download, Unlock, Sparkles } from 'lucide-react';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${BACKEND_BASE_URL}${path}`;

const SOURCE_OPTIONS = ['Non-IT', 'IT', 'Recruitment', 'BPO'];

const EXAMPLES = [
  'Build a list of VPs of Marketing in the US at SaaS companies with 500+ employees',
  'Find CTOs at fintech companies in India',
  'HR managers in Chennai at companies with 200+ employees',
];

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1rem' };
const btn = (bg, disabled) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.85rem', border: 'none', borderRadius: 8,
  background: disabled ? '#94a3b8' : bg, color: '#fff', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.85rem',
});

const lbl = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: '#334155' };
const sel = { padding: '0.45rem 0.6rem', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem', background: '#fff' };

const criteriaRows = (c) => {
  const rows = [];
  if (c.job_titles?.length) rows.push(['Job title', c.job_titles.join(', ')]);
  if (c.seniority?.length) rows.push(['Seniority', c.seniority.join(', ')]);
  if (c.departments?.length) rows.push(['Department', c.departments.join(', ')]);
  if (c.locations?.length) rows.push(['Location', c.locations.join(', ')]);
  if (c.industries?.length) rows.push(['Industry', c.industries.join(', ')]);
  if (c.company_names?.length) rows.push(['Company', c.company_names.join(', ')]);
  if (c.min_employees) rows.push(['Company size', `${c.min_employees}+ employees`]);
  if (c.keywords) rows.push(['Keywords', c.keywords]);
  rows.push(['Results wanted', String(c.limit)]);
  return rows;
};

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

export default function RocketReach() {
  const [turns, setTurns] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [limit, setLimit] = useState(10);
  const [source, setSource] = useState('');
  const [userId, setUserId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const endRef = useRef(null);

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const patch = (id, changes) => setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...changes } : t)));

  const submit = async (text) => {
    const message = (text ?? prompt).trim();
    if (!message) return;
    const id = Date.now();
    setPrompt('');
    setTurns((all) => [...all, { id, prompt: message, status: 'parsing', rows: [], selected: [] }]);
    try {
      const parsed = await (await postJson('/api/rocketreach/parse', { prompt: message, limit })).json();
      patch(id, { criteria: parsed.criteria, via: parsed.via, status: 'searching' });
      const found = await (await postJson('/api/rocketreach/search', { criteria: parsed.criteria })).json();
      patch(id, { rows: found.results || [], mock: Boolean(found.mock), status: 'done' });
    } catch (err) {
      patch(id, { status: 'error', error: err.message });
    }
  };

  const toggle = (turn, rid) => {
    const set = new Set(turn.selected);
    if (set.has(rid)) set.delete(rid); else set.add(rid);
    patch(turn.id, { selected: [...set] });
  };
  const toggleAll = (turn) => {
    const all = turn.selected.length === turn.rows.length;
    patch(turn.id, { selected: all ? [] : turn.rows.map((r) => r.id) });
  };

  const reveal = async (turn) => {
    const ids = turn.rows.filter((r) => turn.selected.includes(r.id) && !r.revealed).map((r) => r.id);
    if (!ids.length) { patch(turn.id, { notice: 'Tick people whose email and phone are still hidden.' }); return; }
    if (!turn.mock && !window.confirm(`Reveal email and phone for ${ids.length} people? This uses RocketReach credits.`)) return;
    patch(turn.id, { revealing: true, notice: '' });
    try {
      const data = await (await postJson('/api/rocketreach/reveal', { ids })).json();
      const byId = new Map((data.results || []).map((r) => [r.id, r]));
      setTurns((all) => all.map((t) => (t.id === turn.id
        ? { ...t, revealing: false, rows: t.rows.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r)) }
        : t)));
    } catch (err) {
      patch(turn.id, { revealing: false, notice: err.message });
    }
  };

  // Leads from the most recent finished search (ticked ones only, if any are ticked).
  const exportTurn = [...turns].reverse().find((t) => t.status === 'done' && t.rows.length > 0);

  const exportLeads = async () => {
    setExportMsg('');
    if (!exportTurn) { setExportMsg('Search for leads first, then export.'); return; }
    if (!source && !userId) { setExportMsg('Please select both a Source and an Assigned User before exporting.'); return; }
    if (!source) { setExportMsg('Please select a Source before exporting.'); return; }
    if (!userId) { setExportMsg('Please select an Assigned User before exporting.'); return; }
    const chosen = exportTurn.rows.filter((r) => exportTurn.selected.includes(r.id));
    const rows = chosen.length ? chosen : exportTurn.rows;
    setExporting(true);
    try {
      const res = await postJson('/api/rocketreach/export', { rows, source, user_id: userId });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = 'leads_template.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportMsg(err.message);
    } finally {
      setExporting(false);
    }
  };

  const busy = turns.some((t) => t.status === 'parsing' || t.status === 'searching');

  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={22} color="#7c3aed" /> Lead Finder
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Describe the people you want, then export them with a Source and an Assigned User.
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

      {turns.length === 0 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Try one of these</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => submit(ex)} style={{ textAlign: 'left', padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', fontSize: '0.88rem' }}>
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.map((turn) => (
        <div key={turn.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: '#2563eb', color: '#fff', padding: '0.65rem 0.9rem', borderRadius: '14px 14px 2px 14px', fontSize: '0.92rem' }}>
            {turn.prompt}
          </div>

          <div style={card}>
            {turn.status === 'parsing' && <div style={{ color: '#64748b' }}>Reading your request...</div>}

            {turn.criteria && (
              <>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Search criteria <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '0.78rem' }}>({turn.via === 'claude' ? 'understood by Claude' : 'basic reader'})</span>
                </div>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.86rem', marginBottom: 10 }}>
                  <tbody>
                    {criteriaRows(turn.criteria).map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '4px 20px 4px 0', color: '#64748b' }}>{k}</td>
                        <td style={{ padding: '4px 0', fontWeight: 500 }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {turn.status === 'searching' && <div style={{ color: '#64748b' }}>Searching RocketReach...</div>}
            {turn.status === 'error' && <div style={{ color: '#b91c1c', fontSize: '0.88rem' }}>{turn.error}</div>}

            {turn.status === 'done' && (
              <>
                {turn.mock && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.82rem', marginBottom: 10 }}>
                    Test mode: no RocketReach key is set, so these are sample people, not real.
                  </div>
                )}
                {turn.rows.length === 0 ? (
                  <div style={{ color: '#64748b' }}>No people matched. Try a broader request.</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ color: '#475569', fontSize: '0.85rem' }}>{turn.rows.length} found, {turn.selected.length} selected</span>
                      <button type="button" style={btn('#7c3aed', turn.revealing)} disabled={turn.revealing} onClick={() => reveal(turn)}>
                        <Unlock size={15} /> {turn.revealing ? 'Revealing...' : 'Reveal email & phone'}
                      </button>
                    </div>
                    {turn.notice && <div style={{ color: '#b45309', fontSize: '0.82rem', marginBottom: 8 }}>{turn.notice}</div>}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '6px' }}>
                              <input type="checkbox" aria-label="Select all" checked={turn.selected.length === turn.rows.length} onChange={() => toggleAll(turn)} />
                            </th>
                            <th>Name</th><th>Company</th><th>Role</th><th>Email</th><th>Phone</th><th>LinkedIn</th>
                          </tr>
                        </thead>
                        <tbody>
                          {turn.rows.map((r) => (
                            <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px' }}>
                                <input type="checkbox" aria-label={`Select ${r.name}`} checked={turn.selected.includes(r.id)} onChange={() => toggle(turn, r.id)} />
                              </td>
                              <td style={{ fontWeight: 600 }}>{r.name}</td>
                              <td>{r.company || '-'}</td>
                              <td>{r.role || '-'}</td>
                              <td>{r.email || <span style={{ color: '#94a3b8' }}>hidden</span>}</td>
                              <td>{r.phone || <span style={{ color: '#94a3b8' }}>hidden</span>}</td>
                              <td>{r.linkedin_url ? <a href={r.linkedin_url} target="_blank" rel="noreferrer">Profile</a> : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ))}

      <div ref={endRef} />

      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        style={{ ...card, position: 'sticky', bottom: 8, display: 'flex', gap: 8, alignItems: 'flex-end', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) submit(); } }}
          rows={2}
          placeholder="e.g. Build a list of VPs of Marketing in the US at SaaS companies with 500+ employees"
          style={{ flex: 1, padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: '0.92rem', resize: 'none', fontFamily: 'inherit' }}
        />
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="How many leads" style={{ padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: 8 }}>
          {[5, 10, 15, 25].map((n) => <option key={n} value={n}>{n} leads</option>)}
        </select>
        <button type="submit" style={btn('#2563eb', busy || !prompt.trim())} disabled={busy || !prompt.trim()}>
          <Send size={15} /> Send
        </button>
      </form>
    </div>
  );
}
