import React, { useState, useEffect } from 'react';
import { useApp } from '../components/AppContext';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;

const WhatsApp = () => {
  const { searchQuery } = useApp();
  const [leads, setLeads] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dashboardData, setDashboardData] = useState({
    totalLeads: 0,
    whatsappSent: 0,
    clickedUsers: 0,
    totalClicks: 0,
    bookDemoClicks: 0,
    videoClicks: 0
  });

  const fetchDashboardData = async () => {
    try {
      const url = apiUrl('/api/ingestion/whatsapp');
      console.log('Fetching:', url); // temporary — confirm the actual URL being hit
      const response = await fetch(url);
      if (response.ok) {
        const users = await response.json();
        setDashboardData({
          totalLeads: users.length,
          whatsappSent: users.filter(u => u.status === 'sent' || u.status === 'clicked' || u.whatsappStatus === 'sent' || u.whatsappStatus === 'clicked').length,
          clickedUsers: users.filter(u => u.status === 'clicked' || u.whatsappStatus === 'clicked').length,
          totalClicks: users.reduce((sum, u) => sum + (u.clickCount || u.whatsappClickCount || 0), 0),
          bookDemoClicks: users.reduce((sum, u) => sum + (u.bookDemoClickCount || u.whatsappBookDemoClickCount || 0), 0),
          videoClicks: users.reduce((sum, u) => sum + (u.videoClickCount || u.whatsappVideoClickCount || 0), 0)
        });
        setLeads(users);
      } else {
        console.error('Dashboard fetch failed with status:', response.status, await response.text());
      }
    } catch (error) {
      console.error("Failed to fetch WhatsApp dashboard data:", error);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const deleteLead = async (lead) => {
    const identifier = lead.email || lead.phoneNumber || lead.phone || lead.whatsappNumber;
    if (!identifier) {
      alert("Cannot delete this lead (missing email or phone).");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${lead.name || identifier}?`)) return;

    try {
      const response = await fetch(apiUrl(`/api/delete`), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ identifier })
      });

      if (response.ok) {
        fetchDashboardData();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete lead.');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('An error occurred while deleting the lead.');
    }
  };
  const filteredLeads = leads.filter((lead) => {
  const search = searchTerm.trim().toLowerCase();

  if (!search) return true;

  const isSent =
    lead.whatsappStatus === "sent" ||
    lead.whatsappStatus === "clicked";

  const isClicked =
    lead.whatsappStatus === "clicked";

  return [
    lead.name,
    lead.phone,
    lead.phoneNumber,
    lead.whatsappStatus,

    isSent ? "sent" : "not sent",
    isClicked ? "clicked" : "not clicked",

    lead.bookDemoClickCount,
    lead.videoClickCount,
  ]
    .filter(Boolean)
    .some((value) =>
      value.toString().toLowerCase().includes(search)
    );
});

  return (
    <div className="wa-dashboard">
      {/* TOP HEADER */}
      <header className="wa-header">
        <h1 className="wa-header-title">
          WhatsApp Overview
        </h1>
      </header>
      <div style={{
        display: "flex",
        justifyContent: "flex-end",
        marginBottom: "20px"
      }}>
        <input
          type="text"
          placeholder="Search WhatsApp leads..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "320px",
            padding: "10px 14px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            fontSize: "14px",
            margin: "25px 0 0px 0"
          }}
        />
      </div>
      <div className="wa-container">
        {/* OVERVIEW CARDS */}
        <div className="wa-cards-grid">
          {/* Total Leads Card */}
          <div className="wa-card">
            <p className="wa-card-label wa-card-label-default">Total Leads</p>
            <h2 className="wa-card-value wa-card-value-default">{dashboardData.totalLeads}</h2>
          </div>

          {/* WhatsApp Sent Card */}
          <div className="wa-card wa-card-blue">
            <p className="wa-card-label wa-card-label-blue">WhatsApp Sent</p>
            <h2 className="wa-card-value wa-card-value-blue">{dashboardData.whatsappSent}</h2>
          </div>

          {/* Clicked Users Card */}
          <div className="wa-card wa-card-green">
            <p className="wa-card-label wa-card-label-green">Clicked Users</p>
            <h2 className="wa-card-value wa-card-value-green">{dashboardData.clickedUsers}</h2>
          </div>

          {/* Total Clicks Card */}
          <div className="wa-card wa-card-purple">
            <p className="wa-card-label wa-card-label-purple">Total Clicks</p>
            <h2 className="wa-card-value wa-card-value-purple">{dashboardData.totalClicks}</h2>
          </div>
          <div className="wa-card wa-card-green">
            <p className="wa-card-label wa-card-label-green">Book Demo Clicks</p>
            <h2 className="wa-card-value wa-card-value-green">{dashboardData.bookDemoClicks}</h2>
          </div>
          <div className="wa-card wa-card-blue">
            <p className="wa-card-label wa-card-label-blue">Video Clicks</p>
            <h2 className="wa-card-value wa-card-value-blue">{dashboardData.videoClicks}</h2>
          </div>
        </div>

        {/* LEADS TABLE */}
        <div className="wa-table-container">
          <div className="wa-table-scroll">
            <table className="wa-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone Number</th>
                  <th className="wa-text-center">WhatsApp Status</th>
                  <th className="wa-text-center">Click Status</th>
                  <th className="wa-text-center">Book Demo Clicks</th>
                  <th className="wa-text-center">Video Clicks</th>
                  <th className="wa-text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length > 0 ? (
                  filteredLeads.map((lead) => {
                    const isSent = lead.whatsappStatus === 'sent' || lead.whatsappStatus === 'clicked';
                    const isClicked = lead.whatsappStatus === 'clicked';

                    return (
                      <tr
                        key={lead.id}
                        className={isClicked ? 'wa-table-row-success' : 'wa-table-row-default'}
                      >
                        <td className="wa-text-primary">
                          {lead.name}
                        </td>
                        <td className="wa-text-secondary">
                          {lead.phoneNumber || lead.phone || "-"}
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
                          {lead.whatsappBookDemoClickCount || 0}
                        </td>
                        <td className="wa-text-center wa-text-primary">
                          {lead.whatsappVideoClickCount || 0}
                        </td>
                        <td className="wa-text-right">
                          <button
                            onClick={() => deleteLead(lead)}
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
                    <td colSpan="7" className="wa-text-center wa-text-secondary" style={{ padding: '3rem 1.5rem' }}>
                      No leads found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsApp;
