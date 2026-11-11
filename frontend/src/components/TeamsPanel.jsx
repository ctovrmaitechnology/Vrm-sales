import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Check, X, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;

const cardStyle = {
  background: '#ffffff',
  borderRadius: '16px',
  border: '1px solid rgba(220, 234, 250, 0.95)',
  boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
  padding: '1.25rem 1.5rem',
  marginBottom: '1.5rem',
};
const inputStyle = {
  padding: '0.5rem 0.8rem',
  border: '1.5px solid #cbd5e1',
  borderRadius: '10px',
  fontSize: '0.875rem',
  background: '#f8fafc',
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
};
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0',
  background: '#fff', color: '#475569', cursor: 'pointer',
};
const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.95rem',
  borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff',
  fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
};

async function request(path, options) {
  const response = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Request failed.');
  return result;
}

const TeamCard = ({ team, unassigned, run }) => {
  const [editing, setEditing] = useState(false);
  
  const [name, setName] = useState(team.name);
  const [pick, setPick] = useState('');
  const [newName, setNewName] = useState('');

  const saveName = async () => {
    const ok = await run(() => request(`/api/teams/${team.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }));
    if (ok) setEditing(false);
  };
  const addExisting = async () => {
    if (!pick) return;
    const ok = await run(() => request(`/api/teams/${team.id}/members`, { method: 'POST', body: JSON.stringify({ user_id: Number(pick) }) }));
    if (ok) setPick('');
  };
  const addNew = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const ok = await run(() => request(`/api/teams/${team.id}/members`, { method: 'POST', body: JSON.stringify({ employee_name: newName }) }));
    if (ok) setNewName('');
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '1rem', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {editing ? (
          <>
            <input
              value={name}
              maxLength={100}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditing(false); setName(team.name); } }}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <button type="button" title="Save name" style={{ ...iconBtn, color: '#15803d' }} onClick={saveName}><Check size={15} /></button>
            <button type="button" title="Cancel" style={iconBtn} onClick={() => { setEditing(false); setName(team.name); }}><X size={15} /></button>
          </>
        ) : (
          <>
            <UsersIcon size={16} color="#2563eb" />
            <span style={{ fontWeight: 700, color: '#0f172a', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{team.name}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 999, padding: '1px 8px' }}>{team.members.length}</span>
            <button type="button" title="Rename team" style={iconBtn} onClick={() => { setName(team.name); setEditing(true); }}><Pencil size={14} /></button>
            <button
              type="button"
              title="Delete team"
              style={{ ...iconBtn, color: '#b91c1c', borderColor: '#fecaca' }}
              onClick={() => {
                if (window.confirm(`Delete team "${team.name}"?\n\nIts members are kept and become unassigned.`)) {
                  run(() => request(`/api/teams/${team.id}`, { method: 'DELETE' }));
                }
              }}
            ><Trash2 size={14} /></button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {team.members.length === 0 && <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>No members yet.</span>}
        {team.members.map((m) => (
          <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #dbeafe', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: '0.8rem', fontWeight: 600, color: '#1e3a8a' }}>
            {m.employee_name}
            <button
              type="button"
              title={`Remove ${m.employee_name} from team`}
              onClick={() => run(() => request(`/api/teams/${team.id}/members/${m.id}`, { method: 'DELETE' }))}
              style={{ border: 'none', background: '#eff6ff', color: '#475569', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
            ><X size={11} /></button>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ ...inputStyle, flex: '1 1 150px', minWidth: 0, padding: '0.4rem 0.6rem' }}>
          <option value="">{unassigned.length ? 'Add existing user…' : 'No unassigned users'}</option>
          {unassigned.map((u) => <option key={u.id} value={u.id}>{u.employee_name}</option>)}
        </select>
        <button type="button" disabled={!pick} onClick={addExisting} style={{ ...primaryBtn, opacity: pick ? 1 : 0.5 }}><UserPlus size={14} /> Add</button>
      </div>
      <form onSubmit={addNew} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={newName} maxLength={255} onChange={(e) => setNewName(e.target.value)} placeholder="Or create a new user…" style={{ ...inputStyle, flex: '1 1 150px', minWidth: 0, padding: '0.4rem 0.6rem' }} />
        <button type="submit" disabled={!newName.trim()} style={{ ...primaryBtn, background: '#0f172a', opacity: newName.trim() ? 1 : 0.5 }}><Plus size={14} /> Create</button>
      </form>
    </div>
  );
};

const TeamsPanel = ({ onChanged }) => {
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState('');
    const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: async () => request('/api/teams'),
  });
  const teams = teamsQuery.data?.data || [];
  const unassigned = teamsQuery.data?.unassigned || [];

  // Runs an API call, refreshes data, shows errors. Returns true on success.
  const run = async (action) => {
    setMessage({ type: '', text: '' });
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      if (onChanged) onChanged();
      return true;
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      return false;
    }
  };

    const createTeam = async (e) => {
    e.preventDefault();
    if (!teamName.trim() || creating) return;
    setCreating(true);
    const ok = await run(() => request('/api/teams', { method: 'POST', body: JSON.stringify({ name: teamName }) }));
    if (ok) setTeamName('');
    setCreating(false);
  };
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Teams</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0' }}>
            Create teams, rename them, and add or remove users.
          </p>
        </div>
        <form onSubmit={createTeam} style={{ display: 'flex', gap: 8 }}>
          <input value={teamName} maxLength={100} onChange={(e) => setTeamName(e.target.value)} placeholder="New team name" style={{ ...inputStyle, width: 200 }} />
          <button type="submit" disabled={!teamName.trim()} style={{ ...primaryBtn, opacity: teamName.trim() ? 1 : 0.5 }}><Plus size={15} /> Add Team</button>
        </form>
      </div>

      {message.text && (
        <div role="alert" style={{ marginBottom: '0.85rem', padding: '0.6rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, fontSize: '0.85rem', fontWeight: 500 }}>
          {message.text}
        </div>
      )}
      {teamsQuery.error && (
        <div role="alert" style={{ marginBottom: '0.85rem', color: '#b91c1c', fontSize: '0.85rem' }}>{teamsQuery.error.message}</div>
      )}

      {teamsQuery.isLoading ? (
        <p style={{ color: '#94a3b8' }}>Loading teams…</p>
      ) : teams.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>No teams yet. Type a name above and click Add Team.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {teams.map((team) => <TeamCard key={team.id} team={team} unassigned={unassigned} run={run} />)}
        </div>
      )}
    </div>
  );
};

export default TeamsPanel;
