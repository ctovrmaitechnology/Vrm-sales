import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, ExternalLink, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Button from '../components/Button';
import ExcelImportControls from '../components/ExcelImportControls';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${BACKEND_BASE_URL}${path}`;
const EMPTY_LIST = [];
const LEAD_FILTERS = [
  { key: 'status', label: 'Status', field: 'status' },
  { key: 'email_status', label: 'Email status', field: 'email_status' },
  { key: 'source', label: 'Source', field: 'source' },
  { key: 'owner', label: 'Assigned user', field: 'owner.employee_name' },
];

const LEAD_FIELDS = [
  { name: 'full_name', label: 'Full name', required: true, placeholder: 'e.g. Alex Johnson' },
  { name: 'email', label: 'Email', type: 'email', placeholder: 'alex@company.com' },
  { name: 'phone_number', label: 'Phone number', type: 'tel', placeholder: '+91 98765 43210' },
  { name: 'whatsapp_number', label: 'WhatsApp number', type: 'tel', placeholder: '+91 98765 43210' },
  { name: 'company_name', label: 'Company name', placeholder: 'e.g. Acme Corp' },
  { name: 'role', label: 'Role / Designation', placeholder: 'e.g. HR Manager' },
  { name: 'linkedin_url', label: 'LinkedIn URL', type: 'url', placeholder: 'https://linkedin.com/in/...' },
  { name: 'facebook_url', label: 'Facebook URL', type: 'url', placeholder: 'https://facebook.com/...' },
  { name: 'source', label: 'Source', placeholder: 'e.g. Manual Entry, Referral' },
  { name: 'note', label: 'Note', multiline: true, placeholder: 'Add background notes or context...', fullWidth: true },
  { name: 'address', label: 'Address', multiline: true, placeholder: 'City, State, Country...', fullWidth: true },
];

const EMPTY_LEAD = {
  ...Object.fromEntries(LEAD_FIELDS.map(({ name }) => [name, ''])),
  status: 'new',
  email_status: 'not sent',
  user_id: '',
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

const Leads = () => {
  const queryClient = useQueryClient();
  const manualLeadsQuery = useQuery({
    queryKey: ['manual-leads'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/manual-leads'));
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to load manually added leads.');
      if (!Array.isArray(data)) throw new Error('The leads API returned an invalid response.');
      return data;
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
  const manualLeads = manualLeadsQuery.data || EMPTY_LIST;
  const users = usersQuery.data || EMPTY_LIST;
  const loading = manualLeadsQuery.isLoading;
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [viewingLead, setViewingLead] = useState(null);
  const [deletingLead, setDeletingLead] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lead, setLead] = useState(EMPTY_LEAD);
  const [editingId, setEditingId] = useState(null); // null = add mode, number = edit mode
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const openAddModal = () => {
    setError('');
    setEditingId(null);
    setLead(EMPTY_LEAD);
    setModalOpen(true);
  };

  const openEditModal = (item) => {
    setError('');
    setEditingId(item.id);
    setLead({
      full_name: item.full_name || '',
      whatsapp_number: item.whatsapp_number || '',
      facebook_url: item.facebook_url || '',
      linkedin_url: item.linkedin_url || '',
      company_name: item.company_name || '',
      phone_number: item.phone_number || '',
      email: item.email || '',
      role: item.role || '',
      source: item.source || '',
      status: item.status || 'new',
      note: item.note || '',
      email_status: item.email_status || 'not sent',
      address: item.address || '',
      user_id: item.user_id != null ? String(item.user_id) : '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setLead(EMPTY_LEAD);
  };

  const saveLead = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    if (!lead.user_id) {
      setError('Please select an assigned user.');
      setSaving(false);
      return;
    }

    const isEdit = editingId !== null;
    const url = isEdit ? apiUrl(`/api/manual-leads/${editingId}`) : apiUrl('/api/manual-leads');
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to save lead.');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['email-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['overview-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['global-search'] }),
      ]);
      setNotice(isEdit ? 'Lead updated successfully.' : 'Lead added successfully.');

      closeModal();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const openViewModal = (item) => {
    setViewingLead(item);
    setViewModalOpen(true);
  };

  const openDeleteModal = (item) => {
    setDeletingLead(item);
    setError('');
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingLead) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(apiUrl(`/api/manual-leads/${deletingLead.id}`), {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to delete lead.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['email-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['overview-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['global-search'] }),
      ]);
      setDeleteModalOpen(false);
      setDeletingLead(null);
      setNotice('Lead deleted successfully.');
    } catch (delError) {
      setError(delError.message);
    } finally {
      setDeleting(false);
    }
  };

  const leadTableFilters = useTableFilters(manualLeads, {
    facets: LEAD_FILTERS,
    dateField: 'created_at',
  });
  const filteredLeads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return leadTableFilters.filteredItems;
    return leadTableFilters.filteredItems.filter((item) => (
      (item.full_name && item.full_name.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.phone_number && item.phone_number.toLowerCase().includes(q)) ||
      (item.whatsapp_number && item.whatsapp_number.toLowerCase().includes(q)) ||
      (item.company_name && item.company_name.toLowerCase().includes(q)) ||
      (item.role && item.role.toLowerCase().includes(q)) ||
      (item.source && item.source.toLowerCase().includes(q)) ||
      (item.note && item.note.toLowerCase().includes(q)) ||
      (item.address && item.address.toLowerCase().includes(q)) ||
      (item.owner?.employee_name && item.owner.employee_name.toLowerCase().includes(q))
    ));
  }, [leadTableFilters.filteredItems, searchTerm]);
  const leadPagination = useTablePagination(filteredLeads);

  return (
    <div>
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">Manage manually added leads</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <ExcelImportControls
            entity="lead"
            users={users}
            onImported={() => Promise.all([
              queryClient.invalidateQueries({ queryKey: ['manual-leads'] }),
              queryClient.invalidateQueries({ queryKey: ['email-leads'] }),
              queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] }),
              queryClient.invalidateQueries({ queryKey: ['overview-stats'] }),
              queryClient.invalidateQueries({ queryKey: ['global-search'] }),
            ])}
          />
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={openAddModal}
          >
            Add Lead
          </Button>
        </div>
      </div>

      {notice && (
        <div className="dashboard-section" role="status" style={{ marginBottom: '1rem' }}>
          {notice}
        </div>
      )}

      {error && !modalOpen && (
        <div className="dashboard-section" role="alert" style={{ marginBottom: '1rem', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <div className="dashboard-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Manually Added Leads</h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
              Showing {filteredLeads.length} of {manualLeads.length} leads
            </p>
          </div>

          {/* Search Input */}
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
                leadPagination.setPage(1);
              }}
              placeholder="Search leads by name, email, company, phone..."
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
          {...leadTableFilters}
          showSearch={false}
          hasFilters={leadTableFilters.hasFilters || Boolean(searchTerm)}
          clearFilters={() => {
            leadTableFilters.clearFilters();
            setSearchTerm('');
          }}
        />

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone Number</th>
                <th>Additional Information</th>
                <th>Assigned User</th>
                <th>Added</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>Loading leads...</td></tr>
              ) : error || manualLeadsQuery.error || usersQuery.error ? (
                <tr><td colSpan="8" role="alert" style={{ textAlign: 'center', color: '#b91c1c', padding: '2rem' }}>
                  {error || manualLeadsQuery.error?.message || usersQuery.error?.message}
                </td></tr>
              ) : filteredLeads.length ? leadPagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.full_name || '-'}</td>
                  <td>{item.company_name || '-'}</td>
                  <td>{item.email || '-'}</td>
                  <td>{item.phone_number || '-'}</td>
                  <td>{item.note || '-'}</td>
                  <td>{item.owner?.employee_name || '-'}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                      <button
                        type="button"
                        title="View full details"
                        onClick={() => openViewModal(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          color: '#2563eb',
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: '4px',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        title="Edit lead"
                        onClick={() => openEditModal(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          color: '#0076FF',
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: '4px',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        title="Delete lead"
                        onClick={() => openDeleteModal(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          color: '#dc2626',
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: '4px',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                    {searchTerm || leadTableFilters.hasFilters ? (
                      <div>
                        <p style={{ margin: 0, fontWeight: 500 }}>No leads match the selected filters.</p>
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
                      'No manually added leads yet.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination {...leadPagination} />
      </div>

      {modalOpen && (
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
            onSubmit={saveLead}
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
                  {editingId !== null ? 'Edit Lead' : 'Add Lead'}
                </h2>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                  Fields marked with <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span> are required. All other fields are optional.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
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
                  htmlFor="manual-lead-owner"
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
                  id="manual-lead-owner"
                  required
                  value={lead.user_id}
                  onChange={(event) => setLead({ ...lead, user_id: event.target.value })}
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
                  {users.map((user) => <option key={user.id} value={user.id}>{user.employee_name}</option>)}
                </select>
              </div>

              {LEAD_FIELDS.map((field) => {
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
                      htmlFor={`manual-lead-${field.name}`}
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

                    {field.select ? (
                      <select
                        id={`manual-lead-${field.name}`}
                        value={lead[field.name]}
                        onChange={(event) => setLead({ ...lead, [field.name]: event.target.value })}
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
                        {(field.options || ['not sent', 'new', 'sent', 'failed']).map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    ) : field.multiline ? (
                      <textarea
                        id={`manual-lead-${field.name}`}
                        value={lead[field.name]}
                        onChange={(event) => setLead({ ...lead, [field.name]: event.target.value })}
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
                        id={`manual-lead-${field.name}`}
                        type={field.type || 'text'}
                        value={lead[field.name]}
                        onChange={(event) => {
                          const value = event.target.value;
                          setLead((current) => {
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
              })}

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
              <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving...' : editingId !== null ? 'Save Changes' : 'Save Lead'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* View Full Details Modal */}
      {viewModalOpen && viewingLead && (
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
                  {viewingLead.full_name || 'Lead Details'}
                </h2>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                  {viewingLead.company_name ? `Company: ${viewingLead.company_name}` : 'Full contact profile and notes'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setViewModalOpen(false); setViewingLead(null); }}
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
                    {viewingLead.full_name || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Company Name</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                    {viewingLead.company_name || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Email Address</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingLead.email || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Phone Number</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingLead.phone_number || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>WhatsApp Number</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingLead.whatsapp_number || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Role / Designation</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingLead.role || '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Assigned User</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#2563eb', marginTop: '2px' }}>
                    {viewingLead.owner?.employee_name || 'Unassigned'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Source</div>
                  <div style={{ fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                    {viewingLead.source || 'Manual Entry'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Email Status</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: viewingLead.email_status === 'sent' ? '#047857' : '#64748b', marginTop: '2px', textTransform: 'capitalize' }}>
                    {viewingLead.email_status || 'not sent'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Lead Status</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginTop: '2px', textTransform: 'capitalize' }}>
                    {viewingLead.status || 'new'}
                  </div>
                </div>

                {viewingLead.address && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Address</div>
                    <div style={{ fontSize: '0.9rem', color: '#334155', marginTop: '2px', whiteSpace: 'pre-line' }}>
                      {viewingLead.address}
                    </div>
                  </div>
                )}
              </div>

              {/* Social Profiles */}
              {(viewingLead.linkedin_url || viewingLead.facebook_url) && (
                <div style={{
                  display: 'flex',
                  gap: '1.5rem',
                  marginBottom: '1.25rem',
                  flexWrap: 'wrap',
                }}>
                  {viewingLead.linkedin_url && (
                    <a
                      href={viewingLead.linkedin_url}
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
                  {viewingLead.facebook_url && (
                    <a
                      href={viewingLead.facebook_url}
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

              {/* Additional Information / Notes */}
              {viewingLead.note && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Additional Information / Note</div>
                  <div style={{
                    background: '#f1f5f9',
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#334155',
                    whiteSpace: 'pre-line',
                  }}>
                    {viewingLead.note}
                  </div>
                </div>
              )}

              {/* Added timestamp */}
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                Added on: {formatDateTime(viewingLead.created_at)}
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
                onClick={() => { setViewModalOpen(false); setViewingLead(null); }}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="primary"
                icon={<Pencil size={15} />}
                onClick={() => {
                  const leadToEdit = viewingLead;
                  setViewModalOpen(false);
                  setViewingLead(null);
                  openEditModal(leadToEdit);
                }}
              >
                Edit Lead
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem',
        }}>
          <div className="dashboard-section" style={{ maxWidth: 440, width: '100%', margin: 0 }}>
            <h2 className="section-title">Delete Lead</h2>
            <p style={{ marginBottom: '1rem', color: '#334155', fontSize: '0.9rem' }}>
              Are you sure you want to delete{' '}
              <strong>{deletingLead?.full_name || deletingLead?.email || 'this lead'}</strong>?
              This action cannot be undone.
            </p>
            {error && <p role="alert" style={{ color: '#b91c1c', marginBottom: '1rem' }}>{error}</p>}
            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setDeleteModalOpen(false); setDeletingLead(null); }}
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
    </div>
  );
};

export default Leads;
