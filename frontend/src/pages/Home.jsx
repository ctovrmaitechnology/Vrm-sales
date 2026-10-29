import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  Users,
  Building2,
  MessageCircle,
  Send,
  Search,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import Button from '../components/Button';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;

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

const STATUS_BADGE = {
  sent: { background: '#dcfce7', color: '#166534' },
  clicked: { background: '#dbeafe', color: '#1e40af' },
  follow_up_sent: { background: '#fef9c3', color: '#854d0e' },
  converted_to_lead: { background: '#f3e8ff', color: '#6b21a8' },
  failed: { background: '#fee2e2', color: '#991b1b' },
  'not sent': { background: '#f1f5f9', color: '#475569' },
  new: { background: '#e0f2fe', color: '#075985' },
};

const statusBadge = (value) => {
  const style = STATUS_BADGE[value] || { background: '#f1f5f9', color: '#475569' };
  return (
    <span
      style={{
        ...style,
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '0.72rem',
        fontWeight: 600,
        textTransform: 'capitalize',
      }}
    >
      {value || 'not sent'}
    </span>
  );
};

const SEARCH_RESULT_FILTER_CONFIG = {
  facets: [
    { key: 'type', label: 'Type', field: 'type', options: [{ value: 'lead', label: 'Lead' }, { value: 'company', label: 'Company' }] },
    { key: 'emailStatus', label: 'Email status', field: (row) => row.record.email_status },
    { key: 'owner', label: 'Assigned user', field: (row) => row.record.owner?.employee_name },
  ],
};

const Home = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Universal search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [workloadExportFormat, setWorkloadExportFormat] = useState('');
  const [workloadExportError, setWorkloadExportError] = useState('');
  const statsQuery = useQuery({
    queryKey: ['overview-stats'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/overview-stats'));
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load overview stats.');
      return {
        totalLeads: data.totalLeads || 0,
        totalCompanies: data.totalCompanies || 0,
        totalEmailsSent: data.totalEmailsSent || 0,
        totalUsers: data.totalUsers || 0,
        users: data.users || [],
      };
    },
  });
  const whatsappLeadsQuery = useQuery({
    queryKey: ['whatsapp-leads'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/ingestion/whatsapp'));
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to load WhatsApp leads.');
      if (!Array.isArray(data)) throw new Error('The WhatsApp leads API returned an invalid response.');
      return data;
    },
  });
  const whatsappLeads = whatsappLeadsQuery.data || [];
  const whatsappSentCount = whatsappLeads.filter(
    (lead) => lead.status === 'sent' || lead.whatsappStatus === 'sent'
  ).length;
  const searchQueryResult = useQuery({
    queryKey: ['global-search', debouncedSearchQuery],
    enabled: debouncedSearchQuery.length >= 2,
    queryFn: async () => {
      const response = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(debouncedSearchQuery)}`));
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Search failed.');
      return data;
    },
  });
  const stats = statsQuery.data || {
    totalLeads: 0,
    totalCompanies: 0,
    totalEmailsSent: 0,
    totalUsers: 0,
    users: [],
  };
  const downloadWorkload = async (format) => {
    setWorkloadExportFormat(format);
    setWorkloadExportError('');
    try {
      const response = await fetch(apiUrl(`/api/overview-stats/workload-export?format=${format}`));
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Failed to download the ${format.toUpperCase()} report.`);
      }

      const file = await response.blob();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `team-workload.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setWorkloadExportError(error.message || `Failed to download the ${format.toUpperCase()} report.`);
    } finally {
      setWorkloadExportFormat('');
    }
  };
  const loadingStats = statsQuery.isFetching;
  const searchResults = searchQuery.trim().length < 2 ? null : searchQueryResult.data || null;
  const searching = searchQuery.trim().length >= 2 && (
    searchQuery.trim() !== debouncedSearchQuery || searchQueryResult.isFetching
  );
  const searchResultRows = [
    ...(searchResults?.leads || []).map((record) => ({ type: 'lead', record })),
    ...(searchResults?.companies || []).map((record) => ({ type: 'company', record }))
  ];
  const searchResultFilters = useTableFilters(searchResultRows, SEARCH_RESULT_FILTER_CONFIG);
  const searchResultsPagination = useTablePagination(searchResultFilters.filteredItems);

  const logout = () => {
    localStorage.removeItem('vrm_admin');
    localStorage.removeItem('isLoggedIn');
    queryClient.clear();
    navigate('/', { replace: true });
  };

  // Debounced search when typing
  useEffect(() => {
    const q = searchQuery.trim();
    const timer = setTimeout(
      () => setDebouncedSearchQuery(q.length >= 2 ? q : ''),
      q.length >= 2 ? 300 : 0
    );

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* Top action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-dark)', margin: 0, letterSpacing: '-0.02em' }}>
            Sales Agent Overview
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Unified command center for outreach automation, contacts, and team workload
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => statsQuery.refetch()} disabled={loadingStats}>
            Refresh Stats
          </Button>
          <Button variant="secondary" icon={<LogOut size={15} />} onClick={logout}>
            Log out
          </Button>
        </div>
        {statsQuery.error && (
          <div role="alert" style={{ color: '#b91c1c', marginBottom: '1rem' }}>
            {statsQuery.error.message}
          </div>
        )}
      </div>

      {/* ── 1. KPI STAT CARDS ────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: '1.25rem',
        marginBottom: '2rem'
      }}>
        {/* Total Leads Card */}
        <div
          onClick={() => navigate('/app/leads')}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '1.25rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>TOTAL LEADS</span>
            <div style={{ background: '#dbeafe', color: '#1d4ed8', padding: '8px', borderRadius: '8px' }}>
              <Users size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>
            {loadingStats ? '...' : stats.totalLeads}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem', color: '#2563eb', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Manage Leads</span>
            <ArrowRight size={14} />
          </div>
        </div>

        {/* Total Companies Card */}
        <div
          onClick={() => navigate('/app/company')}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '1.25rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>TOTAL COMPANIES</span>
            <div style={{ background: '#ecfdf5', color: '#047857', padding: '8px', borderRadius: '8px' }}>
              <Building2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>
            {loadingStats ? '...' : stats.totalCompanies}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem', color: '#059669', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Manage Companies</span>
            <ArrowRight size={14} />
          </div>
        </div>

        {/* Email Campaigns Sent Card */}
        <div
          onClick={() => navigate('/email')}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '1.25rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>EMAILS SENT</span>
            <div style={{ background: '#fef3c7', color: '#b45309', padding: '8px', borderRadius: '8px' }}>
              <Send size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>
            {loadingStats ? '...' : stats.totalEmailsSent}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem', color: '#d97706', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Open Email Campaigns</span>
            <ArrowRight size={14} />
          </div>
        </div>

        {/* WhatsApp card */}
        <div
          onClick={() => navigate('/app/whatsapp')}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '1.25rem',
            border: '2px solid #22c55e',
            boxShadow: '0 2px 5px rgba(34, 197, 94, 0.15)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
            background: 'linear-gradient(to bottom right, #ffffff, #f0fdf4)'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(34, 197, 94, 0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 5px rgba(34, 197, 94, 0.15)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#15803d' }}>WHATSAPP LEADS</span>
            <div style={{ background: '#22c55e', color: '#ffffff', padding: '8px', borderRadius: '8px' }}>
              <MessageCircle size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#166534' }}>
            {whatsappLeadsQuery.isLoading ? '...' : whatsappLeads.length}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem', color: '#15803d', fontSize: '0.8rem', fontWeight: 700 }}>
            <span>{whatsappSentCount} sent · Open WhatsApp</span>
            <ArrowRight size={14} />
          </div>
        </div>
      </div>
      {whatsappLeadsQuery.error && (
        <div role="alert" style={{ color: '#b91c1c', marginTop: '-1rem', marginBottom: '1rem' }}>
          {whatsappLeadsQuery.error.message}
        </div>
      )}

      {/* ── 2. UNIVERSAL SEARCH (LEADS & COMPANY CHECKER) ─────────────── */}
      <div className="dashboard-section" style={{ marginBottom: '2.5rem', background: '#ffffff', border: '1.5px solid #cbd5e1' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={19} color="#2563eb" />
            <span>Search Leads & Companies (Check If Already Present)</span>
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.25rem 0 0' }}>
            Search across both Leads and Company by <strong>Name</strong>, <strong>Email</strong>, <strong>Phone</strong>, or <strong>Company Name</strong> to verify if a prospect is already in the database.
          </p>
        </div>

        {/* Search input box */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type name, email, phone number, or company name to search..."
            style={{
              width: '100%',
              padding: '0.85rem 1rem 0.85rem 2.85rem',
              borderRadius: '10px',
              border: '2px solid #e2e8f0',
              fontSize: '0.95rem',
              color: '#0f172a',
              outline: 'none',
              backgroundColor: '#f8fafc',
              transition: 'all 0.15s ease',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#2563eb';
              e.target.style.backgroundColor = '#ffffff';
              e.target.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.12)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e2e8f0';
              e.target.style.boxShadow = 'none';
            }}
          />
          <Search
            size={18}
            color="#64748b"
            style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '4px',
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Search status & results */}
        {searching && (
          <div style={{ padding: '1rem 0', color: '#64748b', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={14} className="animate-spin" />
            <span>Searching records...</span>
          </div>
        )}
        {searchQueryResult.error && (
          <div role="alert" style={{ padding: '1rem 0', color: '#b91c1c', fontSize: '0.875rem' }}>
            {searchQueryResult.error.message}
          </div>
        )}

        {searchResults && !searching && (
          <div style={{ marginTop: '1.25rem' }}>
            {searchResults.totalFound > 0 ? (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '1rem',
                  padding: '0.65rem 1rem',
                  background: '#eff6ff',
                  borderRadius: '8px',
                  border: '1px solid #bfdbfe',
                  color: '#1e40af',
                  fontSize: '0.875rem',
                  fontWeight: 600
                }}>
                  <AlertCircle size={16} />
                  <span>Found {searchResults.totalFound} matching record(s) already present in the database:</span>
                </div>

                <TableFilters {...searchResultFilters} showSearch={false} searchPlaceholder="Filter search results..." />
                <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Full Name</th>
                        <th>Email</th>
                        <th>Phone / WhatsApp</th>
                        <th>Company Name</th>
                        <th>Email Status</th>
                        <th>Assigned User</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResultsPagination.pageItems
                        .filter((row) => row.type === 'lead')
                        .map(({ record: l }) => (
                        <tr key={`lead-${l.id}`}>
                          <td>
                            <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              LEAD
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{l.full_name || '-'}</td>
                          <td>{l.email || '-'}</td>
                          <td>{l.phone_number || l.whatsapp_number || '-'}</td>
                          <td>{l.company_name || '-'}</td>
                          <td>{statusBadge(l.email_status)}</td>
                          <td>{l.owner?.employee_name || 'Unassigned'}</td>
                          <td>
                            <button
                              onClick={() => navigate('/app/leads')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#1e293b',
                                cursor: 'pointer',
                              }}
                            >
                              <span>View in Leads</span>
                              <ExternalLink size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {searchResultsPagination.pageItems
                        .filter((row) => row.type === 'company')
                        .map(({ record: c }) => (
                        <tr key={`company-${c.id}`}>
                          <td>
                            <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              COMPANY
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{c.full_name || '-'}</td>
                          <td>{c.email || '-'}</td>
                          <td>{c.phone_number || c.whatsapp_number || '-'}</td>
                          <td>{c.company_name || '-'}</td>
                          <td>{statusBadge(c.email_status)}</td>
                          <td>{c.owner?.employee_name || 'Unassigned'}</td>
                          <td>
                            <button
                              onClick={() => navigate('/app/company')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#1e293b',
                                cursor: 'pointer',
                              }}
                            >
                              <span>View in Company</span>
                              <ExternalLink size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!searchResultFilters.filteredItems.length && (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>
                            No records match the selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <TablePagination {...searchResultsPagination} />
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0.85rem 1rem',
                background: '#ecfdf5',
                borderRadius: '8px',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                fontSize: '0.875rem'
              }}>
                <CheckCircle2 size={18} color="#059669" />
                <span>
                  <strong>Not found:</strong> No lead or company exists with <strong>&quot;{searchQuery}&quot;</strong>. You can safely add this contact as new!
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 3. USERS / WORKLOAD SUMMARY (REDIRECTS TO USER MODULE) ──────── */}
      <div className="dashboard-section" style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={20} color="#2563eb" />
              <span>Team Members & Assigned Workload</span>
            </h2>
            <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0.2rem 0 0' }}>
              Click on any user or the button below to inspect their activity history in the User Module
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={16} />}
              onClick={() => downloadWorkload('xlsx')}
              disabled={Boolean(workloadExportFormat)}
            >
              {workloadExportFormat === 'xlsx' ? 'Preparing Excel...' : 'Download Excel'}
            </Button>
            <Button
              variant="secondary"
              icon={<FileText size={16} />}
              onClick={() => downloadWorkload('pdf')}
              disabled={Boolean(workloadExportFormat)}
            >
              {workloadExportFormat === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}
            </Button>
            <Button
              variant="primary"
              icon={<ArrowRight size={15} />}
              onClick={() => navigate('/app/users')}
            >
              Open User Module
            </Button>
          </div>
        </div>
        {workloadExportError && (
          <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem', margin: '-0.5rem 0 1rem' }}>
            {workloadExportError}
          </p>
        )}

        {stats.users.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}>
            {stats.users.map((u) => {
              const leadsCount = u._count?.leads || 0;
              const companiesCount = u._count?.companies || 0;
              const totalWorkload = leadsCount + companiesCount;

              return (
                <div
                  key={u.id}
                  onClick={() => navigate('/app/users')}
                  style={{
                    padding: '1rem 1.25rem',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#3b82f6';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: '#3b82f6',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        textTransform: 'uppercase'
                      }}>
                        {u.employee_name?.slice(0, 2) || 'U'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                          {u.employee_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          ID: #{u.id}
                        </div>
                      </div>
                    </div>
                    <span style={{
                      background: '#e0f2fe',
                      color: '#0369a1',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 700
                    }}>
                      {totalWorkload} Total
                    </span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '8px',
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #e2e8f0',
                  }}>
                    <div style={{ textAlign: 'center', background: '#ffffff', padding: '6px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Leads</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e40af' }}>{leadsCount}</div>
                    </div>
                    <div style={{ textAlign: 'center', background: '#ffffff', padding: '6px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Companies</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#065f46' }}>{companiesCount}</div>
                    </div>
                    <div style={{ textAlign: 'center', background: '#ffffff', padding: '6px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Assigned Email Leads</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#7c3aed' }}>{u.emailLeadCount || 0}</div>
                    </div>
                    <div style={{ textAlign: 'center', background: '#ffffff', padding: '6px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Assigned WhatsApp Leads</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#059669' }}>{u.whatsappLeadCount || 0}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
            No active users found. You can add employees in the User Module.
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
