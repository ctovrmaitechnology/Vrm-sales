import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Manage employees, assigned records, and email history</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => usersQuery.refetch()} disabled={usersQuery.isFetching}>
          Refresh
        </Button>
      </div>

      {notice && <div className="dashboard-section" role="status" style={{ marginBottom: '1rem' }}>{notice}</div>}
      {(error || usersQuery.error || historyQuery.error) && (
        <div className="dashboard-section" role="alert" style={{ marginBottom: '1rem', color: '#b91c1c' }}>
          {error || usersQuery.error?.message || historyQuery.error?.message}
        </div>
      )}

      <div className="dashboard-section">
        <h2 className="section-title">Add Employee</h2>
        <form onSubmit={addEmployee} className="flex gap-2" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 280px', marginBottom: 0 }}>
            <label className="form-label" htmlFor="employee-name">Employee name</label>
            <input
              id="employee-name"
              className="form-control"
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              maxLength={255}
              required
            />
          </div>
          <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={saving}>
            {saving ? 'Adding...' : 'Add Employee'}
          </Button>
        </form>
      </div>

      <div className="dashboard-section">
        <h2 className="section-title">Employees</h2>
        <TableFilters {...usersFilters} searchPlaceholder="Search employees..." />
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Employee</th><th>Leads</th><th>Companies</th><th>Email attempts</th><th>History</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>Loading employees...</td></tr>
              ) : usersFilters.filteredItems.length ? usersPagination.pageItems.map((user) => (
                <tr key={user.id}>
                  <td>{user.employee_name}</td>
                  <td>{user._count?.leads || 0}</td>
                  <td>{user._count?.companies || 0}</td>
                  <td>{user._count?.email_history || 0}</td>
                  <td>
                    <Button variant={String(user.id) === selectedUserId ? 'primary' : 'secondary'} onClick={() => selectUser(user.id)}>
                      View History
                    </Button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="5" style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>{usersFilters.hasFilters ? 'No employees match the selected filters.' : 'No employees yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination {...usersPagination} />
      </div>

      {selectedUserId && (
        <div className="dashboard-section">
          <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              {history?.user?.employee_name || users.find((user) => String(user.id) === selectedUserId)?.employee_name || 'Employee'} History
            </h2>
            <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="history-from">From</label>
                <input id="history-from" type="date" className="form-control" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="history-to">To</label>
                <input id="history-to" type="date" className="form-control" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </div>
              <Button variant="primary" onClick={refreshHistory} disabled={historyLoading}>
                {historyLoading ? 'Loading...' : 'Filter'}
              </Button>
            </div>
          </div>

          {historyLoading ? <p>Loading history...</p> : history && (
            <>
              <h3 className="section-title">Assigned Leads</h3>
              <TableFilters {...assignedLeadFilters} searchPlaceholder="Search assigned leads..." />
              <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                <table>
                  <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Source</th><th>Added</th></tr></thead>
                  <tbody>
                    {assignedLeadFilters.filteredItems.length ? leadsPagination.pageItems.map((lead) => (
                      <tr key={lead.id}><td>{lead.full_name || '-'}</td><td>{lead.company || '-'}</td><td>{lead.email || '-'}</td><td>{lead.source || '-'}</td><td>{formatDateTime(lead.created_at)}</td></tr>
                    )) : <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem' }}>{assignedLeadFilters.hasFilters ? 'No assigned leads match the selected filters.' : 'No assigned leads for this date range.'}</td></tr>}
                  </tbody>
                </table>
                <TablePagination {...leadsPagination} />
              </div>

              <h3 className="section-title">Assigned Companies</h3>
              <TableFilters {...assignedCompanyFilters} searchPlaceholder="Search assigned companies..." />
              <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                <table>
                  <thead><tr><th>Company</th><th>Contact</th><th>Email</th><th>Status</th><th>Added</th></tr></thead>
                  <tbody>
                    {assignedCompanyFilters.filteredItems.length ? companiesPagination.pageItems.map((company) => (
                      <tr key={company.id}><td>{company.company_name || '-'}</td><td>{company.full_name || '-'}</td><td>{company.email || '-'}</td><td>{company.email_status}</td><td>{formatDateTime(company.created_at)}</td></tr>
                    )) : <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem' }}>{assignedCompanyFilters.hasFilters ? 'No assigned companies match the selected filters.' : 'No assigned companies for this date range.'}</td></tr>}
                  </tbody>
                </table>
                <TablePagination {...companiesPagination} />
              </div>

              <h3 className="section-title">Email History</h3>
              <TableFilters {...emailHistoryFilters} searchPlaceholder="Search email history..." />
              <div className="table-container">
                <table>
                  <thead><tr><th>Recipient</th><th>Type</th><th>Status</th><th>Attempt</th><th>Time</th><th>Provider ID / Error</th></tr></thead>
                  <tbody>
                    {emailHistoryFilters.filteredItems.length ? emailHistoryPagination.pageItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.recipient_email}</td><td>{item.event_type}</td><td>{item.status}</td><td>{item.attempt_number}</td>
                        <td>{formatDateTime(item.attempted_at)}</td><td>{item.provider_message_id || item.error_message || '-'}</td>
                      </tr>
                    )) : <tr><td colSpan="6" style={{ textAlign: 'center', padding: '1rem' }}>{emailHistoryFilters.hasFilters ? 'No email history matches the selected filters.' : 'No email attempts for this date range.'}</td></tr>}
                  </tbody>
                </table>
                <TablePagination {...emailHistoryPagination} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Users;
