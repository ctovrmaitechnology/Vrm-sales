import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, User, Mail, Building2, Users as UsersIcon } from 'lucide-react';
import Button from '../components/Button';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const USER_FILTER_CONFIG = { searchFields: ['employee_name'] };
const USER_LEAD_FILTER_CONFIG = {
  searchFields: ['full_name', 'company', 'email', 'source'],
  facets: [{ key: 'source', label: 'Source', field: 'source' }],
};
const USER_COMPANY_FILTER_CONFIG = {
  searchFields: ['company_name', 'full_name', 'email'],
  facets: [{ key: 'status', label: 'Email status', field: 'email_status' }],
};
const EMAIL_HISTORY_FILTER_CONFIG = {
  searchFields: ['recipient_email', 'provider_message_id', 'error_message'],
  facets: [
    { key: 'eventType', label: 'Type', field: 'event_type' },
    { key: 'status', label: 'Status', field: 'status' },
  ],
};
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : DATE_TIME_FORMATTER.format(date);
};

const Users = () => {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/users'));
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Failed to load employees.');
      if (!Array.isArray(result?.data)) throw new Error('The employees API returned an invalid response.');
      return result.data;
    },
  });
  const users = usersQuery.data || [];
  const [selectedUserId, setSelectedUserId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const historyQuery = useQuery({
    queryKey: ['user-history', selectedUserId, fromDate, toDate],
    enabled: Boolean(selectedUserId),
    queryFn: async () => {
      const query = new URLSearchParams();
      if (fromDate) query.set('from', fromDate);
      if (toDate) query.set('to', toDate);
      const response = await fetch(apiUrl(`/api/users/${selectedUserId}/history?${query.toString()}`));
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Failed to load employee history.');
      return result.data;
    },
  });
  const history = historyQuery.data || null;
  const loading = usersQuery.isLoading;
  const historyLoading = historyQuery.isFetching;
  const usersFilters = useTableFilters(users, USER_FILTER_CONFIG);
  const assignedLeadFilters = useTableFilters(history?.leads || [], USER_LEAD_FILTER_CONFIG);
  const assignedCompanyFilters = useTableFilters(history?.companies || [], USER_COMPANY_FILTER_CONFIG);
  const emailHistoryFilters = useTableFilters(history?.email_history || [], EMAIL_HISTORY_FILTER_CONFIG);
  const usersPagination = useTablePagination(usersFilters.filteredItems);
  const leadsPagination = useTablePagination(assignedLeadFilters.filteredItems);
  const companiesPagination = useTablePagination(assignedCompanyFilters.filteredItems);
  const emailHistoryPagination = useTablePagination(emailHistoryFilters.filteredItems);

  const addEmployee = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(apiUrl('/api/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_name: employeeName }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Failed to add employee.');
      queryClient.setQueryData(['users'], (current = []) =>
        [...current, result.data].sort((a, b) => a.employee_name.localeCompare(b.employee_name))
      );
      setEmployeeName('');
      setSelectedUserId(String(result.data.id));
      queryClient.setQueryData(
        ['user-history', String(result.data.id), fromDate, toDate],
        { user: result.data, leads: [], companies: [], email_history: [] }
      );
      await queryClient.invalidateQueries({ queryKey: ['overview-stats'] });
      setNotice('Employee added successfully.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const selectUser = (id) => setSelectedUserId(String(id));
  const refreshHistory = () => historyQuery.refetch();

  const selectedUserObj = users.find((user) => String(user.id) === selectedUserId) || history?.user;

  return (
    <div>
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Users & Team</h1>
          <p className="page-subtitle">Manage team members, assigned records, and performance metrics</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => usersQuery.refetch()} disabled={usersQuery.isFetching}>
            Refresh
          </Button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1.25rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            borderRadius: '12px',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
          role="status"
        >
          {notice}
        </div>
      )}
      {(error || usersQuery.error || historyQuery.error) && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1.25rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: '12px',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
          role="alert"
        >
          {error || usersQuery.error?.message || historyQuery.error?.message}
        </div>
      )}

      {/* Quick Add Employee Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(220, 234, 250, 0.95)',
          boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.85rem' }}>
          Add New Team Member
        </h2>
        <form onSubmit={addEmployee} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', maxWidth: '420px' }}>
            <input
              id="employee-name"
              placeholder="Enter member's full name (e.g. Rahul Sharma)"
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              maxLength={255}
              required
              style={{
                width: '100%',
                padding: '0.6rem 0.95rem',
                border: '1.5px solid #cbd5e1',
                borderRadius: '10px',
                fontSize: '0.875rem',
                backgroundColor: '#f8fafc',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={saving}>
            {saving ? 'Adding...' : 'Add Member'}
          </Button>
        </form>
      </div>

      {/* Employees Directory Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(220, 234, 250, 0.95)',
          boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Team Directory
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0' }}>
              Showing {usersFilters.filteredItems.length} active team member{usersFilters.filteredItems.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <TableFilters {...usersFilters} searchPlaceholder="Search employees..." />

        <div className="table-container" style={{ marginTop: '0.75rem' }}>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th style={{ textAlign: 'center' }}>Leads Assigned</th>
                <th style={{ textAlign: 'center' }}>Companies</th>
                <th style={{ textAlign: 'center' }}>Email Attempts</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>Loading team members...</td></tr>
              ) : usersFilters.filteredItems.length ? usersPagination.pageItems.map((user) => {
                const initials = (user.employee_name || 'U')
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                const isSelected = String(user.id) === selectedUserId;
                return (
                  <tr key={user.id} style={{ backgroundColor: isSelected ? 'rgba(239, 246, 255, 0.5)' : undefined }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: isSelected ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'linear-gradient(135deg, #60a5fa, #3b82f6)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                            flexShrink: 0
                          }}
                        >
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{user.employee_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>ID: #{user.id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', minWidth: '32px', padding: '3px 10px', borderRadius: '12px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 600, fontSize: '0.8rem' }}>
                        {user._count?.leads || 0}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', minWidth: '32px', padding: '3px 10px', borderRadius: '12px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontWeight: 600, fontSize: '0.8rem' }}>
                        {user._count?.companies || 0}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', minWidth: '32px', padding: '3px 10px', borderRadius: '12px', background: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff', fontWeight: 600, fontSize: '0.8rem' }}>
                        {user._count?.email_history || 0}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant={isSelected ? 'primary' : 'secondary'}
                        onClick={() => selectUser(user.id)}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                      >
                        {isSelected ? 'Viewing History' : 'View History'}
                      </Button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: '#64748b', padding: '2.5rem' }}>
                    {usersFilters.hasFilters ? 'No employees match the selected filters.' : 'No employees added yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination {...usersPagination} />
      </div>

      {/* Selected Member History Section */}
      {selectedUserId && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid rgba(220, 234, 250, 0.95)',
            boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
            padding: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          {/* History Header & Member Profile Card */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              paddingBottom: '1.25rem',
              borderBottom: '1px solid #e2e8f0',
              marginBottom: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1rem',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                }}
              >
                {(selectedUserObj?.employee_name || 'U').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  {selectedUserObj?.employee_name || 'Employee'} — Activity History
                </h2>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0' }}>
                  Filter records and performance history for this member
                </p>
              </div>
            </div>

            {/* Date Filter Controls */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  background: '#f8fbff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '9px',
                  height: '38px',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>From:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', color: '#0f172a', outline: 'none' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', color: '#0f172a', outline: 'none' }}
                />
              </div>
              <Button variant="primary" onClick={refreshHistory} disabled={historyLoading} style={{ height: '38px' }}>
                {historyLoading ? 'Loading...' : 'Filter History'}
              </Button>
            </div>
          </div>

          {historyLoading ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading member activity...</p>
          ) : history && (
            <>
              {/* Assigned Leads Section */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
                  Assigned Leads ({assignedLeadFilters.filteredItems.length})
                </h3>
                <TableFilters {...assignedLeadFilters} searchPlaceholder="Search assigned leads..." />
                <div className="table-container" style={{ marginTop: '0.75rem' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Company</th>
                        <th>Email</th>
                        <th>Source</th>
                        <th>Added Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedLeadFilters.filteredItems.length ? leadsPagination.pageItems.map((lead) => (
                        <tr key={lead.id}>
                          <td style={{ fontWeight: 600 }}>{lead.full_name || '-'}</td>
                          <td>{lead.company || '-'}</td>
                          <td>{lead.email || '-'}</td>
                          <td><span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem' }}>{lead.source || '-'}</span></td>
                          <td>{formatDateTime(lead.created_at)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>{assignedLeadFilters.hasFilters ? 'No assigned leads match the selected filters.' : 'No assigned leads for this date range.'}</td></tr>
                      )}
                    </tbody>
                  </table>
                  <TablePagination {...leadsPagination} />
                </div>
              </div>

              {/* Assigned Companies Section */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
                  Assigned Companies ({assignedCompanyFilters.filteredItems.length})
                </h3>
                <TableFilters {...assignedCompanyFilters} searchPlaceholder="Search assigned companies..." />
                <div className="table-container" style={{ marginTop: '0.75rem' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Contact</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Added Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedCompanyFilters.filteredItems.length ? companiesPagination.pageItems.map((company) => (
                        <tr key={company.id}>
                          <td style={{ fontWeight: 600 }}>{company.company_name || '-'}</td>
                          <td>{company.full_name || '-'}</td>
                          <td>{company.email || '-'}</td>
                          <td><span className="badge badge-success">{company.email_status}</span></td>
                          <td>{formatDateTime(company.created_at)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>{assignedCompanyFilters.hasFilters ? 'No assigned companies match the selected filters.' : 'No assigned companies for this date range.'}</td></tr>
                      )}
                    </tbody>
                  </table>
                  <TablePagination {...companiesPagination} />
                </div>
              </div>

              {/* Email History Section */}
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
                  Email History ({emailHistoryFilters.filteredItems.length})
                </h3>
                <TableFilters {...emailHistoryFilters} searchPlaceholder="Search email history..." />
                <div className="table-container" style={{ marginTop: '0.75rem' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Recipient</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Attempt</th>
                        <th>Time</th>
                        <th>Provider ID / Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailHistoryFilters.filteredItems.length ? emailHistoryPagination.pageItems.map((item) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 500 }}>{item.recipient_email}</td>
                          <td>{item.event_type}</td>
                          <td><span className="badge badge-success">{item.status}</span></td>
                          <td>#{item.attempt_number}</td>
                          <td>{formatDateTime(item.attempted_at)}</td>
                          <td style={{ color: item.error_message ? '#ef4444' : '#64748b' }}>{item.provider_message_id || item.error_message || '-'}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>{emailHistoryFilters.hasFilters ? 'No email history matches the selected filters.' : 'No email attempts for this date range.'}</td></tr>
                      )}
                    </tbody>
                  </table>
                  <TablePagination {...emailHistoryPagination} />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Users;
