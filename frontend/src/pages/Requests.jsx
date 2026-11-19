import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, X } from 'lucide-react';
import { getUser, isSuperAdmin } from '../utils/auth';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${BACKEND_BASE_URL}${path}`;

const fmt = (v) => (v ? new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const who = (u, t) => `${u}${t ? ` (${t})` : ''}`;

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.9rem 1.1rem', minWidth: '140px' };
const th = { textAlign: 'left', padding: '0.55rem 0.7rem', fontSize: '0.74rem', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td = { padding: '0.55rem 0.7rem', fontSize: '0.85rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
const input = { padding: '0.45rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem', background: '#fff' };

function StatusPill({ status }) {
  const done = status === 'done';
  return (
    <span style={{ padding: '0.12rem 0.55rem', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 600, background: done ? '#dcfce7' : '#fef3c7', color: done ? '#166534' : '#92400e' }}>
      {done ? 'Done' : 'Pending'}
    </span>
  );
}

export default function Requests() {
  const queryClient = useQueryClient();
  const superAdmin = isSuperAdmin();
  const me = getUser();
  const [tab, setTab] = useState('received');
  const [modal, setModal] = useState(false);
  const [toUser, setToUser] = useState('');
  const [count, setCount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({ status: '', user: '', from: '', to: '' });

  const mineQuery = useQuery({
    queryKey: ['lead-requests-mine'],
    queryFn: async () => {
      const r = await fetch(apiUrl('/api/requests/mine'));
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || 'Failed to load requests.');
      return d.data;
    },
  });
  const usersQuery = useQuery({
    queryKey: ['lead-request-users'],
    enabled: modal || (superAdmin && tab === 'all'),
    queryFn: async () => {
      const r = await fetch(apiUrl('/api/requests/users'));
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || 'Failed to load users.');
      return d.data;
    },
  });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const allQuery = useQuery({
    queryKey: ['lead-requests-all', qs],
    enabled: superAdmin && tab === 'all',
    queryFn: async () => {
      const r = await fetch(apiUrl(`/api/requests/all?${qs}`));
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || 'Failed to load requests.');
      return d;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-requests-mine'] });
    queryClient.invalidateQueries({ queryKey: ['lead-requests-all'] });
  };

  const submit = async () => {
    setFormError('');
    if (!toUser) return setFormError('Choose who to ask.');
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 1000) return setFormError('Enter a number of leads between 1 and 1000.');
    setSaving(true);
    try {
      const r = await fetch(apiUrl('/api/requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_user_id: Number(toUser), leads_requested: n, note }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || 'Failed to send the request.');
      setModal(false); setToUser(''); setCount(''); setNote('');
      setNotice('Request sent.'); setTab('sent'); refresh();
      setTimeout(() => setNotice(''), 3000);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (id) => {
    const r = await fetch(apiUrl(`/api/requests/${id}/done`), { method: 'PATCH' });
    const d = await r.json().catch(() => null);
    if (!r.ok) { setNotice(d?.error || 'Failed to update.'); setTimeout(() => setNotice(''), 3000); return; }
    refresh();
  };

  const download = async () => {
    const r = await fetch(apiUrl(`/api/requests/export?${qs}`));
    if (!r.ok) { setNotice('Download failed.'); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lead-requests.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const mine = mineQuery.data;
  const tabBtn = (key, label, extra) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      style={{ padding: '0.45rem 1rem', borderRadius: '8px', border: '1px solid ' + (tab === key ? '#2563eb' : '#cbd5e1'), background: tab === key ? '#2563eb' : '#fff', color: tab === key ? '#fff' : '#334155', fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer' }}
    >
      {label}{extra}
    </button>
  );

  const list = tab === 'received' ? mine?.received : mine?.sent;

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Lead Requests</h1>
          <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Ask a teammate for leads, and see who asked you.</div>
        </div>
        <button type="button" onClick={() => { setFormError(''); setModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={15} /> Request leads
        </button>
      </div>

      {notice && <div role="status" style={{ marginBottom: '0.75rem', padding: '0.5rem 0.8rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '0.85rem' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {tabBtn('received', 'Received', mine?.pending_received ? ` (${mine.pending_received} pending)` : '')}
        {tabBtn('sent', 'Sent', '')}
        {superAdmin && tabBtn('all', 'All requests', '')}
      </div>

      {tab !== 'all' && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
          {mineQuery.isLoading && <div style={{ padding: '1.5rem' }}>Loading…</div>}
          {mineQuery.isError && <div role="alert" style={{ padding: '1.5rem', color: '#b91c1c' }}>{mineQuery.error.message}</div>}
          {mine && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Request</th><th style={th}>Leads</th><th style={th}>Note</th><th style={th}>Date</th><th style={th}>Status</th><th style={th} />
                </tr>
              </thead>
              <tbody>
                {(list || []).map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{tab === 'received' ? <><strong>{r.from_user}</strong> asked you</> : <>You asked <strong>{r.to_user}</strong></>}</td>
                    <td style={td}>{r.leads_requested}</td>
                    <td style={{ ...td, maxWidth: '280px' }}>{r.note || '-'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                    <td style={td}><StatusPill status={r.status} />{r.done_at ? <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmt(r.done_at)}</div> : null}</td>
                    <td style={td}>
                      {tab === 'received' && r.status === 'pending' && (
                        <button type="button" onClick={() => markDone(r.id)} style={{ padding: '0.3rem 0.8rem', borderRadius: '8px', border: '1px solid #16a34a', background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>Done</button>
                      )}
                    </td>
                  </tr>
                ))}
                {(list || []).length === 0 && <tr><td colSpan="6" style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No requests yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'all' && superAdmin && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
            <select style={input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option><option value="pending">Pending</option><option value="done">Done</option>
            </select>
            <select style={input} value={filters.user} onChange={(e) => setFilters({ ...filters, user: e.target.value })}>
              <option value="">All users</option>
              {(usersQuery.data || []).map((u) => <option key={u.id} value={u.id}>{u.employee_name}</option>)}
              {me && <option value={me.id}>{me.employee_name || 'Me'} (me)</option>}
            </select>
            <input style={input} type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="From date" />
            <input style={input} type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="To date" />
            <button type="button" onClick={download} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer' }}>
              <Download size={14} /> Excel
            </button>
          </div>

          {allQuery.isLoading && <div>Loading…</div>}
          {allQuery.isError && <div role="alert" style={{ color: '#b91c1c' }}>{allQuery.error.message}</div>}
          {allQuery.data && (
            <>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {[['Total requests', allQuery.data.summary.total], ['Pending', allQuery.data.summary.pending], ['Done', allQuery.data.summary.done], ['Total leads asked', allQuery.data.summary.leads_asked]].map(([label, val]) => (
                  <div key={label} style={card}>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{label}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{val}</div>
                  </div>
                ))}
              </div>

              <h2 style={{ fontSize: '1rem', margin: '0.5rem 0' }}>Per user</h2>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto', marginBottom: '1.25rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>User</th><th style={th}>Team</th><th style={th}>Requests sent</th><th style={th}>Requests received</th><th style={th}>Leads asked</th><th style={th}>Leads asked from them</th><th style={th}>Pending</th><th style={th}>Done</th>
                  </tr></thead>
                  <tbody>
                    {allQuery.data.per_user.map((u) => (
                      <tr key={u.user_id}>
                        <td style={td}>{u.user}</td><td style={td}>{u.team || '-'}</td><td style={td}>{u.sent}</td><td style={td}>{u.received}</td><td style={td}>{u.leads_asked}</td><td style={td}>{u.leads_received}</td><td style={td}>{u.pending}</td><td style={td}>{u.done}</td>
                      </tr>
                    ))}
                    {allQuery.data.per_user.length === 0 && <tr><td colSpan="8" style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>No data.</td></tr>}
                  </tbody>
                </table>
              </div>

              <h2 style={{ fontSize: '1rem', margin: '0.5rem 0' }}>All requests</h2>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>Date</th><th style={th}>From</th><th style={th}>To</th><th style={th}>Leads</th><th style={th}>Note</th><th style={th}>Status</th><th style={th}>Done on</th>
                  </tr></thead>
                  <tbody>
                    {allQuery.data.data.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                        <td style={td}>{who(r.from_user, r.from_team)}</td>
                        <td style={td}>{who(r.to_user, r.to_team)}</td>
                        <td style={td}>{r.leads_requested}</td>
                        <td style={{ ...td, maxWidth: '260px' }}>{r.note || '-'}</td>
                        <td style={td}><StatusPill status={r.status} /></td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(r.done_at)}</td>
                      </tr>
                    ))}
                    {allQuery.data.data.length === 0 && <tr><td colSpan="7" style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No requests found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {modal && (
        <div onClick={() => setModal(false)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', background: '#fff', borderRadius: '16px', padding: '1.25rem', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
              <strong style={{ fontSize: '1.05rem' }}>Request leads</strong>
              <button type="button" aria-label="Close" onClick={() => setModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>Ask who</label>
            <select style={{ ...input, width: '100%', marginBottom: '0.8rem' }} value={toUser} onChange={(e) => setToUser(e.target.value)}>
              <option value="">Select a user</option>
              {(usersQuery.data || []).map((u) => <option key={u.id} value={u.id}>{u.employee_name}{u.team_name ? ` (${u.team_name})` : ''}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>Number of leads</label>
            <input style={{ ...input, width: '100%', marginBottom: '0.8rem', boxSizing: 'border-box' }} type="number" min="1" max="1000" value={count} onChange={(e) => setCount(e.target.value)} />
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>Note (optional)</label>
            <textarea style={{ ...input, width: '100%', minHeight: '70px', boxSizing: 'border-box' }} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            {formError && <div role="alert" style={{ color: '#b91c1c', fontSize: '0.84rem', marginTop: '0.5rem' }}>{formError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" onClick={() => setModal(false)} style={{ padding: '0.45rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f1f5f9', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" disabled={saving} onClick={submit} style={{ padding: '0.45rem 1rem', borderRadius: '8px', border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Sending…' : 'Send request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
