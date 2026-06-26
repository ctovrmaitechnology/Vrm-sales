import React, { useEffect, useRef, useState } from 'react';
import Button from '../components/Button';
import StatCard from '../components/StatCard';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  Play,
  Square,
  Upload,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { DEFAULT_PRODUCT, PRODUCTS } from '../config/products';

const LINKEDIN_BASE_URL = import.meta.env.VITE_LINKEDIN_BASE_URL || '/linkedin-api';

const initialStatus = {
  total_uploaded: 0,
  pending: 0,
  connect_sent: 0,
  pending_acceptance: 0,
  already_connected: 0,
  accepted: 0,
  linkedin_message_sent: 0,
  email_sent: 0,
  whatsapp_sent: 0,
  failed: 0,
  activeBotRun: null,
};

const LinkedIn = () => {
  const [status, setStatus] = useState(initialStatus);
  const [logs, setLogs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [checking, setChecking] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(DEFAULT_PRODUCT);
  const logsEndRef = useRef(null);

  const botRunning = Boolean(status.activeBotRun);

  const loadLinkedInState = async () => {
    const [statusRes, logsRes, leadsRes] = await Promise.all([
      fetch(`${LINKEDIN_BASE_URL}/api/linkedin/status`).catch(() => null),
      fetch(`${LINKEDIN_BASE_URL}/api/linkedin/logs`).catch(() => null),
      fetch(`${LINKEDIN_BASE_URL}/api/linkedin/leads`).catch(() => null),
    ]);
    if (statusRes?.ok) setStatus(await statusRes.json());
    if (logsRes?.ok) setLogs(await logsRes.json());
    if (leadsRes?.ok) setLeads(await leadsRes.json());
  };

  useEffect(() => {
    loadLinkedInState();
    const interval = setInterval(loadLinkedInState, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const uploadExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${LINKEDIN_BASE_URL}/api/linkedin/upload-excel`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }
      await loadLinkedInState();
    } catch (error) {
      setLogs(prev => [...prev, { at: new Date().toISOString(), message: `Upload failed: ${error.message}`, type: 'error' }]);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const startBot = async (product) => {
    setStarting(true);
    try {
      const res = await fetch(`${LINKEDIN_BASE_URL}/api/linkedin/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.message || 'Upload leads first.');
      }
      await loadLinkedInState();
    } catch (error) {
      alert(error.message || 'Failed to start bot');
    } finally {
      setStarting(false);
    }
  };

  const stopBot = async () => {
    setStopping(true);
    try {
      await fetch(`${LINKEDIN_BASE_URL}/api/linkedin/stop`, { method: 'POST' });
      await loadLinkedInState();
    } finally {
      setStopping(false);
    }
  };

  const checkAccepted = async () => {
    setChecking(true);
    try {
      await fetch(`${LINKEDIN_BASE_URL}/api/linkedin/check-accepted`, { method: 'POST' });
      await loadLinkedInState();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">LinkedIn Automation</h1>
          <p className="page-subtitle">Upload Excel leads and run URL-only outreach</p>
        </div>
        <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
          <label className="btn btn-secondary" style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
            {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
            <span>{uploading ? 'Uploading...' : 'Upload Excel'}</span>
            <input type="file" accept=".xlsx,.xls" onChange={uploadExcel} disabled={uploading} style={{ display: 'none' }} />
          </label>
          <Button
            variant="primary"
            icon={starting ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            onClick={() => setProductModalOpen(true)}
            disabled={starting || botRunning}
          >
            {starting ? 'Starting...' : 'Start Bot'}
          </Button>
          <Button
            variant="secondary"
            icon={checking ? <Loader2 size={16} className="spin" /> : <UserCheck size={16} />}
            onClick={checkAccepted}
            disabled={checking || botRunning}
          >
            {checking ? 'Checking...' : 'Check Accepted Now'}
          </Button>
          <Button
            variant="danger"
            icon={stopping ? <Loader2 size={16} className="spin" /> : <Square size={16} />}
            onClick={stopBot}
            disabled={stopping || !botRunning}
          >
            {stopping ? 'Stopping...' : 'Stop Bot'}
          </Button>
        </div>
      </div>

      {productModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem',
        }}>
          <div className="dashboard-section" style={{ width: '100%', maxWidth: 420, margin: 0 }}>
            <h2 className="section-title">Select Product</h2>
            <div className="form-group">
              <label className="form-label">Product</label>
              <select className="form-control" value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)}>
                {PRODUCTS.map((product) => <option key={product.value} value={product.value}>{product.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-4" style={{ justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setProductModalOpen(false)} disabled={starting}>Cancel</Button>
              <Button
                variant="primary"
                disabled={starting || !selectedProduct}
                onClick={async () => {
                  setProductModalOpen(false);
                  await startBot(selectedProduct);
                }}
              >
                Start Bot
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <StatCard title="Total Uploaded" value={String(status.total_uploaded || leads.length)} icon={<UserPlus size={20} />} />
        <StatCard title="Pending Leads" value={String(status.pending || 0)} icon={<Clock size={20} />} />
        <StatCard title="Connect Sent" value={String(status.connect_sent || 0)} icon={<UserCheck size={20} />} />
        <StatCard title="Pending Acceptance" value={String(status.pending_acceptance || 0)} icon={<Clock size={20} />} />
        <StatCard title="Already Connected" value={String(status.already_connected || 0)} icon={<CheckCircle size={20} />} />
        <StatCard title="Accepted" value={String(status.accepted || 0)} icon={<CheckCircle size={20} />} />
        <StatCard title="LinkedIn Message Sent" value={String(status.linkedin_message_sent || 0)} icon={<MessageSquare size={20} />} />
        <StatCard title="Email Sent" value={String(status.email_sent || 0)} icon={<Mail size={20} />} />
        <StatCard title="WhatsApp Sent" value={String(status.whatsapp_sent || 0)} icon={<MessageSquare size={20} />} />
        <StatCard title="Failed" value={String(status.failed || 0)} icon={<AlertTriangle size={20} />} />
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-section">
          <h2 className="section-title">Live Logs</h2>
          <div className="logs-panel">
            {logs.length ? (
              <>
                {logs.slice(-120).map((log, index) => (
                  <div className="log-entry" key={`${log.at}-${index}`}>
                    <span className="log-time">[{new Date(log.at).toLocaleTimeString()}]</span>
                    <span className={log.type === 'success' ? 'log-success' : log.type === 'error' ? 'log-error' : 'log-info'}>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No LinkedIn bot logs yet.
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-section">
          <h2 className="section-title">Uploaded Queue</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 12).map((lead) => (
                  <tr key={lead.profile_id || lead.linkedin_url}>
                    <td>{lead.full_name || lead.profile_name || '-'}</td>
                    <td>{lead.role || lead.job_title || '-'}</td>
                    <td>{lead.company_name || '-'}</td>
                    <td>{lead.email || '-'}</td>
                    <td>{lead.phone_number || '-'}</td>
                    <td>{lead.current_status || lead.status || '-'}</td>
                  </tr>
                ))}
                {!leads.length && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      Upload an Excel file with a linkedin_url column to begin.
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

export default LinkedIn;
