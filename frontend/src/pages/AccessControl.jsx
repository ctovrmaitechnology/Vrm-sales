import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, RefreshCw } from 'lucide-react';

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
  padding: '0.45rem 0.7rem', border: '1.5px solid #cbd5e1', borderRadius: 8,
  fontSize: '0.85rem', background: '#f8fafc', color: '#0f172a', outline: 'none', boxSizing: 'border-box',
};
const smallBtn = (bg, color, border) => ({
  padding: '0.35rem 0.7rem', borderRadius: 8, border: `1px solid ${border}`, background: bg, color,
  fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
});

const ROLE_OPTIONS = [
  { value: 'caller', label: 'Caller' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'admin', label: 'Admin' },
];
const STATUS = {
  none: { label: 'No login', bg: '#f1f5f9', color: '#475569' },
  no_password: { label: 'Waiting for employee to set password', bg: '#fffbeb', color: '#b45309' },
  pending: { label: 'Pending approval', bg: '#fff7ed', color: '#c2410c' },
  approved: { label: 'Approved', bg: '#f0fdf4', color: '#15803d' },
};

async function callApi(path, options) {
  const response = await fetch(apiUrl(path), options);
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Request failed.');
  return result;
}

const Row = ({ user, onSave, busy }) => {
  const [email, setEmail] = useState(user.email || '');
  const isSuper = user.role === 'super_admin';
  const status = isSuper ? STATUS.approved : (STATUS[user.login_status] || STATUS.none);
  const emailChanged = email.trim().toLowerCase() !== (user.email || '').toLowerCase();

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600, color: '#0f172a' }}>{user.employee_name}</div>
        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user.team_name || 'No team'}</div>
      </td>
      <td>
        {isSuper ? (
          <span style={{ fontSize: '0.85rem', color: '#0f172a' }}>{user.email}</span>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              style={{ ...inputStyle, width: 220 }}
            />
            {emailChanged && email.trim() && (
              <button type="button" disabled={busy} onClick={() => onSave(user, { email: email.trim() })} style={smallBtn('#2563eb', '#fff', '#2563eb')}>
                Save email
              </button>
            )}
          </div>
        )}
      </td>
      <td>
        {isSuper ? (
          <strong style={{ color: '#7e22ce' }}>Super Admin</strong>
        ) : (
          <select
            value={user.role || 'caller'}
            disabled={busy}
            onChange={(e) => onSave(user, { role: e.target.value })}
            style={inputStyle}
          >
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        )}
      </td>
      <td>
        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, background: status.bg, color: status.color, fontSize: '0.78rem', fontWeight: 600 }}>
          {status.label}
        </span>
        {user.last_login_at && (
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
            Last login {new Date(user.last_login_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </div>
        )}
      </td>
      <td style={{ textAlign: 'right' }}>
        {!isSuper && (
          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {user.login_status === 'pending' && (
              <button type="button" disabled={busy} onClick={() => onSave(user, { approve: true })} style={smallBtn('#16a34a', '#fff', '#16a34a')}>Approve</button>
            )}
            {user.login_status === 'approved' && (
              <button type="button" disabled={busy} onClick={() => onSave(user, { approve: false })} style={smallBtn('#fff7ed', '#c2410c', '#fed7aa')}>Revoke</button>
            )}
            {(user.login_status === 'approved' || user.login_status === 'pending') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (window.confirm(`Reset the password for ${user.employee_name}? They will set a new one and need approval again.`)) onSave(user, { reset_password: true }); }}
                style={smallBtn('#fff', '#334155', '#e2e8f0')}
              >
                Reset password
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
};

const AccessControl = () => {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const query = useQuery({
    queryKey: ['access-users'],
    queryFn: async () => (await callApi('/api/users/access')).data,
  });
  const users = query.data || [];
  const pendingCount = users.filter((u) => u.login_status === 'pending').length;

  const save = async (user, body) => {
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      const result = await callApi(`/api/users/${user.id}/login`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      queryClient.setQueryData(['access-users'], (current = []) => current.map((u) => (u.id === user.id ? result.data : u)));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setNotice(`Saved changes for ${user.employee_name}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={26} color="#7e22ce" /> Access Control
          </h1>
          <p className="page-subtitle">Register an employee's email, assign their role, and approve their login. Employees set their own password.</p>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          style={{ ...smallBtn('#fff', '#334155', '#cbd5e1'), display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.9rem' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ ...cardStyle, background: '#faf5ff', borderColor: '#e9d5ff' }}>
        <div style={{ fontSize: '0.85rem', color: '#581c87', lineHeight: 1.6 }}>
          <strong>How it works:</strong> 1) Type the employee's email and choose their role. 2) Tell them to open the login page and click
          "First time? Set my password". 3) Their account shows <em>Pending approval</em>. Click <strong>Approve</strong> and they can sign in.
        </div>
      </div>

      {notice && <div role="status" style={{ marginBottom: '1rem', padding: '0.75rem 1.25rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 12, fontSize: '0.875rem' }}>{notice}</div>}
      {(error || query.error) && <div role="alert" style={{ marginBottom: '1rem', padding: '0.75rem 1.25rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, fontSize: '0.875rem' }}>{error || query.error.message}</div>}

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Employees</h2>
          {pendingCount > 0 && (
            <span style={{ padding: '3px 12px', borderRadius: 12, background: '#fff7ed', color: '#c2410c', fontWeight: 700, fontSize: '0.8rem' }}>
              {pendingCount} waiting for approval
            </span>
          )}
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Login email</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading...</td></tr>
              ) : users.length ? users.map((user) => (
                <Row key={`${user.id}-${user.email || ''}-${user.login_status}-${user.role}`} user={user} onSave={save} busy={busyId === user.id} />
              )) : (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No employees yet. Add them on the Users page first.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AccessControl;