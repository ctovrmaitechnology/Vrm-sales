import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, ExternalLink, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import Button from '../components/Button';
import ExcelImportControls from '../components/ExcelImportControls';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';

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
          {field.selectOptions ? (
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

  const COLS = 7; // total <th> count

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Company</h1>
          <p className="page-subtitle">Manage company contacts, email campaigns and engagement metrics</p>
        </div>
        <div className="flex gap-2">
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
      </div>

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

      <div className="dashboard-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Company Directory</h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
              Showing {filteredCompanies.length} of {companies.length} companies
            </p>
          </div>

          {/* Search Input Bar */}
          <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                companyPagination.setPage(1);
              }}
              placeholder="Search companies by name, email, phone..."
              style={{
                width: '100%',
                padding: '0.55rem 2.2rem 0.55rem 2.4rem',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.875rem',
                outline: 'none',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#0076FF';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 118, 255, 0.12)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '0.6rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
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
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        <TableFilters
          {...companyTableFilters}
          showSearch={false}
          hasFilters={companyTableFilters.hasFilters || Boolean(searchTerm)}
          clearFilters={() => {
            companyTableFilters.clearFilters();
            setSearchTerm('');
          }}
        />

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Full Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Assigned User</th>
                <th>Added</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLS} style={{ textAlign: 'center', padding: '2rem' }}>Loading companies...</td></tr>
              ) : error || companiesQuery.error || usersQuery.error ? (
                <tr><td colSpan={COLS} role="alert" style={{ textAlign: 'center', padding: '2rem', color: '#b91c1c' }}>
                  {error || companiesQuery.error?.message || usersQuery.error?.message}
                </td></tr>
              ) : filteredCompanies.length ? companyPagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.company_name || '-'}</td>
                  <td>{item.full_name || '-'}</td>
                  <td>{item.phone_number || '-'}</td>
                  <td>{item.email || '-'}</td>
                  <td>{item.owner?.employee_name || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(item.created_at)}</td>
                  <td>
                    <div className="flex gap-2" style={{ justifyContent: 'center' }}>
                      <button
                        type="button"
                        title="View full details"
                        onClick={() => openViewModal(item)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#2563eb', padding: '4px',
                        }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        title="Edit company"
                        onClick={() => openEditModal(item)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#0076FF', padding: '4px',
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        title="Delete company"
                        onClick={() => openDeleteModal(item)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#dc2626', padding: '4px',
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={COLS} style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
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
                            color: '#0076FF',
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
        <TablePagination {...companyPagination} />
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
          <div className="dashboard-section" style={{ maxWidth: 440, width: '100%', margin: 0 }}>
            <h2 className="section-title">Delete Company Contact</h2>
            <p style={{ marginBottom: '1rem' }}>
              Are you sure you want to delete{' '}
              <strong>{selectedCompany?.company_name || selectedCompany?.full_name || selectedCompany?.email || 'this company'}</strong>?
              This action cannot be undone.
            </p>
            {error && <p role="alert" style={{ color: '#b91c1c', marginBottom: '1rem' }}>{error}</p>}
            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
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
