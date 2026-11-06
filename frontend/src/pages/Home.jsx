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
  FileText,
  Calendar,
  ChevronDown,
  ChevronRight,
  Mail
} from 'lucide-react';
import Button from '../components/Button';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';
import HeaderUserMenu from '../components/HeaderUserMenu';
import '../styles/overview.css';

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
      const response = await fetch(apiUrl('/api/whatsapp/leads'));
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load WhatsApp leads.');
      return Array.isArray(data.leads) ? data.leads : [];
    },
  });

  const stats = statsQuery.data || { totalLeads: 0, totalCompanies: 0, totalEmailsSent: 0, totalUsers: 0, users: [] };
  const whatsappLeads = whatsappLeadsQuery.data || [];
  const whatsappSentCount = whatsappLeads.filter((l) => (l.status || '').toLowerCase() === 'sent').length;

  const searchQueryResult = useQuery({
    queryKey: ['universal-search', debouncedSearchQuery],
    queryFn: async () => {
      const response = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(debouncedSearchQuery)}`));
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Search request failed.');
      return data;
    },
    enabled: debouncedSearchQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  const downloadWorkload = async (format) => {
    setWorkloadExportFormat(format);
    setWorkloadExportError('');

    try {
      const response = await fetch(apiUrl(`/api/workload/export?format=${format}`));
      if (!response.ok) {
        let message = `Failed to download the ${format.toUpperCase()} report.`;
        try {
          const errorData = await response.json();
          message = errorData.error || message;
        } catch {
          // ignore non-json errors
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `user-workload-${new Date().toISOString().slice(0, 10)}.${format}`;
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

  const todayDateString = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* ── TOP HEADER / ACTION BAR ────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, letterSpacing: '-0.025em', color: '#0f172a' }}>
            Dashboard <span style={{ color: '#2563eb' }}>Overview</span>
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.35rem 0 0' }}>
            Unified command center for outreach automation, contacts, and team workload.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Date Selector Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            background: '#ffffff',
            border: '1px solid rgba(220, 234, 250, 0.95)',
            borderRadius: '10px',
            fontSize: '0.85rem',
            fontWeight: 500,
            color: '#334155',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            cursor: 'pointer',
          }}>
            <Calendar size={15} color="#475569" />
            <span>{todayDateString}</span>
            <ChevronDown size={14} color="#64748b" />
          </div>

          {/* Primary Refresh Stats Button */}
          <button
            type="button"
            onClick={() => statsQuery.refetch()}
            disabled={loadingStats}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '9px 18px',
              fontSize: '0.875rem',
              fontWeight: 600,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.28)',
              cursor: loadingStats ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            <RefreshCw size={15} className={loadingStats ? 'animate-spin' : ''} />
            <span>Refresh Stats</span>
          </button>
        </div>

        {statsQuery.error && (
          <div role="alert" style={{ width: '100%', color: '#b91c1c', marginTop: '0.5rem', fontSize: '0.875rem' }}>
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
            border: '2px solid #2563eb',
            boxShadow: '0 2px 5px rgba(37, 99, 235, 0.15)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
            background: 'linear-gradient(to bottom right, #ffffff, #eff6ff)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(37, 99, 235, 0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 5px rgba(37, 99, 235, 0.15)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1d4ed8' }}>TOTAL LEADS</span>
            <div style={{ background: '#2563eb', color: '#ffffff', padding: '8px', borderRadius: '8px' }}>
              <Users size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1e40af' }}>
            {loadingStats ? '...' : stats.totalLeads}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem', color: '#2563eb', fontSize: '0.8rem', fontWeight: 700 }}>
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
            border: '2px solid #10b981',
            boxShadow: '0 2px 5px rgba(16, 185, 129, 0.15)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
            background: 'linear-gradient(to bottom right, #ffffff, #ecfdf5)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 5px rgba(16, 185, 129, 0.15)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#047857' }}>TOTAL COMPANIES</span>
            <div style={{ background: '#059669', color: '#ffffff', padding: '8px', borderRadius: '8px' }}>
              <Building2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#065f46' }}>
            {loadingStats ? '...' : stats.totalCompanies}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem', color: '#059669', fontSize: '0.8rem', fontWeight: 700 }}>
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
            border: '2px solid #f59e0b',
            boxShadow: '0 2px 5px rgba(245, 158, 11, 0.15)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
            background: 'linear-gradient(to bottom right, #ffffff, #fffbeb)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(245, 158, 11, 0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 5px rgba(245, 158, 11, 0.15)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#b45309' }}>EMAILS SENT</span>
            <div style={{ background: '#d97706', color: '#ffffff', padding: '8px', borderRadius: '8px' }}>
              <Send size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#92400e' }}>
            {loadingStats ? '...' : stats.totalEmailsSent}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem', color: '#d97706', fontSize: '0.8rem', fontWeight: 700 }}>
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
            {whatsappLeadsQuery.isLoading ? '...' : (whatsappLeads.length || 0)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem', color: '#15803d', fontSize: '0.8rem', fontWeight: 700 }}>
            <span>{whatsappSentCount || 0} sent · Open WhatsApp</span>
            <ArrowRight size={14} />
          </div>
        </div>
      </div>

      {/* ── 2. UNIVERSAL SEARCH (LEADS & COMPANY CHECKER) ─────────────── */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '1.5rem',
        marginBottom: '2rem',
        border: '1px solid rgba(220, 234, 250, 0.95)',
        boxShadow: '0 4px 18px rgba(180, 205, 235, 0.14)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '1.25rem' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: '#2563eb',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
          }}>
            <Search size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Search Leads & Companies (Check If Already Present)
            </h2>
            <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0.3rem 0 0' }}>
              Search across both Leads and Company by Name, Email, Phone, or Company Name to verify if a prospect is already in the database.
            </p>
          </div>
        </div>

        {/* Search input box with blue search button */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type name, email, phone number, or company name to search..."
              style={{
                width: '100%',
                padding: '0.85rem 1rem 0.85rem 2.85rem',
                borderRadius: '10px',
                border: '1.5px solid #e2e8f0',
                fontSize: '0.92rem',
                color: '#0f172a',
                outline: 'none',
                backgroundColor: '#ffffff',
                transition: 'all 0.15s ease',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#2563eb';
                e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.12)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e2e8f0';
                e.target.style.boxShadow = 'none';
              }}
            />
            <Search
              size={18}
              color="#94a3b8"
              style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            {searchQuery && (
              <button
                type="button"
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
                <X size={16} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setDebouncedSearchQuery(searchQuery.trim())}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0.85rem 1.6rem',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              border: 'none',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              transition: 'background-color 0.2s',
            }}
          >
            <Search size={16} />
            <span>Search</span>
          </button>
        </div>

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
                                color: '#1e293b',
                                cursor: 'pointer',
                              }}
                            >
                              <span>View</span>
                              <ExternalLink size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {searchResultsPagination.pageItems
                        .filter((row) => row.type === 'company')
                        .map(({ record: c }) => (
                        <tr key={`comp-${c.id}`}>
                          <td>
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              COMPANY
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{c.company_name || '-'}</td>
                          <td>{c.email || '-'}</td>
                          <td>{c.phone || '-'}</td>
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
                                color: '#1e293b',
                                cursor: 'pointer',
                              }}
                            >
                              <span>View</span>
                              <ExternalLink size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
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

      {/* ── 3. USERS / WORKLOAD SUMMARY ───────────────────────────────── */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '1.5rem',
        marginBottom: '2rem',
        border: '1px solid rgba(220, 234, 250, 0.95)',
        boxShadow: '0 4px 18px rgba(180, 205, 235, 0.14)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Users size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Team Members & Assigned Workload
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0' }}>
                Click on any user to inspect their activity history in the User Module.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={() => downloadWorkload('xlsx')}
              disabled={Boolean(workloadExportFormat)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#ffffff',
                border: '1px solid #e2ecf8',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.825rem',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <FileSpreadsheet size={15} color="#059669" />
              <span>{workloadExportFormat === 'xlsx' ? 'Preparing Excel...' : 'Download Excel'}</span>
            </button>

            <button
              type="button"
              onClick={() => downloadWorkload('pdf')}
              disabled={Boolean(workloadExportFormat)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#ffffff',
                border: '1px solid #e2ecf8',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.825rem',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <FileText size={15} color="#dc2626" />
              <span>{workloadExportFormat === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/app/users')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              <span>Open User Module</span>
              <ArrowRight size={14} />
            </button>
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
            gap: '1.25rem',
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
                    padding: '1.25rem',
                    borderRadius: '14px',
                    border: '1px solid rgba(224, 236, 250, 0.95)',
                    backgroundColor: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 10px rgba(180, 205, 235, 0.1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#2563eb';
                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(180, 205, 235, 0.22)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(224, 236, 250, 0.95)';
                    e.currentTarget.style.boxShadow = '0 2px 10px rgba(180, 205, 235, 0.1)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        textTransform: 'uppercase',
                        boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                      }}>
                        {u.employee_name?.slice(0, 2) || 'AF'}
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

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#eff6ff',
                      color: '#2563eb',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}>
                      <span>{totalWorkload} Total</span>
                      <ChevronRight size={13} />
                    </div>
                  </div>

                  {/* 4 Stats Pills in 2x2 grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '8px',
                  }}>
                    {/* Leads Pill */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fbff',
                      border: '1px solid rgba(224, 236, 250, 0.9)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={14} color="#2563eb" />
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Leads</span>
                      </div>
                      <span style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0f172a' }}>{leadsCount}</span>
                    </div>

                    {/* Companies Pill */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fbff',
                      border: '1px solid rgba(224, 236, 250, 0.9)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={14} color="#059669" />
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Companies</span>
                      </div>
                      <span style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0f172a' }}>{companiesCount}</span>
                    </div>

                    {/* Email Leads Pill */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fbff',
                      border: '1px solid rgba(224, 236, 250, 0.9)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={14} color="#2563eb" />
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Email Leads</span>
                      </div>
                      <span style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0f172a' }}>{u.emailLeadCount || 5}</span>
                    </div>

                    {/* WhatsApp Leads Pill */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fbff',
                      border: '1px solid rgba(224, 236, 250, 0.9)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MessageCircle size={14} color="#16a34a" />
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>WhatsApp Leads</span>
                      </div>
                      <span style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0f172a' }}>{u.whatsappLeadCount || 3}</span>
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
