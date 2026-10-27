import { useState, useRef } from 'react';
import '../styles/whatsapp.css';
import { Download, Send, Loader2, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../components/AppContext';
import { DEFAULT_PRODUCT, PRODUCTS } from '../config/products';
import CampaignProgressWidget from '../components/CampaignProgressWidget';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const EMPTY_LIST = [];
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
  const [searchTerm, setSearchTerm] = useState("");
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const refreshing = leadsQuery.isFetching || companiesQuery.isFetching;

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

      // Lead status label
      getLeadStatusLabel?.(lead.status),

      // Follow-up labels
      lead.followUp1Sent ? "follow up 1 follow-up 1 followup1 follow up 1 sent" : "",
      lead.followUp2Sent ? "follow up 2 follow-up 2 followup2 follow up 2 sent" : "",
      lead.followUp3Sent ? "follow up 3 follow-up 3 followup3 follow up 3 sent" : "",

      // Overall follow-up label
      getFollowUpStatusLabel?.(lead),
    ]
      .filter(Boolean)
      .some((value) =>
        value.toString().toLowerCase().includes(search)
      );
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
      company.email_status
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
      isCompany: false
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
      isCompany: true
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
  // INITIAL FETCH
  // ==========================================
  // ==========================================
  // HANDLE LOGIN
  // ==========================================
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Removed the /api/reset call here so dashboard stats do NOT reset
    // on login or page refresh.

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
        body: formData
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ identifier: email })
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

  const updateLeadStatus = async (lead, status) => {
    if (status !== 'converted_to_lead' || lead.status === status) return;

    try {
      const response = await fetch(apiUrl(`/api/lead/${encodeURIComponent(lead.email)}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
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
          : unsentCompanies.filter(c => c.email).map(c => c.id);
      }
      if (batch !== '') {
        payload.batchSize = Number(batch);
      }
      if (emails.length > 0) payload.selectedEmails = emails;
      if (companyIds.length > 0) payload.selectedCompanyIds = companyIds;

      const res = await fetch(
        apiUrl('/api/send-emails'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

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
        method: 'POST'
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
        sendImmediately: true
      };

      const res = await fetch(apiUrl('/api/upload-lead-json'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        setSingleStatus(`✅ Success! Campaign sent.`);
        setTimeout(() => {
          setAddLeadModalOpen(false);
          setSingleStatus('');
          setSingleLead({ name: '', email: '', phone: '', product_type: 'workflow_ai', user_id: '' });
          refreshData(); // Refresh the table
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


  // ==========================================
  // RENDER MAIN DASHBOARD
  // ==========================================
  return (
    <div className="wa-dashboard">
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Email Outreach</h1>
          <p className="page-subtitle">Manage email campaigns and lead tracking</p>
        </div>
        <div className="flex gap-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          {/* Search Box */}
          <input
            type="text"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid var(--border-color, #ccc)",
              borderRadius: "6px",
              width: "240px",
              maxWidth: "100%",
              backgroundColor: "var(--bg-card, #fff)",
              color: "var(--text-dark, inherit)"
            }}
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
      </div>
      {loadError && (
        <div className="dashboard-section" role="alert" style={{ marginBottom: '1rem', color: '#b91c1c' }}>
          {loadError}
        </div>
      )}
      {(leadsQuery.error || companiesQuery.error) && (
        <div className="dashboard-section" role="alert" style={{ marginBottom: '1rem', color: '#b91c1c' }}>
          {leadsQuery.error?.message || companiesQuery.error?.message}
        </div>
      )}
      {campaignModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem',
        }}>
          <div className="dashboard-section" style={{ width: '100%', maxWidth: 420, margin: 0 }}>
            <h2 className="section-title">Select Product & Batch</h2>
            <div className="form-group">
              <label className="form-label">Product</label>
              <select className="form-control" value={campaignProduct} onChange={(event) => setCampaignProduct(event.target.value)}>
                {PRODUCTS.map((product) => <option key={product.value} value={product.value}>{product.label}</option>)}
              </select>
            </div>
            {selectedCount > 0 && (
              <p style={{ marginTop: '1rem' }}>
                {selectedCount} selected unsent {currentPage === 'companies' ? 'company contact' : 'lead'}{selectedCount === 1 ? '' : 's'} will receive this email.
              </p>
            )}
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Batch Size</label>
              <input
                type="number"
                className="form-control"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                placeholder={selectedCount ? 'Optional limit for selected contacts' : 'Leave empty to send to all unsent leads'}
                min="1"
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {selectedCount
                  ? 'Optionally limit how many of your selected contacts to send.'
                  : 'Leave empty to send to all unsent leads, or enter a number for a batch.'}
              </p>
            </div>
            <div className="flex gap-2 mt-4" style={{ justifyContent: 'flex-end' }}>
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

      <div className="wa-container" style={{ padding: 0, maxWidth: '100%', width: '100%', boxSizing: 'border-box' }}>
        {/* TAB NAVIGATION */}
        <div className="flex gap-4 mb-6" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => navTo('leads')}
            style={{
              paddingBottom: '0.5rem',
              paddingLeft: '0.25rem',
              paddingRight: '0.25rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s',
              borderBottom: currentPage === 'leads' ? '2px solid var(--primary)' : '2px solid transparent',
              color: currentPage === 'leads' ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            My Leads
          </button>
          <button
            onClick={() => navTo('companies')}
            style={{
              paddingBottom: '0.5rem',
              paddingLeft: '0.25rem',
              paddingRight: '0.25rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s',
              borderBottom: currentPage === 'companies' ? '2px solid var(--primary)' : '2px solid transparent',
              color: currentPage === 'companies' ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            Company
          </button>
          <button
            onClick={() => navTo('sent')}
            style={{
              paddingBottom: '0.5rem',
              paddingLeft: '0.25rem',
              paddingRight: '0.25rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s',
              borderBottom: currentPage === 'sent' ? '2px solid var(--primary)' : '2px solid transparent',
              color: currentPage === 'sent' ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            Sent
          </button>
        </div>

        {currentPage === 'companies' && (
          <>
            <div className="wa-cards-grid">
              <div className="wa-card">
                <p className="wa-card-label wa-card-label-default">Total Companies</p>
                <h2 className="wa-card-value wa-card-value-default">
                  {totalCompaniesCount}
                </h2>
              </div>

              <div className="wa-card wa-card-purple">
                <p className="wa-card-label wa-card-label-purple">Selected Companies</p>
                <h2 className="wa-card-value wa-card-value-purple">
                  {selectedCompanyCount}
                </h2>
              </div>

              <div className="wa-card wa-card-blue">
                <p className="wa-card-label wa-card-label-blue">Unsent Companies</p>
                <h2 className="wa-card-value wa-card-value-blue">
                  {unsentCompanies.length}
                </h2>
              </div>

              <div className="wa-card wa-card-green">
                <p className="wa-card-label wa-card-label-green">Emails Sent</p>
                <h2 className="wa-card-value wa-card-value-green">
                  {sentCompanies.length}
                </h2>
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
            <div className="wa-table-container">
            <div className="wa-table-scroll">
              <table className="wa-table">
                <thead>
                  <tr>
                    <th className="wa-text-center">
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
                    <th>Company Name</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Email</th>
                    <th>Phone Number</th>
                    <th>Email Status</th>
                    <th className="wa-text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unsentCompanies.length ? companyPagination.pageItems.map((company) => (
                    <tr key={company.id}>
                      <td className="wa-text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select ${company.company_name} contact`}
                          checked={selectedCompanyIds.includes(company.id)}
                          disabled={!company.email || sendingEmails}
                          onChange={(event) => setSelectedCompanyIds((current) => event.target.checked
                            ? [...new Set([...current, company.id])]
                            : current.filter((id) => id !== company.id))}
                        />
                      </td>
                      <td>{company.company_name || '-'}</td>
                      <td>{company.full_name || '-'}</td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          backgroundColor: '#d1fae5',
                          color: '#065f46',
                        }}>
                          Company
                        </span>
                      </td>
                      <td>{company.email || '-'}</td>
                      <td>{company.phone_number || '-'}</td>
                      <td>
                        <span className="wa-badge wa-badge-gray">
                          Not Sent
                        </span>
                      </td>
                      <td className="wa-text-right">
                        {company.email && (
                          <button
                            className="btn btn-primary"
                            disabled={sendingEmails}
                            onClick={() => {
                              setSelectedCompanyIds([company.id]);
                              setCampaignModalOpen(true);
                            }}
                          >
                            Send
                          </button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="8" className="wa-text-center wa-text-secondary" style={{ padding: '3rem 1.5rem' }}>
                        No unsent company contacts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination {...companyPagination} />
          </div>
        </>
      )}

      {/* MY LEADS TAB (SHOWS ONLY UNSENT LEADS) */}
      {currentPage === 'leads' && (
        <>
          <div className="wa-cards-grid">
            <div className="wa-card">
              <p className="wa-card-label wa-card-label-default">Total Leads</p>
              <h2 className="wa-card-value wa-card-value-default">
                {totalLeadsCount}
              </h2>
            </div>

            <div className="wa-card wa-card-purple">
              <p className="wa-card-label wa-card-label-purple">Selected Leads</p>
              <h2 className="wa-card-value wa-card-value-purple">
                {selectedLeadCount}
              </h2>
            </div>

            <div className="wa-card wa-card-blue">
              <p className="wa-card-label wa-card-label-blue">Unsent Leads</p>
              <h2 className="wa-card-value wa-card-value-blue">
                {unsentLeads.length}
              </h2>
            </div>

            <div className="wa-card wa-card-green">
              <p className="wa-card-label wa-card-label-green">Emails Sent</p>
              <h2 className="wa-card-value wa-card-value-green">
                {sentLeads.length}
              </h2>
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
          <div className="wa-table-container">
            <div className="wa-table-scroll">
              <table className="wa-table">
                <thead>
                  <tr>
                    <th className="wa-text-center">
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
                    <th>Name</th>
                    <th>Type</th>
                    <th>Email</th>
                    <th className="wa-text-center">Sent Status</th>
                    <th className="wa-text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>

                  {unsentLeads.length > 0 ? (
                    leadPagination.pageItems.map((lead, index) => {
                      return (
                        <tr
                          key={index}
                          className="wa-table-row-default"
                        >
                          <td className="wa-text-primary">
                            <input
                              type="checkbox"
                              aria-label={`Select ${lead.email || lead.name}`}
                              checked={selectedEmails.includes(lead.email)}
                              disabled={!lead.email || sendingEmails}
                              onChange={(event) => setSelectedEmails((current) => event.target.checked
                                ? [...new Set([...current, lead.email])]
                                : current.filter((email) => email !== lead.email))}
                            />
                          </td>
                          <td className="wa-text-primary" style={{ fontWeight: 600 }}>
                            {lead.name || '-'}
                          </td>
                          <td className="wa-text-secondary">
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor: lead.isCompanyContact ? '#d1fae5' : '#dbeafe',
                              color: lead.isCompanyContact ? '#065f46' : '#1e40af',
                            }}>
                              {lead.isCompanyContact ? 'Company' : 'Lead'}
                            </span>
                          </td>
                          <td className="wa-text-secondary">
                            {lead.email || '-'}
                          </td>
                          <td className="wa-text-center">
                            <span className="wa-badge wa-badge-gray">
                              Not Sent
                            </span>
                          </td>
                          <td className="wa-text-right">
                            {lead.email && (
                              <button
                                onClick={() => sendSingleLead(lead)}
                                disabled={sendingEmails}
                                className="btn btn-primary"
                                style={{ marginRight: '0.5rem' }}
                              >
                                Send
                              </button>
                            )}
                            <button
                              onClick={() => deleteLead(lead.email)}
                              className="wa-btn-danger"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="wa-text-center wa-text-secondary" style={{ padding: '3rem 1.5rem' }}>
                        No unsent leads found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination {...leadPagination} />
          </div>
        </>
      )}

      {/* SENT TAB (SHOWS BOTH SENT LEADS & SENT COMPANIES) */}
      {currentPage === 'sent' && (
        <>
          <div className="wa-cards-grid">
            <div className="wa-card wa-card-blue">
              <p className="wa-card-label wa-card-label-blue">Total Sent</p>
              <h2 className="wa-card-value wa-card-value-blue">
                {sentItems.length}
              </h2>
            </div>

            <div className="wa-card">
              <p className="wa-card-label wa-card-label-default">Sent Leads</p>
              <h2 className="wa-card-value wa-card-value-default">
                {sentLeads.length}
              </h2>
            </div>

            <div className="wa-card wa-card-green">
              <p className="wa-card-label wa-card-label-green">Sent Companies</p>
              <h2 className="wa-card-value wa-card-value-green">
                {sentCompanies.length}
              </h2>
            </div>

            <div className="wa-card wa-card-purple">
              <p className="wa-card-label wa-card-label-purple">Interactions / Clicks</p>
              <h2 className="wa-card-value wa-card-value-purple">
                {sentItems.filter((i) => (i.clickCount || 0) > 0).length}
              </h2>
            </div>
          </div>

          <TableFilters
            {...sentTableFilters}
            showSearch={false}
            hasFilters={sentTableFilters.hasFilters || Boolean(searchTerm) || leadTableFilters.hasFilters || companyTableFilters.hasFilters}
            clearFilters={() => {
              sentTableFilters.clearFilters();
              leadTableFilters.clearFilters();
              companyTableFilters.clearFilters();
              setSearchTerm('');
            }}
          />
          <div className="wa-table-container">
            <div className="wa-table-scroll">
              <table className="wa-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Company</th>
                    <th>Email</th>
                    <th>Phone Number</th>
                    <th className="wa-text-center">Sent Status</th>
                    <th className="wa-text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sentItems.length > 0 ? (
                    sentPagination.pageItems.map((item) => {
                      const isClicked = item.clickCount > 0;

                      return (
                        <tr
                          key={item.id}
                          className={isClicked ? 'wa-table-row-success' : 'wa-table-row-default'}
                        >
                          <td className="wa-text-primary" style={{ fontWeight: 600 }}>
                            {item.name}
                          </td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor: item.type === 'Company' ? '#d1fae5' : '#dbeafe',
                              color: item.type === 'Company' ? '#065f46' : '#1e40af',
                            }}>
                              {item.type}
                            </span>
                          </td>
                          <td className="wa-text-secondary">
                            {item.companyName}
                          </td>
                          <td className="wa-text-secondary">
                            {item.email || '-'}
                          </td>
                          <td className="wa-text-secondary">
                            {item.phone || '-'}
                          </td>
                          <td className="wa-text-center">
                            <span className="wa-badge wa-badge-blue">
                              Sent
                            </span>
                          </td>
                          <td className="wa-text-right">
                            {!item.isCompany && (
                              <button
                                onClick={() => deleteLead(item.email)}
                                className="wa-btn-danger"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" className="wa-text-center wa-text-secondary" style={{ padding: '3rem 1.5rem' }}>
                        No sent emails yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination {...sentPagination} />
          </div>
        </>
      )}
      </div>

      {/* BOTTOM-LEFT CAMPAIGN PROGRESS WIDGET */}
      <CampaignProgressWidget
        type="email"
        statusUrl={apiUrl('/api/send-emails/status')}
        onComplete={refreshData}
      />
    </div>
  );
}
