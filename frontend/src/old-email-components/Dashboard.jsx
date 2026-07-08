import React, { useState, useEffect, useRef } from 'react';
import '../styles/whatsapp.css';
import { Download, Send, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '../components/AppContext';
import { DEFAULT_PRODUCT, PRODUCTS } from '../config/products';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const LEAD_STATUS_LABELS = {
  new: 'Not Sent',
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

export default function Dashboard() {
  const { searchQuery } = useApp();
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  const [currentPage, setCurrentPage] = useState('home');
  const [dashboardData, setDashboardData] = useState({
    total: 0,
    sent: 0,
    clickedUsers: 0,
    totalClicks: 0
  });
  const [leads, setLeads] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [checkingFollowUps, setCheckingFollowUps] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [addLeadModalOpen, setAddLeadModalOpen] = useState(false);
  const [singleLead, setSingleLead] = useState({ name: '', email: '', phone: '', product_type: 'workflow_ai' });
  const [singleStatus, setSingleStatus] = useState('');
  const [singleLoading, setSingleLoading] = useState(false);
  const [campaignProduct, setCampaignProduct] = useState(DEFAULT_PRODUCT);
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // ==========================================
  // FETCH DASHBOARD DATA
  // ==========================================
  const refreshData = async () => {

    try {

      console.log("REFRESH STARTED");

      const leadsRes = await fetch(apiUrl('/api/ingestion/email'));
      const leadsData = await leadsRes.json();
      
      const leadsArray = leadsData || [];
      setLeads(leadsArray);

      setDashboardData({
        total: leadsArray.length,
        sent: leadsArray.filter(l => ['sent', 'clicked', 'converted_to_lead', 'follow_up_sent'].includes(l.status)).length,
        clickedUsers: leadsArray.filter(l => l.status === 'clicked').length,
        totalClicks: leadsArray.reduce((sum, l) => sum + (l.clickCount || 0), 0)
      });

    } catch (error) {

      console.error(
        "REFRESH ERROR:",
        error
      );

    } finally {

      setDataLoaded(true);

    }
  };
  // ==========================================
  // INITIAL FETCH
  // ==========================================
  useEffect(() => {
    refreshData();
  }, [isLoggedIn]);

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
  const sendEmails = async (product) => {

    setSendingEmails(true);

    try {

      console.log("SEND API CALLED");

      const res = await fetch(
        apiUrl('/api/send-emails'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product })
        }
      );

      console.log(res);

      const data = await res.json();

      console.log(data);

      if (res.ok) {

        alert(`✅ ${data.message}`);

      } else {

        alert(`Error sending emails: ${data.error}`);

      }

    } catch (error) {

      console.error(error);

      alert('Failed to connect to the server to send emails.');

    } finally {

      setSendingEmails(false);

      refreshData();

    }

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
          setSingleLead({ name: '', email: '', phone: '', product_type: 'workflow_ai' });
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Email Outreach</h1>
          <p className="page-subtitle">Manage email campaigns and lead tracking</p>
        </div>
        <div className="flex gap-4">
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => setAddLeadModalOpen(true)}
            disabled={uploading}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#10b981', color: 'white', borderColor: '#10b981' }}
          >
            + Add Lead
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Download size={16} />
            {uploading ? 'Uploading...' : 'Upload Leads'}
          </button>
          <button
            onClick={() => setCampaignModalOpen(true)}
            disabled={sendingEmails}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {sendingEmails ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Send size={16} />
            )}
            {sendingEmails ? 'Starting Campaign...' : 'Send Emails'}
          </button>
          <button
            onClick={checkFollowUps}
            disabled={checkingFollowUps}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {checkingFollowUps ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            {checkingFollowUps ? 'Checking...' : 'Check Follow-ups'}
          </button>
        </div>
      </div>

      {campaignModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem',
        }}>
          <div className="dashboard-section" style={{ width: '100%', maxWidth: 420, margin: 0 }}>
            <h2 className="section-title">Select Product</h2>
            <div className="form-group">
              <label className="form-label">Product</label>
              <select className="form-control" value={campaignProduct} onChange={(event) => setCampaignProduct(event.target.value)}>
                {PRODUCTS.map((product) => <option key={product.value} value={product.value}>{product.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-4" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setCampaignModalOpen(false)} disabled={sendingEmails}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={sendingEmails || !campaignProduct}
                onClick={async () => {
                  setCampaignModalOpen(false);
                  await sendEmails(campaignProduct);
                }}
              >
                Start Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {addLeadModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem',
        }}>
          <div className="dashboard-section" style={{ width: '100%', maxWidth: 420, margin: 0 }}>
            <h2 className="section-title">Add Lead & Send Campaign</h2>
            <form onSubmit={handleSingleSubmit}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  value={singleLead.name}
                  onChange={e => setSingleLead({...singleLead, name: e.target.value})}
                  className="form-control"
                  placeholder="John Doe"
                />
              </div>
              <div className="form-group mt-3">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={singleLead.email}
                  onChange={e => setSingleLead({...singleLead, email: e.target.value})}
                  className="form-control"
                  placeholder="john@example.com"
                />
              </div>
              <div className="form-group mt-3">
                <label className="form-label">WhatsApp Number</label>
                <input
                  type="text"
                  value={singleLead.phone}
                  onChange={e => setSingleLead({...singleLead, phone: e.target.value})}
                  className="form-control"
                  placeholder="6382108701"
                />
              </div>
              <div className="form-group mt-3">
                <label className="form-label">Product</label>
                <select className="form-control" value={singleLead.product_type} onChange={e => setSingleLead({...singleLead, product_type: e.target.value})}>
                  {PRODUCTS.map((product) => <option key={product.value} value={product.value}>{product.label}</option>)}
                </select>
              </div>

              {singleStatus && (
                <div className="mt-3 p-2 text-center" style={{ color: singleStatus.includes('❌') ? 'red' : 'green', fontSize: '14px', fontWeight: 'bold' }}>
                  {singleStatus}
                </div>
              )}

              <div className="flex gap-2 mt-4" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAddLeadModalOpen(false)} disabled={singleLoading}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                  disabled={singleLoading || (!singleLead.email && !singleLead.phone)}
                >
                  {singleLoading ? 'Sending...' : 'Send Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      <div className="wa-container" style={{ padding: 0, maxWidth: 'none' }}>
        {/* TAB NAVIGATION */}
        <div className="flex gap-4 mb-6" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => navTo('home')}
            style={{
              paddingBottom: '0.5rem',
              paddingLeft: '0.25rem',
              paddingRight: '0.25rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s',
              borderBottom: currentPage === 'home' ? '2px solid var(--primary)' : '2px solid transparent',
              color: currentPage === 'home' ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            Overview
          </button>
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
        </div>

        {/* OVERVIEW TAB */}
        {currentPage === 'home' && (
          <div className="wa-cards-grid">
            {/* Total Leads Card */}
            <div className="wa-card">
              <p className="wa-card-label wa-card-label-default">Total Leads</p>
              <h2 className="wa-card-value wa-card-value-default">
                {!dataLoaded ? '...' : dashboardData.total}
              </h2>
            </div>

            {/* Emails Sent Card */}
            <div className="wa-card wa-card-blue">
              <p className="wa-card-label wa-card-label-blue">Emails Sent</p>
              <h2 className="wa-card-value wa-card-value-blue">
                {!dataLoaded ? '...' : dashboardData.sent}
              </h2>
            </div>

            {/* Clicked Users Card */}
            <div className="wa-card wa-card-green">
              <p className="wa-card-label wa-card-label-green">Clicked Users</p>
              <h2 className="wa-card-value wa-card-value-green">
                {!dataLoaded ? '...' : dashboardData.clickedUsers}
              </h2>
            </div>

            {/* Total Clicks Card */}
            <div className="wa-card wa-card-purple">
              <p className="wa-card-label wa-card-label-purple">Total Clicks</p>
              <h2 className="wa-card-value wa-card-value-purple">
                {!dataLoaded ? '...' : dashboardData.totalClicks}
              </h2>
            </div>
          </div>
        )}

        {/* MY LEADS TAB */}
        {currentPage === 'leads' && (
          <div className="wa-table-container">
            <div className="wa-table-scroll">
              <table className="wa-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th className="wa-text-center">Sent Status</th>
                    <th className="wa-text-center">Lead Status</th>
                    <th className="wa-text-center">Follow-up Status</th>
                    <th className="wa-text-center">Book Demo Clicks</th>
                    <th className="wa-text-center">Video Clicks</th>
                    <th className="wa-text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads && leads.length > 0 ? (
                    leads
                      .filter(lead => {
                        if (!searchQuery) return true;
                        const name = lead.name || '';
                        const email = lead.email || '';
                        const query = searchQuery.toLowerCase();
                        return name.toLowerCase().includes(query) || email.toLowerCase().includes(query);
                      })
                      .map((lead, index) => {
                      const isSent = ['sent', 'clicked', 'converted_to_lead', 'follow_up_sent'].includes(lead.status);
                      const isClicked = lead.status === 'clicked';
                      const bookDemoClickCount = lead.bookDemoClickCount || 0;
                      const videoClickCount = lead.videoClickCount || 0;
                      const canConvert = lead.status === 'sent' || lead.status === 'clicked';
                      const followUpStatus = getFollowUpStatusLabel(lead);
                      const followUpComplete = followUpStatus === 'Follow-up 3 Sent';
                      const leadStatusValue = followUpComplete ? 'follow_up_sent' : (lead.status || 'new');

                      return (
                        <tr
                          key={index}
                          className={isClicked ? 'wa-table-row-success' : 'wa-table-row-default'}
                        >
                          <td className="wa-text-primary">
                            {lead.name || '-'}
                          </td>
                          <td className="wa-text-secondary">
                            {lead.email || '-'}
                          </td>
                          <td className="wa-text-center">
                            {isSent ? (
                              <span className="wa-badge wa-badge-blue">
                                Sent
                              </span>
                            ) : (
                              <span className="wa-badge wa-badge-gray">
                                Not Sent
                              </span>
                            )}
                          </td>
                          <td className="wa-text-center">
                            <select
                              className="form-control"
                              value={leadStatusValue}
                              onChange={(event) => updateLeadStatus(lead, event.target.value)}
                              disabled={!canConvert || followUpComplete}
                              style={{ minWidth: 170 }}
                            >
                              <option value={leadStatusValue}>{getLeadStatusLabel(leadStatusValue)}</option>
                              {canConvert && (
                                <option value="converted_to_lead">Converted to Lead</option>
                              )}
                            </select>
                          </td>
                          <td className="wa-text-center">
                            <span className={`wa-badge ${followUpComplete ? 'wa-badge-blue' : 'wa-badge-gray'}`}>
                              {followUpStatus}
                            </span>
                          </td>
                          <td className="wa-text-center wa-text-primary">
                            {bookDemoClickCount}
                          </td>
                          <td className="wa-text-center wa-text-primary">
                            {videoClickCount}
                          </td>
                          <td className="wa-text-right">
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
                      <td colSpan="8" className="wa-text-center wa-text-secondary" style={{ padding: '3rem 1.5rem' }}>
                        No leads found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
