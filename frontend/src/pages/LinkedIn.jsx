import React, { useEffect, useRef, useState } from 'react';
import Button from '../components/Button';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  Play,
  Square,
  Upload,
  UserCheck,
  UserPlus,
  Radio,
  X
} from 'lucide-react';
import { DEFAULT_PRODUCT, PRODUCTS } from '../config/products';

const LINKEDIN_BASE_URL = import.meta.env.VITE_LINKEDIN_BASE_URL || '/linkedin-api';
const LINKEDIN_FILTER_CONFIG = {
  searchFields: ['full_name', 'profile_name', 'role', 'job_title', 'company_name', 'email', 'phone_number', 'linkedin_url'],
  facets: [{
    key: 'status',
    label: 'Status',
    field: (lead) => lead.current_status || lead.status,
  }],
};

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

const getStatusBadge = (statusStr) => {
  const s = String(statusStr || '').toLowerCase();
  if (s.includes('accepted')) {
    return <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 9px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Accepted</span>;
  }
  if (s.includes('connect_sent') || s.includes('connect sent')) {
    return <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '3px 9px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Connect Sent</span>;
  }
  if (s.includes('message_sent') || s.includes('message sent')) {
    return <span style={{ background: '#faf5ff', color: '#7e22ce', padding: '3px 9px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Message Sent</span>;
  }
  if (s.includes('fail') || s.includes('error')) {
    return <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '3px 9px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Failed</span>;
  }
  if (s.includes('pending')) {
    return <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 9px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Pending</span>;
  }
  return <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 9px', borderRadius: '12px', fontSize: '0.75rem' }}>{statusStr || '-'}</span>;
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
  const leadsFilters = useTableFilters(leads, LINKEDIN_FILTER_CONFIG);
  const leadsPagination = useTablePagination(leadsFilters.filteredItems);

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
      alert(error.message);
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
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start LinkedIn bot');
      }
      await loadLinkedInState();
    } catch (error) {
      alert(error.message);
    } finally {
      setStarting(false);
    }
  };

  const stopBot = async () => {
    setStopping(true);
    try {
      const res = await fetch(`${LINKEDIN_BASE_URL}/api/linkedin/stop`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to stop LinkedIn bot');
      }
      await loadLinkedInState();
    } catch (error) {
      alert(error.message);
    } finally {
      setStopping(false);
    }
  };

  const checkAccepted = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${LINKEDIN_BASE_URL}/api/linkedin/check-accepted`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to check accepted connections');
      }
      await loadLinkedInState();
    } catch (error) {
      alert(error.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">LinkedIn Automation</h1>
          <p className="page-subtitle">Run automated URL-based outreach, connection requests, and multi-channel messaging</p>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="btn btn-secondary" style={{ cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
            {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
            <span>{uploading ? 'Uploading...' : 'Upload Excel'}</span>
            <input type="file" accept=".xlsx,.xls" onChange={uploadExcel} disabled={uploading} style={{ display: 'none' }} />
          </label>
          <Button
            variant="primary"
            icon={starting ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            onClick={() => setProductModalOpen(true)}
            disabled={starting || botRunning}
            style={{ fontSize: '0.85rem' }}
          >
            {starting ? 'Starting...' : 'Start Bot'}
          </Button>
          <Button
            variant="secondary"
            icon={checking ? <Loader2 size={16} className="spin" /> : <UserCheck size={16} />}
            onClick={checkAccepted}
            disabled={checking || botRunning}
            style={{ fontSize: '0.85rem' }}
          >
            {checking ? 'Checking...' : 'Check Accepted'}
          </Button>
          {botRunning && (
            <Button
              variant="danger"
              icon={stopping ? <Loader2 size={16} className="spin" /> : <Square size={16} />}
              onClick={stopBot}
              disabled={stopping}
              style={{ fontSize: '0.85rem' }}
            >
              {stopping ? 'Stopping...' : 'Stop Bot'}
            </Button>
          )}
        </div>
      </div>

      {/* Product Selection Modal */}
      {productModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1rem',
        }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
              width: '100%',
              maxWidth: 440,
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Select Outreach Product</h2>
              <button onClick={() => setProductModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '0.825rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Choose which product template and messaging sequences the LinkedIn bot will execute.
            </p>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Product Campaign</label>
              <select
                className="form-control"
                value={selectedProduct}
                onChange={(event) => setSelectedProduct(event.target.value)}
                style={{ padding: '0.65rem 0.85rem', borderRadius: '10px' }}
              >
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
                Launch Bot
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1rem 1.25rem', boxShadow: '0 4px 16px rgba(180, 205, 235, 0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Total Uploaded</span>
            <UserPlus size={16} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.35rem' }}>
            {status.total_uploaded || leads.length}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1rem 1.25rem', boxShadow: '0 4px 16px rgba(180, 205, 235, 0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Connect Sent</span>
            <UserCheck size={16} style={{ color: '#0284c7' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.35rem' }}>
            {status.connect_sent || 0}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1rem 1.25rem', boxShadow: '0 4px 16px rgba(180, 205, 235, 0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Accepted</span>
            <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#15803d', marginTop: '0.35rem' }}>
            {status.accepted || 0}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1rem 1.25rem', boxShadow: '0 4px 16px rgba(180, 205, 235, 0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Message Sent</span>
            <MessageSquare size={16} style={{ color: '#7e22ce' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.35rem' }}>
            {status.linkedin_message_sent || 0}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1rem 1.25rem', boxShadow: '0 4px 16px rgba(180, 205, 235, 0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Email / WhatsApp</span>
            <Mail size={16} style={{ color: '#0d9488' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.35rem' }}>
            {(status.email_sent || 0) + (status.whatsapp_sent || 0)}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1rem 1.25rem', boxShadow: '0 4px 16px rgba(180, 205, 235, 0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Failed</span>
            <AlertTriangle size={16} style={{ color: '#e11d48' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#b91c1c', marginTop: '0.35rem' }}>
            {status.failed || 0}
          </div>
        </div>
      </div>

      {/* Main Grid: Live Logs + Uploaded Queue */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(480px, 1.8fr)', gap: '1.25rem', marginBottom: '2rem' }}>
        {/* Live Logs Card */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid rgba(220, 234, 250, 0.95)',
            boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Live Execution Feed
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: botRunning ? '#16a34a' : '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: botRunning ? '#22c55e' : '#94a3b8', display: 'inline-block' }} />
              {botRunning ? 'Streaming' : 'Idle'}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: '380px',
              maxHeight: '480px',
              overflowY: 'auto',
              background: '#0f172a',
              borderRadius: '12px',
              padding: '1rem',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              color: '#e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {logs.length ? (
              <>
                {logs.slice(-120).map((log, index) => (
                  <div key={`${log.at}-${index}`} style={{ lineHeight: '1.4' }}>
                    <span style={{ color: '#94a3b8', marginRight: '6px' }}>[{new Date(log.at).toLocaleTimeString()}]</span>
                    <span style={{ color: log.type === 'success' ? '#4ade80' : log.type === 'error' ? '#f87171' : '#60a5fa' }}>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No active LinkedIn bot logs yet.
              </div>
            )}
          </div>
        </div>

        {/* Uploaded Queue Card */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid rgba(220, 234, 250, 0.95)',
            boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Lead Queue ({leadsFilters.filteredItems.length})
            </h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>
              Uploaded candidates awaiting sequence
            </p>
          </div>

          <TableFilters {...leadsFilters} searchPlaceholder="Search queue..." />

          <div className="table-container" style={{ marginTop: '0.75rem', flex: 1 }}>
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leadsPagination.pageItems.map((lead, idx) => (
                  <tr key={lead.profile_id || lead.linkedin_url || idx}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{lead.full_name || lead.profile_name || 'Contact'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{lead.email || lead.phone_number || '-'}</div>
                    </td>
                    <td>{lead.role || lead.job_title || '-'}</td>
                    <td>{lead.company_name || '-'}</td>
                    <td>{getStatusBadge(lead.current_status || lead.status)}</td>
                  </tr>
                ))}
                {!leadsFilters.filteredItems.length && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                      {leadsFilters.hasFilters ? 'No leads match the filters.' : 'Upload an Excel file with a linkedin_url column to begin.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination {...leadsPagination} />
        </div>
      </div>
    </div>
  );
};

export default LinkedIn;
