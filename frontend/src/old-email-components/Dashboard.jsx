import React, { useState, useEffect, useRef } from 'react';
import '../styles/whatsapp.css';
import { Download, Send, Loader2 } from 'lucide-react';
import { useApp } from '../components/AppContext';
import { DEFAULT_PRODUCT, PRODUCTS } from '../config/products';

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
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
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

      // DASHBOARD DATA
      const dashRes =
        await fetch('http://localhost:5002/api/dashboard');

      console.log("Dashboard Status:", dashRes.status);

      const dashData = await dashRes.json();
      console.log("Dashboard Data:", dashData);
      console.log("BEFORE LEADS FETCH");

      setDashboardData({
        total: dashData.total || 0,
        sent: dashData.sent || 0,
        clickedUsers: dashData.clickedUsers || 0,
        totalClicks: dashData.totalClicks || 0
      });

      // LEADS DATA
      const leadsRes =
        await fetch('http://localhost:5002/api/ingestion/all');

      console.log("Leads Status:", leadsRes.status);

      const leadsData =
        await leadsRes.json();

      console.log("Leads Data:", leadsData);

      console.log(
        "Is Array:",
        Array.isArray(leadsData)
      );

      console.log(
        "Array Length:",
        leadsData.length
      );

      setLeads(leadsData || []);

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
  // INITIAL FETCH & AUTO-REFRESH EVERY 5 SECONDS
  // ==========================================
  useEffect(() => {
    // Fetch automatically on component load to ensure stats don't reset to 0
    refreshData();

    if (!isLoggedIn) return;

    // Set up interval for auto-refresh
    const interval = setInterval(() => {
      refreshData();
    }, 5000);

    // Cleanup interval on unmount or when logged out
    return () => clearInterval(interval);
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
      const response = await fetch('http://localhost:5002/api/upload-leads', {
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
      const response = await fetch(`/api/lead/${encodeURIComponent(email)}`, {
        method: 'DELETE'
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

  // ==========================================
  // SEND EMAILS
  // ==========================================
  const sendEmails = async (product) => {

    setSendingEmails(true);

    try {

      console.log("SEND API CALLED");

      const res = await fetch(
        'http://localhost:5002/api/send-emails',
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

  // ==========================================
  // NAVIGATE TO PAGE
  // ==========================================
  const navTo = (page) => {
    setCurrentPage(page);
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
            accept=".csv"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
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
                    <th className="wa-text-center">Click Status</th>
                    <th className="wa-text-center">Click Count</th>
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
                      const isSent = lead.Status === 'sent' || lead.Status === 'clicked';
                      const isClicked = lead.Status === 'clicked';
                      const clickCount = lead.clickCount || 0;

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
                            {isClicked ? (
                              <span className="wa-badge wa-badge-green">
                                Clicked
                              </span>
                            ) : (
                              <span className="wa-badge wa-badge-red">
                                Not Clicked
                              </span>
                            )}
                          </td>
                          <td className="wa-text-center wa-text-primary">
                            {clickCount}
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
                      <td colSpan="6" className="wa-text-center wa-text-secondary" style={{ padding: '3rem 1.5rem' }}>
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
