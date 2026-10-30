import { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, ExternalLink, Pencil, Plus, RefreshCw, Search, Trash2, X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import Button from '../components/Button';
import ExcelImportControls from '../components/ExcelImportControls';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';
import CategoryDropdown from '../components/CategoryDropdown';
import '../styles/whatsapp.css';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const EMPTY_LIST = [];
const COMPANY_FILTERS = [
  { key: 'status', label: 'Status', field: 'status' },
  { key: 'email_status', label: 'Email status', field: 'email_status' },
  { key: 'source', label: 'Source', field: 'source' },
  { key: 'owner', label: 'Assigned user', field: 'owner.employee_name' },
];

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

const AVATAR_PALETTES = [
  { bg: '#dbeafe', color: '#1d4ed8' },
  { bg: '#ffe4e6', color: '#e11d48' },
  { bg: '#dcfce7', color: '#15803d' },
  { bg: '#f3e8ff', color: '#7e22ce' },
  { bg: '#cffafe', color: '#0e7490' },
  { bg: '#ffedd5', color: '#c2410c' },
];

const getAvatarStyle = (index = 0) => AVATAR_PALETTES[index % AVATAR_PALETTES.length];

const getInitials = (name) => {
  if (!name || name === '-') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 1).toUpperCase();
};

const EMAIL_STATUS_OPTIONS = ['not sent', 'new', 'sent', 'failed'];
const STATUS_OPTIONS = ['new', 'sent', 'clicked', 'converted_to_lead', 'follow_up_sent'];

const COMPANY_FIELDS = [
  { name: 'full_name', label: 'Full name', required: true, placeholder: 'e.g. Alex Johnson' },
  { name: 'email', label: 'Email', type: 'email', placeholder: 'alex@company.com' },
  { name: 'company_name', label: 'Company name', placeholder: 'e.g. Acme Technologies' },
  { name: 'role', label: 'Role / Designation', placeholder: 'e.g. VP Operations' },
  { name: 'phone_number', label: 'Phone number', type: 'tel', placeholder: '+91 98765 43210' },
  { name: 'whatsapp_number', label: 'WhatsApp number', type: 'tel', placeholder: '+91 98765 43210' },
  { name: 'linkedin_url', label: 'LinkedIn URL', type: 'url', placeholder: 'https://linkedin.com/in/...' },
  { name: 'facebook_url', label: 'Facebook URL', type: 'url', placeholder: 'https://facebook.com/...' },
  { name: 'source', label: 'Source', placeholder: 'e.g. Recruitment, Real Estate' },
  { name: 'note', label: 'Note', multiline: true, placeholder: 'Add notes about this company contact...', fullWidth: true },
  { name: 'address', label: 'Address', multiline: true, placeholder: 'Office address, City, Country...', fullWidth: true },
];

const EMPTY_COMPANY = {
  ...Object.fromEntries(COMPANY_FIELDS.map(({ name }) => [name, ''])),
  status: 'new',
  email_status: 'not sent',
  user_id: '',
};

// Badge styling for email/lead status
const STATUS_BADGE = {
  sent: { background: '#dcfce7', color: '#166534' },
  clicked: { background: '#dbeafe', color: '#1e40af' },
  'follow_up_sent': { background: '#fef9c3', color: '#854d0e' },
  converted_to_lead: { background: '#f3e8ff', color: '#6b21a8' },
  failed: { background: '#fee2e2', color: '#991b1b' },
  'not sent': { background: '#f1f5f9', color: '#475569' },
  new: { background: '#e0f2fe', color: '#075985' },
};
const statusBadge = (value) => {
  const style = STATUS_BADGE[value] || { background: '#f1f5f9', color: '#475569' };
  return (
    <span style={{
      ...style,
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {value || '-'}
    </span>
  );
};

const ClickBadge = ({ count, label, color }) => (
  count > 0 ? (
    <span
      title={label}
      style={{
        display: 'inline-block',
        background: color,
        color: '#fff',
        borderRadius: '999px',
        padding: '1px 8px',
        fontSize: '0.72rem',
        fontWeight: 700,
        marginLeft: 2,
      }}
    >
      {count}
    </span>
  ) : (
    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>0</span>
  )
);

const Company = () => {
  const queryClient = useQueryClient();
  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/companies'));
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || data?.message || 'Failed to fetch companies.');
      const items = Array.isArray(data) ? data : data?.data;
      if (!Array.isArray(items)) throw new Error('The companies API returned an invalid response.');
      return items;
    },
  });
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/users'));
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to load employees.');
      if (!Array.isArray(data?.data)) throw new Error('The employees API returned an invalid response.');
      return data.data;
    },
  });
  const companies = companiesQuery.data || EMPTY_LIST;
  const users = usersQuery.data || EMPTY_LIST;
  const loading = companiesQuery.isLoading;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [viewingCompany, setViewingCompany] = useState(null);

  const [form, setForm] = useState(EMPTY_COMPANY);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Create ────────────────────────────────────────────────────
  const submitCompany = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    if (!form.user_id) {
      setError('Please select an assigned user.');
      setSaving(false);
      return;
    }
    try {
      const response = await fetch(apiUrl('/api/companies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || data?.message || 'Failed to save company contact.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
        queryClient.invalidateQueries({ queryKey: ['email-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['overview-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['global-search'] }),
      ]);
      setForm(EMPTY_COMPANY);
      setAddModalOpen(false);
      setNotice('Company contact saved.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────
  const openEditModal = (company) => {
    setSelectedCompany(company);
    setForm({
      full_name: company.full_name || '',
      whatsapp_number: company.whatsapp_number || '',
      facebook_url: company.facebook_url || '',
      linkedin_url: company.linkedin_url || '',
      company_name: company.company_name || '',
      phone_number: company.phone_number || '',
      email: company.email || '',
      role: company.role || '',
      source: company.source || '',
      status: company.status || 'new',
      note: company.note || '',
      email_status: company.email_status || 'not sent',
      address: company.address || '',
      user_id: company.user_id ? String(company.user_id) : '',
    });
    setError('');
    setEditModalOpen(true);
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    if (!selectedCompany) return;
    setSaving(true);
    setError('');
    setNotice('');
    if (!form.user_id) {
      setError('Please select an assigned user.');
      setSaving(false);
      return;
    }
    try {
      const response = await fetch(apiUrl(`/api/companies/${selectedCompany.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || data?.message || 'Failed to update company contact.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
        queryClient.invalidateQueries({ queryKey: ['email-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['overview-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['global-search'] }),
      ]);
      setEditModalOpen(false);
      setSelectedCompany(null);
      setNotice('Company contact updated.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────
  const openDeleteModal = (company) => {
    setSelectedCompany(company);
    setError('');
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedCompany) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(apiUrl(`/api/companies/${selectedCompany.id}`), {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || data?.message || 'Failed to delete company contact.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
        queryClient.invalidateQueries({ queryKey: ['email-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['overview-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['global-search'] }),
      ]);
      setDeleteModalOpen(false);
      setSelectedCompany(null);
      setNotice('Company contact deleted.');
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeleting(false);
    }
  };

  // ── View Details ──────────────────────────────────────────────
  const openViewModal = (company) => {
    setViewingCompany(company);
    setViewModalOpen(true);
  };

  // ── Form fields renderer ──────────────────────────────────────
  const renderFields = (idPrefix) =>
    COMPANY_FIELDS.map((field) => {
      const isFullWidth = field.fullWidth;
      return (
        <div
          key={field.name}
          style={{
            gridColumn: isFullWidth ? 'span 2' : 'span 1',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <label
            htmlFor={`${idPrefix}-${field.name}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.825rem',
              fontWeight: 600,
              color: '#334155',
              marginBottom: '0.35rem',
            }}
          >
            <span>{field.label}</span>
            {field.required ? (
              <span style={{ color: '#ef4444', fontWeight: 700 }} title="Required field">*</span>
            ) : (
              <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 400 }}>(optional)</span>
            )}
          </label>
          {field.name === 'source' ? (
            <CategoryDropdown
              id={`${idPrefix}-${field.name}`}
              name={field.name}
              value={form[field.name]}
              onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
              placeholder={field.placeholder || 'Select category (e.g. IT, Recruitment...)'}
            />
          ) : field.selectOptions ? (
            <select
              id={`${idPrefix}-${field.name}`}
              value={form[field.name]}
              onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.875rem',
                color: '#0f172a',
                backgroundColor: '#ffffff',
                outline: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
              }}
            >
              {field.selectOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : field.multiline ? (
            <textarea
              id={`${idPrefix}-${field.name}`}
              value={form[field.name]}
              onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
              maxLength={field.name === 'note' || field.name === 'address' ? 2000 : 255}
              rows={3}
              required={field.required}
              placeholder={field.placeholder || ''}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.875rem',
                color: '#0f172a',
                backgroundColor: '#ffffff',
                outline: 'none',
                resize: 'vertical',
                minHeight: '75px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
              }}
            />
          ) : (
            <input
              id={`${idPrefix}-${field.name}`}
              type={field.type || 'text'}
              value={form[field.name]}
              onChange={(e) => {
                const value = e.target.value;
                setForm((current) => {
                  const next = { ...current, [field.name]: value };
                  if (
                    field.name === 'phone_number' &&
                    (!current.whatsapp_number || current.whatsapp_number === current.phone_number)
                  ) {
                    next.whatsapp_number = value;
                  }
                  return next;
                });
              }}
              maxLength={255}
              required={field.required}
              placeholder={field.placeholder || ''}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.875rem',
                color: '#0f172a',
                backgroundColor: '#ffffff',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
              }}
            />
          )}
        </div>
      );
    });

  const renderModal = ({ title, onSubmit, submitLabel, idPrefix, onClose }) => (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1rem',
    }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: '760px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          margin: 'auto',
        }}
      >
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              {title}
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0' }}>
              Fields marked with <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span> are required. All other fields are optional.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body: 2-Column Responsive Grid */}
        <div style={{
          padding: '1.5rem 1.75rem',
          overflowY: 'auto',
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '1rem 1.25rem',
        }}>
          {/* Assigned user field - ON TOP and MANDATORY */}
          <div style={{
            gridColumn: 'span 2',
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: '0.25rem',
          }}>
            <label
              htmlFor={`${idPrefix}-owner`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#1e293b',
                marginBottom: '0.35rem',
              }}
            >
              <span>Assigned user</span>
              <span style={{ color: '#ef4444', fontWeight: 700 }} title="Required field">*</span>
            </label>
            <select
              id={`${idPrefix}-owner`}
              required
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.875rem',
                color: '#0f172a',
                backgroundColor: '#ffffff',
                outline: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
              }}
            >
              <option value="">Select assigned user...</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.employee_name}</option>)}
            </select>
          </div>

          {renderFields(idPrefix)}

          {error && (
            <div style={{ gridColumn: 'span 2', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
              <p role="alert" style={{ color: '#b91c1c', margin: 0, fontSize: '0.875rem', fontWeight: 500 }}>{error}</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'flex-end',
          padding: '1.1rem 1.75rem',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
        }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );

  const companyTableFilters = useTableFilters(companies, {
    facets: COMPANY_FILTERS,
    dateField: 'created_at',
  });
  const filteredCompanies = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return companyTableFilters.filteredItems;
    return companyTableFilters.filteredItems.filter((item) => (
      (item.company_name && item.company_name.toLowerCase().includes(q)) ||
      (item.full_name && item.full_name.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.phone_number && item.phone_number.toLowerCase().includes(q)) ||
      (item.whatsapp_number && item.whatsapp_number.toLowerCase().includes(q)) ||
      (item.role && item.role.toLowerCase().includes(q)) ||
      (item.source && item.source.toLowerCase().includes(q)) ||
      (item.note && item.note.toLowerCase().includes(q)) ||
      (item.address && item.address.toLowerCase().includes(q)) ||
      (item.email_status && item.email_status.toLowerCase().includes(q)) ||
      (item.owner?.employee_name && item.owner.employee_name.toLowerCase().includes(q))
    ));
  }, [companyTableFilters.filteredItems, searchTerm]);
  const companyPagination = useTablePagination(filteredCompanies);

  const renderTableFooter = (pagination, totalCount) => (
    <div className="wa-table-footer">
      <div className="wa-footer-left">
        Showing {totalCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1} to {Math.min(pagination.page * pagination.pageSize, totalCount)} of {totalCount} results
      </div>
      <div className="wa-footer-right">
        <button
          type="button"
          className="wa-pg-nav-btn"
          onClick={() => pagination.setPage(Math.max(1, pagination.page - 1))}
          disabled={pagination.page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: pagination.pageCount }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            type="button"
            className={`wa-pg-num-btn ${p === pagination.page ? 'wa-pg-num-active' : ''}`}
            onClick={() => pagination.setPage(p)}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className="wa-pg-nav-btn"
          onClick={() => pagination.setPage(Math.min(pagination.pageCount, pagination.page + 1))}
          disabled={pagination.page >= pagination.pageCount}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
        <span className="wa-rows-label">Rows per page</span>
        <div className="wa-rows-select-wrap">
          <select
            aria-label="Rows per page"
            value={pagination.pageSize}
            onChange={(e) => pagination.setPageSize(Number(e.target.value))}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <ChevronDown size={14} className="wa-rows-arrow" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="wa-dashboard">
      {/* 1. Header */}
      <header className="wa-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h1 className="wa-header-title">Company</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Manage company contacts, email campaigns and engagement metrics
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => companiesQuery.refetch()} disabled={companiesQuery.isFetching}>
            Refresh
          </Button>

          <ExcelImportControls
            entity="company"
            users={users}
            onImported={() => Promise.all([
              queryClient.invalidateQueries({ queryKey: ['companies'] }),
              queryClient.invalidateQueries({ queryKey: ['email-leads'] }),
              queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] }),
              queryClient.invalidateQueries({ queryKey: ['overview-stats'] }),
              queryClient.invalidateQueries({ queryKey: ['global-search'] }),
            ])}
          />
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => { setError(''); setForm(EMPTY_COMPANY); setAddModalOpen(true); }}
          >
            Add Company
          </Button>
        </div>
      </header>

      {notice && (
        <div className="dashboard-section" role="status" style={{ marginBottom: '1rem' }}>
          {notice}
        </div>
      )}
      {error && !addModalOpen && !editModalOpen && !deleteModalOpen && (
        <div className="dashboard-section" role="alert" style={{ marginBottom: '1rem', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* 2. Filter Card (Rounded soft white card) */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(220, 234, 250, 0.95)',
          boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
          padding: '1.15rem 1.35rem',
          marginBottom: '1.5rem',
        }}
      >
        <TableFilters
          {...companyTableFilters}
          showSearch={false}
          hasFilters={companyTableFilters.hasFilters || Boolean(searchTerm)}
          clearFilters={() => {
            companyTableFilters.clearFilters();
            setSearchTerm('');
          }}
        />
      </div>

      {/* 3. Toolbar: Directory info on left, Capsule Search on right */}
      <div className="wa-table-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Company Directory</h2>
          <span className="wa-pill-badge" style={{ padding: '0.2rem 0.65rem' }}>
            {filteredCompanies.length}
          </span>
        </div>

        <div className="wa-toolbar-actions">
          <div className="wa-capsule-search">
            <Search size={15} color="#94a3b8" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search companies by name, email, phone..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                companyPagination.setPage(1);
              }}
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Clear search"
              >
                <X size={13} />
              </button>
            ) : (
              <span className="wa-kbd-shortcut">Ctrl K</span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Floating Card Table Layout */}
      <div className="wa-table-container-wrapper" style={{ minWidth: 0 }}>
        <div className="wa-cards-table-container">
          <table className="wa-cards-table">
            <thead>
              <tr>
                <th style={{ width: '19%' }}>
                  <span className="wa-th-content">Company Name <span className="wa-sort-arrows">↑↓</span></span>
                </th>
                <th style={{ width: '17%' }}>
                  <span className="wa-th-content">Full Name <span className="wa-sort-arrows">↑↓</span></span>
                </th>
                <th style={{ width: '13%' }}>
                  <span className="wa-th-content">Phone <span className="wa-sort-arrows">↑↓</span></span>
                </th>
                <th style={{ width: '21%' }}>
                  <span className="wa-th-content">Email <span className="wa-sort-arrows">↑↓</span></span>
                </th>
                <th style={{ width: '10%' }}>
                  <span className="wa-th-content">Assigned User <span className="wa-sort-arrows">↑↓</span></span>
                </th>
                <th style={{ width: '10%' }}>
                  <span className="wa-th-content">Added <span className="wa-sort-arrows">↑↓</span></span>
                </th>
                <th style={{ width: '12%', minWidth: '115px', textAlign: 'center', paddingRight: '0.75rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#94a3b8', background: '#ffffff', borderRadius: '12px' }}>
                    Loading companies...
                  </td>
                </tr>
              ) : error || companiesQuery.error || usersQuery.error ? (
                <tr>
                  <td colSpan={7} role="alert" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#b91c1c', background: '#ffffff', borderRadius: '12px' }}>
                    {error || companiesQuery.error?.message || usersQuery.error?.message}
                  </td>
                </tr>
              ) : filteredCompanies.length ? companyPagination.pageItems.map((item, index) => {
                const avatar = getAvatarStyle(index);
                const initials = getInitials(item.full_name || item.company_name);
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>{item.company_name || '-'}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>
                        {item.full_name || '-'}
                      </span>
                    </td>
                    <td style={{ color: '#475569' }}>{item.phone_number || '-'}</td>
                    <td style={{ color: '#334155' }}>{item.email || '-'}</td>
                    <td>
                      {item.owner?.employee_name ? (
                        <span style={{ color: '#2563eb', fontWeight: 600 }}>
                          {item.owner.employee_name}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>{formatDateTime(item.created_at)}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', paddingRight: '0.75rem', overflow: 'visible' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
                        <button
                          type="button"
                          title="View full details"
                          onClick={() => openViewModal(item)}
                          style={{
                            width: '28px',
                            height: '28px',
                            flexShrink: 0,
                            borderRadius: '7px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#2563eb',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          title="Edit company"
                          onClick={() => openEditModal(item)}
                          style={{
                            width: '28px',
                            height: '28px',
                            flexShrink: 0,
                            borderRadius: '7px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#0284c7',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          title="Delete company"
                          onClick={() => openDeleteModal(item)}
                          style={{
                            width: '28px',
                            height: '28px',
                            flexShrink: 0,
                            borderRadius: '7px',
                            border: '1px solid #fecaca',
                            backgroundColor: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ef4444',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#64748b', background: '#ffffff', borderRadius: '12px' }}>
                    {searchTerm || companyTableFilters.hasFilters ? (
                      <div>
                        <p style={{ margin: 0, fontWeight: 500 }}>No companies match the selected filters.</p>
                        <button
                          type="button"
                          onClick={() => setSearchTerm('')}
                          style={{
                            marginTop: '0.5rem',
                            background: 'none',
                            border: 'none',
                            color: '#2563eb',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            textDecoration: 'underline',
                          }}
                        >
                          Clear search filter
                        </button>
                      </div>
                    ) : (
                      'No company contacts yet.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {renderTableFooter(companyPagination, filteredCompanies.length)}
      </div>

      {/* Add Modal */}
      {addModalOpen && renderModal({
        title: 'Add Company Contact',
        onSubmit: submitCompany,
        submitLabel: 'Save Company',
        idPrefix: 'add-company',
        onClose: () => setAddModalOpen(false),
      })}

      {/* Edit Modal */}
      {editModalOpen && renderModal({
        title: `Edit: ${selectedCompany?.company_name || selectedCompany?.full_name || 'Company'}`,
        onSubmit: submitEdit,
        submitLabel: 'Update Company',
        idPrefix: 'edit-company',
        onClose: () => { setEditModalOpen(false); setSelectedCompany(null); },
      })}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem',
        }}>
          <div className="dashboard-section" style={{ maxWidth: 440, width: '100%', margin: 0, backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
            <h2 className="section-title" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>Delete Company Contact</h2>
            <p style={{ marginBottom: '1rem', color: '#475569', fontSize: '0.875rem' }}>
              Are you sure you want to delete{' '}
              <strong>{selectedCompany?.company_name || selectedCompany?.full_name || selectedCompany?.email || 'this company'}</strong>?
              This action cannot be undone.
            </p>
            {error && <p role="alert" style={{ color: '#b91c1c', marginBottom: '1rem' }}>{error}</p>}
            <div className="flex gap-2" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setDeleteModalOpen(false); setSelectedCompany(null); }}
                disabled={deleting}
              >
                Cancel
              </Button>
    
              <Button
                type="button"
                variant="primary"
                onClick={confirmDelete}
                disabled={deleting}
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View Full Details Modal */}
      {viewModalOpen && viewingCompany && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem',
        }}>
          <div
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              margin: 'auto',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.75rem',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
            }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  {viewingCompany.company_name || viewingCompany.full_name || 'Company Details'}
                </h2>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                  Full contact profile and campaign analytics
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setViewModalOpen(false); setViewingCompany(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '6px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
              {/* Primary Contact Info Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '1rem 1.5rem',
                marginBottom: '1.5rem',
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Full Name</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                    {viewingCompany.full_name || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Company Name</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                    {viewingCompany.company_name || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Email Address</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingCompany.email || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Phone Number</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingCompany.phone_number || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>WhatsApp Number</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingCompany.whatsapp_number || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Role / Designation</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingCompany.role || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Assigned User</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#2563eb', marginTop: '2px' }}>
                    {viewingCompany.owner?.employee_name || 'Unassigned'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Source</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingCompany.source || 'Manual Entry'}
                  </div>
                </div>

                {viewingCompany.address && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Address</div>
                    <div style={{ fontSize: '0.9rem', color: '#334155', marginTop: '2px', whiteSpace: 'pre-line' }}>
                      {viewingCompany.address}
                    </div>
                  </div>
                )}
              </div>

              {/* Email Campaign & Engagement Analytics Card */}
              <div style={{
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.85rem' }}>
                  Email Campaign & Engagement Metrics
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: '0.75rem',
                }}>
                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Email Status</div>
                    <div style={{ marginTop: '4px' }}>
                      {statusBadge(viewingCompany.email_status)}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Total Clicks</div>
                    <div style={{ marginTop: '4px' }}>
                      <ClickBadge count={viewingCompany.click_count || 0} label="Total clicks" color="#0076FF" />
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Demo Clicks</div>
                    <div style={{ marginTop: '4px' }}>
                      <ClickBadge count={viewingCompany.demo_click_count || 0} label="Demo clicks" color="#7c3aed" />
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Video Clicks</div>
                    <div style={{ marginTop: '4px' }}>
                      <ClickBadge count={viewingCompany.video_click_count || 0} label="Video clicks" color="#0891b2" />
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Follow-ups</div>
                    <div style={{ marginTop: '4px' }}>
                      <ClickBadge count={viewingCompany.follow_up_count || 0} label="Follow-ups sent" color="#d97706" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Social Profiles */}
              {(viewingCompany.linkedin_url || viewingCompany.facebook_url) && (
                <div style={{
                  display: 'flex',
                  gap: '1.5rem',
                  marginBottom: '1.25rem',
                  flexWrap: 'wrap',
                }}>
                  {viewingCompany.linkedin_url && (
                    <a
                      href={viewingCompany.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#0076FF',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <span>LinkedIn Profile</span>
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {viewingCompany.facebook_url && (
                    <a
                      href={viewingCompany.facebook_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#0076FF',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <span>Facebook Profile</span>
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              )}

              {/* Notes */}
              {viewingCompany.note && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Notes</div>
                  <div style={{
                    background: '#f1f5f9',
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#334155',
                    whiteSpace: 'pre-line',
                  }}>
                    {viewingCompany.note}
                  </div>
                </div>
              )}

              {/* Added timestamp */}
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                Added on: {formatDateTime(viewingCompany.created_at)}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              padding: '1rem 1.75rem',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
            }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setViewModalOpen(false); setViewingCompany(null); }}
              >
                Close
              </Button>
    
              <Button
                type="button"
                variant="primary"
                icon={<Pencil size={15} />}
                onClick={() => {
                  const companyToEdit = viewingCompany;
                  setViewModalOpen(false);
                  setViewingCompany(null);
                  openEditModal(companyToEdit);
                }}
              >
                Edit Company
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Company;
