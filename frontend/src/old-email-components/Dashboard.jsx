import { useState, useRef, useEffect } from 'react';
import '../styles/whatsapp.css';
import {
  Download, Send, Loader2, RefreshCw, Search, X, CheckSquare,
  CheckCheck, ChevronLeft, ChevronRight, ChevronDown, Trash2,
  CheckCircle2, Clock, Users, Building
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../components/AppContext';
import { DEFAULT_PRODUCT, PRODUCTS } from '../config/products';
import CampaignProgressWidget from '../components/CampaignProgressWidget';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const EMPTY_LIST = [];

const AVATAR_PALETTES = [
  { bg: '#dbeafe', color: '#1d4ed8' }, // Blue
  { bg: '#ffe4e6', color: '#e11d48' }, // Rose/Red
  { bg: '#dcfce7', color: '#15803d' }, // Green
  { bg: '#f3e8ff', color: '#7e22ce' }, // Purple
  { bg: '#cffafe', color: '#0e7490' }, // Cyan
  { bg: '#ffedd5', color: '#c2410c' }, // Amber/Orange
];

const getAvatarStyle = (index = 0) => AVATAR_PALETTES[index % AVATAR_PALETTES.length];

const getInitials = (name) => {
  if (!name || name === '-') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 1).toUpperCase();
};

const EMAIL_LEAD_FILTER_CONFIG = {
  facets: [
    { key: 'status', label: 'Status', field: (lead) => lead.email_status || lead.status },
    { key: 'source', label: 'Source', field: 'source' },
    { key: 'owner', label: 'Assigned user', field: 'owner.employee_name' },
  ],
};

const EMAIL_COMPANY_FILTER_CONFIG = {
  facets: [
    { key: 'emailStatus', label: 'Email status', field: 'email_status' },
    { key: 'source', label: 'Source', field: 'source' },
    { key: 'owner', label: 'Assigned user', field: 'owner.employee_name' },
  ],
};

const SENT_EMAIL_FILTER_CONFIG = {
  facets: [
    { key: 'type', label: 'Type', field: 'type', options: ['Lead', 'Company'] },
    { key: 'status', label: 'Status', field: 'leadStatus' },
  ],
};

const LEAD_STATUS_LABELS = {
  'not sent': 'Not Sent',
  new: 'Not Sent',
  failed: 'Failed',
  sent: 'Not Clicked',
  clicked: 'Clicked',
  converted_to_lead: 'Converted to Lead',
  follow_up_sent: 'Follow-up Sent'
};

const getLeadStatusLabel = (status) => LEAD_STATUS_LABELS[status] || 'Not Sent';

const getFollowUpStatusLabel = (lead) => {
  const count = lead.followUpCount || 0;
  if (count >= 3 || lead.status === 'follow_up_sent') return 'Follow-up 3 Sent';
  if (count === 2) return 'Follow-up 2 Sent';
  if (count === 1) return 'Follow-up 1 Sent';
  return 'No Follow-up Sent';
};

const isLeadSent = (lead) => {
  if (!lead) return false;
  if (lead.email_status === 'sent') return true;
  if (lead.initialEmailSent) return true;
  return false;
};

const isCompanySent = (company) => {
  if (!company) return false;
  if (company.email_status === 'sent') return true;
  return false;
};

export default function Dashboard() {
  const { searchQuery } = useApp();
  const queryClient = useQueryClient();

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  const [currentPage, setCurrentPage] = useState('leads');

  const leadsQuery = useQuery({
    queryKey: ['email-leads'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/ingestion/email'));
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load leads.');
      if (!Array.isArray(data)) throw new Error('The leads API returned an invalid response.');
      return data;
    },
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/companies'));
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || data?.error || 'Failed to load companies.');
      const rows = Array.isArray(data) ? data : data?.data;
      if (!Array.isArray(rows)) throw new Error('The companies API returned an invalid response.');
      return rows;
    },
  });

  const leads = leadsQuery.data || EMPTY_LIST;
  const companies = companiesQuery.data || EMPTY_LIST;

  const [uploadUserId, setUploadUserId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [checkingFollowUps, setCheckingFollowUps] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [addLeadModalOpen, setAddLeadModalOpen] = useState(false);
  const [singleLead, setSingleLead] = useState({ name: '', email: '', phone: '', product_type: 'workflow_ai', user_id: '' });
  const [singleStatus, setSingleStatus] = useState('');
  const [singleLoading, setSingleLoading] = useState(false);
  const [campaignProduct, setCampaignProduct] = useState(DEFAULT_PRODUCT);
  const [batchSize, setBatchSize] = useState('');
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const refreshing = leadsQuery.isFetching || companiesQuery.isFetching;

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

  // ==========================================
  // FETCH DASHBOARD DATA
  // ==========================================
  const refreshData = async () => {
    setLoadError('');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['email-leads'] }),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
      queryClient.invalidateQueries({ queryKey: ['overview-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['global-search'] }),
    ]);
  };

  const leadTableFilters = useTableFilters(leads, EMAIL_LEAD_FILTER_CONFIG);
  const companyTableFilters = useTableFilters(companies, EMAIL_COMPANY_FILTER_CONFIG);

  const filteredLeads = leadTableFilters.filteredItems.filter((lead) => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return true;

    return [
      lead.name,
      lead.full_name,
      lead.email,
      lead.phone,
      lead.phoneNumber,
      lead.phone_number,
      lead.company,
      lead.company_name,
      lead.role,
      lead.source,
      lead.product,
      lead.status,
      getLeadStatusLabel?.(lead.status),
      lead.followUp1Sent ? 'follow up 1 follow-up 1 followup1 follow up 1 sent' : '',
      lead.followUp2Sent ? 'follow up 2 follow-up 2 followup2 follow up 2 sent' : '',
      lead.followUp3Sent ? 'follow up 3 follow-up 3 followup3 follow up 3 sent' : '',
      getFollowUpStatusLabel?.(lead),
    ]
      .filter(Boolean)
      .some((value) => value.toString().toLowerCase().includes(search));
  });

  const filteredCompanies = companyTableFilters.filteredItems.filter((company) => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return true;
    return [
      company.company_name,
      company.full_name,
      company.email,
      company.phone_number,
      company.role,
      company.status,
      company.email_status,
    ]
      .filter(Boolean)
      .some((val) => val.toString().toLowerCase().includes(search));
  });

  // ── Unsent Lists (for My Leads & Company tabs) ───────────────────
  const unsentLeads = filteredLeads.filter(
    (lead) => !lead.isCompanyContact && !isLeadSent(lead)
  );

  const unsentCompanies = filteredCompanies.filter(
    (company) => !isCompanySent(company)
  );

  // ── Sent List (Combined for Sent tab) ────────────────────────────
  const sentLeads = filteredLeads
    .filter((lead) => !lead.isCompanyContact && isLeadSent(lead))
    .map((lead) => ({
      id: `lead-${lead.id || lead.email}`,
      name: lead.name || lead.full_name || '-',
      type: 'Lead',
      companyName: lead.company || lead.company_name || '-',
      email: lead.email,
      phone: lead.phone || lead.phoneNumber || '-',
      sentStatus: 'Sent',
      leadStatus: lead.status || 'sent',
      followUpStatus: getFollowUpStatusLabel(lead),
      followUpComplete: getFollowUpStatusLabel(lead) === 'Follow-up 3 Sent',
      clickCount: lead.clickCount || 0,
      bookDemoClickCount: lead.bookDemoClickCount || 0,
      videoClickCount: lead.videoClickCount || 0,
      raw: lead,
      isCompany: false,
    }));

  const sentCompanies = filteredCompanies
    .filter((company) => isCompanySent(company))
    .map((company) => ({
      id: `company-${company.id}`,
      name: company.full_name || '-',
      type: 'Company',
      companyName: company.company_name || '-',
      email: company.email,
      phone: company.phone_number || '-',
      sentStatus: 'Sent',
      leadStatus: company.status || 'sent',
      followUpStatus: '-',
      followUpComplete: false,
      clickCount: company.click_count || 0,
      bookDemoClickCount: company.demo_click_count || 0,
      videoClickCount: company.video_click_count || 0,
      raw: company,
      isCompany: true,
    }));

  const sentItems = [];
  const sentEmailSet = new Set();
  for (const item of [...sentLeads, ...sentCompanies]) {
    if (item.email) {
      const key = item.email.toLowerCase();
      if (sentEmailSet.has(key)) continue;
      sentEmailSet.add(key);
    }
    sentItems.push(item);
  }

  const sentTableFilters = useTableFilters(sentItems, SENT_EMAIL_FILTER_CONFIG);
  const companyPagination = useTablePagination(unsentCompanies);
  const leadPagination = useTablePagination(unsentLeads);
  const sentPagination = useTablePagination(sentTableFilters.filteredItems);

  const selectableLeads = unsentLeads.filter((lead) => lead.email);
  const totalLeadsCount = filteredLeads.filter((lead) => !lead.isCompanyContact).length;
  const totalCompaniesCount = filteredCompanies.length;
  const selectedLeadCount = selectedEmails.length;
  const selectedCompanyCount = selectedCompanyIds.length;
  const selectedCount = currentPage === 'companies' ? selectedCompanyCount : currentPage === 'leads' ? selectedLeadCount : 0;
  const invalidBatchSize = batchSize !== '' && (!Number.isInteger(Number(batchSize)) || Number(batchSize) < 1);

  // ==========================================
  // HANDLE LOGIN
  // ==========================================
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoading(false);
    setIsLoggedIn(true);
    localStorage.setItem('isLoggedIn', 'true');
  };

  // ==========================================
  // HANDLE FILE UPLOAD
  // ==========================================
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', uploadUserId);

    try {
      const response = await fetch(apiUrl('/api/upload-leads'), {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (response.ok) {
        alert(result.message || 'Upload successful!');
        refreshData();
      } else {
        alert(result.error || 'Failed to upload file');
      }
    } catch (err) {
      console.error('Upload error', err);
      alert('An error occurred during upload.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  // ==========================================
  // DELETE LEAD
  // ==========================================
  const deleteLead = async (email) => {
    if (!window.confirm(`Are you sure you want to delete lead: ${email}?`)) return;

    try {
      const response = await fetch(apiUrl(`/api/delete`), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier: email }),
      });

      if (response.ok) {
        refreshData();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete lead.');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('An error occurred while deleting the lead.');
    }
  };

  const deleteSelectedLeads = async () => {
    if (!selectedEmails.length) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedEmails.length} selected lead${selectedEmails.length === 1 ? '' : 's'}?`)) return;
    try {
      await Promise.all(
        selectedEmails.map((email) =>
          fetch(apiUrl('/api/delete'), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: email }),
          })
        )
      );
      setSelectedEmails([]);
      refreshData();
    } catch (err) {
      console.error('Delete selected error:', err);
      alert('An error occurred while deleting selected leads.');
    }
  };

  const updateLeadStatus = async (lead, status) => {
    if (status !== 'converted_to_lead' || lead.status === status) return;

    try {
      const response = await fetch(apiUrl(`/api/lead/${encodeURIComponent(lead.email)}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (response.ok) {
        refreshData();
      } else {
        alert(data.error || 'Failed to update lead status.');
      }
    } catch (err) {
      console.error('Status update error:', err);
      alert('An error occurred while updating the lead status.');
    }
  };

  // ==========================================
  // SEND EMAILS
  // ==========================================
  const sendEmails = async (product, batch) => {
    setSendingEmails(true);

    try {
      const payload = { product };
      const emails = currentPage === 'leads' ? selectedEmails : [];
      let companyIds = [];
      if (currentPage === 'companies') {
        companyIds = selectedCompanyIds.length
          ? selectedCompanyIds
          : unsentCompanies.filter((c) => c.email).map((c) => c.id);
      }
      if (batch !== '') {
        payload.batchSize = Number(batch);
      }
      if (emails.length > 0) payload.selectedEmails = emails;
      if (companyIds.length > 0) payload.selectedCompanyIds = companyIds;

      const res = await fetch(apiUrl('/api/send-emails'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setSelectedEmails([]);
        setSelectedCompanyIds([]);
        setCampaignModalOpen(false);
        window.dispatchEvent(new CustomEvent('campaign-started', { detail: { type: 'email' } }));
      } else {
        alert(`Error sending emails: ${data.error}`);
      }
    } catch (error) {
      console.error(error);
      alert(error.message || 'Failed to connect to the server to send emails.');
    } finally {
      setSendingEmails(false);
    }
  };

  const sendSingleLead = async (lead) => {
    if (!lead.email || (lead.status && !['not sent', 'new', 'failed'].includes(lead.status))) return;
    setSelectedEmails([lead.email]);
    setCampaignModalOpen(true);
  };

  const checkFollowUps = async () => {
    setCheckingFollowUps(true);

    try {
      const response = await fetch(apiUrl('/api/follow-ups/check'), {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok) {
        alert(data.message || 'Follow-up check started.');
      } else {
        alert(data.message || data.error || 'Failed to start follow-up check.');
      }
    } catch (error) {
      console.error(error);
      alert('Failed to connect to the server to check follow-ups.');
    } finally {
      setCheckingFollowUps(false);
      refreshData();
    }
  };

  // ==========================================
  // NAVIGATE TO PAGE
  // ==========================================
  const navTo = (page) => {
    setSelectedEmails([]);
    setSelectedCompanyIds([]);
    setCurrentPage(page);
  };

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!singleLead.email && !singleLead.phone) {
      setSingleStatus('❌ Email or Phone is required');
      return;
    }

    setSingleLoading(true);
    setSingleStatus('Sending Campaign... ⏳');

    try {
      const payload = {
        ...singleLead,
        sendImmediately: true,
      };

      const res = await fetch(apiUrl('/api/upload-lead-json'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setSingleStatus(`✅ Success! Campaign sent.`);
        setTimeout(() => {
          setAddLeadModalOpen(false);
          setSingleStatus('');
          setSingleLead({ name: '', email: '', phone: '', product_type: 'workflow_ai', user_id: '' });
          refreshData();
        }, 1500);
      } else {
        setSingleStatus(`❌ Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Submit error:', err);
      setSingleStatus('❌ Submit Failed');
    } finally {
      setSingleLoading(false);
    }
  };

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

  // ==========================================
  // RENDER MAIN DASHBOARD
  // ==========================================
  return (
    <div className="wa-dashboard">
      {/* 1. TOP HEADER */}
      <header className="wa-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h1 className="wa-header-title">Email Outreach</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Manage email campaigns and lead tracking
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          <button
            onClick={refreshData}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
            title="Refresh leads and companies"
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
          >
            <Download size={16} />
            {uploading ? 'Uploading...' : 'Upload Leads'}
          </button>

          <button
            onClick={() => setCampaignModalOpen(true)}
            disabled={sendingEmails || currentPage === 'sent'}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
            title={currentPage === 'sent' ? 'Switch to My Leads or Company to send campaigns' : ''}
          >
            {sendingEmails ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Send size={16} />
            )}
            {sendingEmails ? 'Sending Emails...' : selectedCount ? `Send Selected (${selectedCount})` : 'Send Emails'}
          </button>
        </div>
      </header>

      {loadError && (
        <div role="alert" style={{ marginBottom: '1rem', color: '#b91c1c' }}>
          {loadError}
        </div>
      )}
      {(leadsQuery.error || companiesQuery.error) && (
        <div role="alert" style={{ marginBottom: '1rem', color: '#b91c1c' }}>
          {leadsQuery.error?.message || companiesQuery.error?.message}
        </div>
      )}

      {/* 2. OVERVIEW STAT CARDS (Image 1 Colors & Design) */}
      {currentPage === 'leads' && (
        <div className="wa-cards-grid" style={{ marginBottom: '1.75rem' }}>
          <div className="wa-card">
            <p className="wa-card-label wa-card-label-default">Total Leads</p>
            <h2 className="wa-card-value wa-card-value-default">{totalLeadsCount}</h2>
          </div>
          <div className="wa-card wa-card-purple">
            <p className="wa-card-label wa-card-label-purple">Selected Leads</p>
            <h2 className="wa-card-value wa-card-value-purple">{selectedLeadCount}</h2>
          </div>
          <div className="wa-card wa-card-blue">
            <p className="wa-card-label wa-card-label-blue">Unsent Leads</p>
            <h2 className="wa-card-value wa-card-value-blue">{unsentLeads.length}</h2>
          </div>
          <div className="wa-card wa-card-green">
            <p className="wa-card-label wa-card-label-green">Emails Sent</p>
            <h2 className="wa-card-value wa-card-value-green">{sentLeads.length}</h2>
          </div>
        </div>
      )}

      {currentPage === 'companies' && (
        <div className="wa-cards-grid" style={{ marginBottom: '1.75rem' }}>
          <div className="wa-card">
            <p className="wa-card-label wa-card-label-default">Total Companies</p>
            <h2 className="wa-card-value wa-card-value-default">{totalCompaniesCount}</h2>
          </div>
          <div className="wa-card wa-card-purple">
            <p className="wa-card-label wa-card-label-purple">Selected Companies</p>
            <h2 className="wa-card-value wa-card-value-purple">{selectedCompanyCount}</h2>
          </div>
          <div className="wa-card wa-card-blue">
            <p className="wa-card-label wa-card-label-blue">Unsent Companies</p>
            <h2 className="wa-card-value wa-card-value-blue">{unsentCompanies.length}</h2>
          </div>
          <div className="wa-card wa-card-green">
            <p className="wa-card-label wa-card-label-green">Emails Sent</p>
            <h2 className="wa-card-value wa-card-value-green">{sentCompanies.length}</h2>
          </div>
        </div>
      )}

      {currentPage === 'sent' && (
        <div className="wa-cards-grid" style={{ marginBottom: '1.75rem' }}>
          <div className="wa-card wa-card-blue">
            <p className="wa-card-label wa-card-label-blue">Total Sent</p>
            <h2 className="wa-card-value wa-card-value-blue">{sentItems.length}</h2>
          </div>
          <div className="wa-card">
            <p className="wa-card-label wa-card-label-default">Sent Leads</p>
            <h2 className="wa-card-value wa-card-value-default">{sentLeads.length}</h2>
          </div>
          <div className="wa-card wa-card-green">
            <p className="wa-card-label wa-card-label-green">Sent Companies</p>
            <h2 className="wa-card-value wa-card-value-green">{sentCompanies.length}</h2>
          </div>
          <div className="wa-card wa-card-purple">
            <p className="wa-card-label wa-card-label-purple">Interactions / Clicks</p>
            <h2 className="wa-card-value wa-card-value-purple">{sentItems.filter((i) => (i.clickCount || 0) > 0).length}</h2>
          </div>
        </div>
      )}

      {/* 3. FILTER CARD (Rounded Container) */}
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
          {...(currentPage === 'companies' ? companyTableFilters : currentPage === 'leads' ? leadTableFilters : sentTableFilters)}
          showSearch={false}
          hasFilters={
            currentPage === 'companies'
              ? (companyTableFilters.hasFilters || Boolean(searchTerm))
              : currentPage === 'leads'
              ? (leadTableFilters.hasFilters || Boolean(searchTerm))
              : (sentTableFilters.hasFilters || Boolean(searchTerm) || leadTableFilters.hasFilters || companyTableFilters.hasFilters)
          }
          clearFilters={() => {
            if (currentPage === 'companies') companyTableFilters.clearFilters();
            else if (currentPage === 'leads') leadTableFilters.clearFilters();
            else {
              sentTableFilters.clearFilters();
              leadTableFilters.clearFilters();
              companyTableFilters.clearFilters();
            }
            setSearchTerm('');
          }}
        />
      </div>

      {/* 4. TABLE TOOLBAR (Pill Tabs on Left, Capsule Search on Right) */}
      <div className="wa-table-toolbar">
        <div className="wa-pill-tabs">
          <button
            type="button"
            className={`wa-pill-tab ${currentPage === 'leads' ? 'wa-pill-tab-active' : ''}`}
            onClick={() => navTo('leads')}
          >
            <Users size={14} className="wa-pill-icon" />
            <span>My Leads</span>
            <span className="wa-pill-badge">{unsentLeads.length}</span>
          </button>
          <button
            type="button"
            className={`wa-pill-tab ${currentPage === 'companies' ? 'wa-pill-tab-active' : ''}`}
            onClick={() => navTo('companies')}
          >
            <Building size={14} className="wa-pill-icon" />
            <span>Company</span>
            <span className="wa-pill-badge">{unsentCompanies.length}</span>
          </button>
          <button
            type="button"
            className={`wa-pill-tab ${currentPage === 'sent' ? 'wa-pill-tab-active' : ''}`}
            onClick={() => navTo('sent')}
          >
            <CheckSquare size={14} className="wa-pill-icon" />
            <span>Sent</span>
            <span className="wa-pill-badge">{sentItems.length}</span>
          </button>
        </div>

        <div className="wa-toolbar-actions">
          <div className="wa-capsule-search">
            <Search size={15} color="#94a3b8" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by name, email, company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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

      {/* 5. SELECTION BANNER (Image 2 Matching) */}
      {selectedCount > 0 && (
        <div className="wa-selection-banner" style={{ marginBottom: '1.25rem' }}>
          <div className="wa-selection-info">
            <CheckCheck size={16} />
            <span>{selectedCount} contact{selectedCount === 1 ? '' : 's'} selected</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {currentPage === 'leads' && (
              <button
                type="button"
                onClick={deleteSelectedLeads}
                className="wa-btn-danger"
              >
                Delete selected
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (currentPage === 'companies') setSelectedCompanyIds([]);
                if (currentPage === 'leads') setSelectedEmails([]);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                padding: '0.35rem 0.6rem',
              }}
            >
              Deselect all
            </button>
          </div>
        </div>
      )}

      {/* 6. FLOATING CARD TABLES (Image 2 & 3 Matching) */}
      {currentPage === 'companies' && (
        <div className="wa-table-container-wrapper" style={{ minWidth: 0 }}>
          <div className="wa-cards-table-container">
            <table className="wa-cards-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center', padding: '0.5rem 0.25rem' }}>
                    <input
                      type="checkbox"
                      aria-label="Select all unsent company contacts"
                      disabled={sendingEmails}
                      checked={unsentCompanies.filter((company) => company.email).length > 0
                        && unsentCompanies.filter((company) => company.email).every((company) => selectedCompanyIds.includes(company.id))}
                      onChange={(event) => {
                        const eligibleIds = unsentCompanies
                          .filter((company) => company.email)
                          .map((company) => company.id);
                        setSelectedCompanyIds((current) => event.target.checked
                          ? [...new Set([...current, ...eligibleIds])]
                          : current.filter((id) => !eligibleIds.includes(id)));
                      }}
                    />
                  </th>
                  <th style={{ width: '22%' }}>
                    <span className="wa-th-content">Company Name <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '18%' }}>
                    <span className="wa-th-content">Name <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '10%' }}>
                    <span className="wa-th-content">Type <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '22%' }}>
                    <span className="wa-th-content">Email <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '14%' }}>
                    <span className="wa-th-content">Phone Number <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '10%', textAlign: 'center' }}>
                    <span className="wa-th-content" style={{ justifyContent: 'center' }}>Email Status <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {unsentCompanies.length ? companyPagination.pageItems.map((company, index) => {
                  const isChecked = selectedCompanyIds.includes(company.id);
                  const avatar = getAvatarStyle(index);
                  const initials = getInitials(company.full_name || company.company_name);
                  return (
                    <tr key={company.id} className={isChecked ? 'wa-row-selected' : ''}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${company.company_name} contact`}
                          checked={isChecked}
                          disabled={!company.email || sendingEmails}
                          onChange={(event) => setSelectedCompanyIds((current) => event.target.checked
                            ? [...new Set([...current, company.id])]
                            : current.filter((id) => id !== company.id))}
                        />
                      </td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>
                        {company.company_name || '-'}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>
                          {company.full_name || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="wa-type-badge-green">
                          Company
                        </span>
                      </td>
                      <td style={{ color: '#334155' }}>{company.email || '-'}</td>
                      <td style={{ color: '#475569' }}>{company.phone_number || '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="wa-status-pill wa-status-notsent">
                          <Clock size={12} /> Not Sent
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {company.email && (
                          <button
                            className="wa-btn-card-send"
                            disabled={sendingEmails}
                            onClick={() => {
                              setSelectedCompanyIds([company.id]);
                              setCampaignModalOpen(true);
                            }}
                          >
                            <Send size={12} /> Send
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#94a3b8', background: '#ffffff', borderRadius: '12px' }}>
                      No unsent company contacts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {renderTableFooter(companyPagination, unsentCompanies.length)}
        </div>
      )}

      {/* MY LEADS TAB (SHOWS ONLY UNSENT LEADS) */}
      {currentPage === 'leads' && (
        <div className="wa-table-container-wrapper" style={{ minWidth: 0 }}>
          <div className="wa-cards-table-container">
            <table className="wa-cards-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center', padding: '0.5rem 0.25rem' }}>
                    <input
                      type="checkbox"
                      aria-label="Select all unsent leads on this page"
                      disabled={sendingEmails}
                      checked={selectableLeads.length > 0 && selectableLeads.every((lead) => selectedEmails.includes(lead.email))}
                      onChange={(event) => {
                        const pageEmails = selectableLeads.map((lead) => lead.email);
                        setSelectedEmails((current) => event.target.checked
                          ? [...new Set([...current, ...pageEmails])]
                          : current.filter((email) => !pageEmails.includes(email)));
                      }}
                    />
                  </th>
                  <th style={{ width: '28%' }}>
                    <span className="wa-th-content">Name <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '12%' }}>
                    <span className="wa-th-content">Type <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '32%' }}>
                    <span className="wa-th-content">Email <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '14%', textAlign: 'center' }}>
                    <span className="wa-th-content" style={{ justifyContent: 'center' }}>Sent Status <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {unsentLeads.length > 0 ? (
                  leadPagination.pageItems.map((lead, index) => {
                    const isChecked = selectedEmails.includes(lead.email);
                    const avatar = getAvatarStyle(index);
                    const initials = getInitials(lead.name || lead.full_name);
                    return (
                      <tr key={lead.id || lead.email || index} className={isChecked ? 'wa-row-selected' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${lead.email || lead.name}`}
                            checked={isChecked}
                            disabled={!lead.email || sendingEmails}
                            onChange={(event) => setSelectedEmails((current) => event.target.checked
                              ? [...new Set([...current, lead.email])]
                              : current.filter((email) => email !== lead.email))}
                          />
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>
                            {lead.name || lead.full_name || '-'}
                          </span>
                        </td>
                        <td>
                          <span className={lead.isCompanyContact ? 'wa-type-badge-green' : 'wa-type-badge-blue'}>
                            {lead.isCompanyContact ? 'Company' : 'Lead'}
                          </span>
                        </td>
                        <td style={{ color: '#334155' }}>
                          {lead.email || '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="wa-status-pill wa-status-notsent">
                            <Clock size={12} /> Not Sent
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            {lead.email && (
                              <button
                                onClick={() => sendSingleLead(lead)}
                                disabled={sendingEmails}
                                className="wa-btn-card-send"
                              >
                                <Send size={12} /> Send
                              </button>
                            )}
                            <button
                              onClick={() => deleteLead(lead.email)}
                              className="wa-btn-card-delete"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#94a3b8', background: '#ffffff', borderRadius: '12px' }}>
                      No unsent leads found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {renderTableFooter(leadPagination, unsentLeads.length)}
        </div>
      )}

      {/* SENT TAB (SHOWS BOTH SENT LEADS & SENT COMPANIES) */}
      {currentPage === 'sent' && (
        <div className="wa-table-container-wrapper" style={{ minWidth: 0 }}>
          <div className="wa-cards-table-container">
            <table className="wa-cards-table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>
                    <span className="wa-th-content">Name <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '10%' }}>
                    <span className="wa-th-content">Type <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '18%' }}>
                    <span className="wa-th-content">Company <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '22%' }}>
                    <span className="wa-th-content">Email <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '12%' }}>
                    <span className="wa-th-content">Phone Number <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '10%', textAlign: 'center' }}>
                    <span className="wa-th-content" style={{ justifyContent: 'center' }}>Sent Status <span className="wa-sort-arrows">↑↓</span></span>
                  </th>
                  <th style={{ width: '8%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sentItems.length > 0 ? (
                  sentPagination.pageItems.map((item, index) => {
                    const avatar = getAvatarStyle(index);
                    const initials = getInitials(item.name);
                    return (
                      <tr key={item.id}>
                        <td>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>
                            {item.name}
                          </span>
                        </td>
                        <td>
                          <span className={item.type === 'Company' ? 'wa-type-badge-green' : 'wa-type-badge-blue'}>
                            {item.type}
                          </span>
                        </td>
                        <td style={{ color: '#334155' }}>
                          {item.companyName}
                        </td>
                        <td style={{ color: '#334155' }}>
                          {item.email || '-'}
                        </td>
                        <td style={{ color: '#475569' }}>
                          {item.phone || '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="wa-status-pill wa-status-sent">
                            <CheckCircle2 size={12} /> Sent
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!item.isCompany && (
                            <button
                              onClick={() => deleteLead(item.email)}
                              className="wa-btn-card-delete"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#94a3b8', background: '#ffffff', borderRadius: '12px' }}>
                      No sent emails yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {renderTableFooter(sentPagination, sentItems.length)}
        </div>
      )}

      {/* 7. CAMPAIGN MODAL */}
      {campaignModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem',
        }}>
          <div className="dashboard-section" style={{ width: '100%', maxWidth: 420, margin: 0, backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
            <h2 className="section-title" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>Select Product & Batch</h2>
            <div className="form-group">
              <label className="form-label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Product</label>
              <select className="form-control" value={campaignProduct} onChange={(event) => setCampaignProduct(event.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                {PRODUCTS.map((product) => <option key={product.value} value={product.value}>{product.label}</option>)}
              </select>
            </div>
            {selectedCount > 0 && (
              <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#334155' }}>
                {selectedCount} selected unsent {currentPage === 'companies' ? 'company contact' : 'lead'}{selectedCount === 1 ? '' : 's'} will receive this email.
              </p>
            )}
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Batch Size</label>
              <input
                type="number"
                className="form-control"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                placeholder={selectedCount ? 'Optional limit for selected contacts' : 'Leave empty to send to all unsent leads'}
                min="1"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {selectedCount
                  ? 'Optionally limit how many of your selected contacts to send.'
                  : 'Leave empty to send to all unsent leads, or enter a number for a batch.'}
              </p>
            </div>
            <div className="flex gap-2 mt-4" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => { setCampaignModalOpen(false); setBatchSize(''); }} disabled={sendingEmails}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={sendingEmails || !campaignProduct || invalidBatchSize}
                onClick={async () => {
                  await sendEmails(campaignProduct, batchSize);
                  setBatchSize('');
                }}
              >
                {selectedCount
                  ? `Send to ${batchSize || selectedCount} Selected ${currentPage === 'companies' ? 'Companies' : 'Leads'}`
                  : batchSize ? `Send Batch of ${batchSize}` : 'Send to All Unsent Leads'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. BOTTOM-LEFT CAMPAIGN PROGRESS WIDGET */}
      <CampaignProgressWidget
        type="email"
        statusUrl={apiUrl('/api/send-emails/status')}
        onComplete={refreshData}
      />
    </div>
  );
}
