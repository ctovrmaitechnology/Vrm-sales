import React, { useState, useEffect } from 'react';
import '../styles/WhatsApp.css';
import { useApp } from '../components/AppContext';

const WhatsApp = () => {
  const { searchQuery } = useApp();
  const [leads, setLeads] = useState([]);
  const [dashboardData, setDashboardData] = useState({
    totalLeads: 0,
    whatsappSent: 0,
    clickedUsers: 0,
    totalClicks: 0
  });

  const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || 'http://localhost:5002';

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/whatsapp/dashboard`);
        if (response.ok) {
          const data = await response.json();
          setDashboardData({
            totalLeads: data.totalLeads || 0,
            whatsappSent: data.whatsappSent || 0,
            clickedUsers: data.clickedUsers || 0,
            totalClicks: data.totalClicks || 0
          });
          setLeads(data.users || []);
        }
      } catch (error) {
        console.error("Failed to fetch WhatsApp dashboard data:", error);
      }
    };
    fetchDashboardData();
  }, []);

  return (
    <div className="wa-dashboard">
      {/* TOP HEADER */}
      <header className="wa-header">
        <h1 className="wa-header-title">
          WhatsApp Overview
        </h1>
      </header>

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
                  <th className="wa-text-center">Click Count</th>
                  <th className="wa-text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.length > 0 ? (
                  leads
                    .filter(lead => {
                      if (!searchQuery) return true;
                      const name = lead.name || '';
                      const phone = lead.phoneNumber || lead.phone || '';
                      const query = searchQuery.toLowerCase();
                      return name.toLowerCase().includes(query) || phone.toLowerCase().includes(query);
                    })
                    .map((lead) => {
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
                          {lead.whatsappClickCount || 0}
                        </td>
                        <td className="wa-text-right">
                          <button
                            onClick={() => alert(`Delete ${lead.name}`)}
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
      </div>
    </div>
  );
};

export default WhatsApp;

