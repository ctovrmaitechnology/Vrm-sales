import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Play, Square, Upload } from 'lucide-react';
import Button from '../components/Button';

const FACEBOOK_BASE_URL = import.meta.env.VITE_FACEBOOK_BASE_URL || '/facebook-api';
const pageSize = 20;

const normalizeLead = (lead, index) => ({
  id: `${lead.facebook_url || lead.linkedin_url || lead.email || lead.mail || index}`,
  full_name: lead.full_name || '',
  company: lead.company || lead.company_name || '',
  role: lead.role || '',
  email: lead.email || lead.mail || '',
  phone: lead.phone || lead.phone_number || '',
  whatsapp_number: lead.whatsapp_number || '',
  whatsapp_available: lead.whatsapp_available,
  facebook_url: lead.facebook_url || '',
  linkedin_url: lead.linkedin_url || '',
  extraction_date: lead.extraction_date || '',
});

const Facebook = () => {
  const [status, setStatus] = useState({ running: false, facebookLeadsCount: 0, finalLeadsCount: 0, logs: [] });
  const [facebookLeads, setFacebookLeads] = useState([]);
  const [finalLeads, setFinalLeads] = useState([]);
  const [facebookTotal, setFacebookTotal] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);
  const [activeAction, setActiveAction] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);

  const queryString = useMemo(() => new URLSearchParams({ page: String(page), pageSize: String(pageSize) }).toString(), [page]);

  const loadStatus = async () => {
    const res = await fetch(`${FACEBOOK_BASE_URL}/api/facebook/status`);
    if (res.ok) setStatus(await res.json());
  };

  const loadLeads = async () => {
    const [fbRes, finalRes] = await Promise.all([
      fetch(`${FACEBOOK_BASE_URL}/api/facebook/leads?${queryString}`).catch(() => null),
      fetch(`${FACEBOOK_BASE_URL}/api/facebook/final-leads?${queryString}`).catch(() => null),
    ]);

    if (fbRes?.ok) {
      const data = await fbRes.json();
      setFacebookLeads((data.data || []).map(normalizeLead));
      setFacebookTotal(data.total || 0);
    }

    if (finalRes?.ok) {
      const data = await finalRes.json();
      setFinalLeads((data.data || []).map(normalizeLead));
      setFinalTotal(data.total || 0);
    }
  };

  useEffect(() => {
    loadStatus();
    loadLeads();
  }, [queryString]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadStatus();
      if (status.running) loadLeads();
    }, 5000);
    return () => clearInterval(interval);
  }, [status.running, queryString]);

  const runAction = async (name, url, options = {}) => {
    setActiveAction(name);
    setNotice('');
    try {
      const res = await fetch(`${FACEBOOK_BASE_URL}${url}`, options);
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;
      if (!res.ok || data?.success === false) {
        setNotice(data?.message || data?.error || 'Action failed.');
        return;
      }
      if (data?.message) setNotice(data.message);
      await loadStatus();
      await loadLeads();
    } finally {
      setActiveAction('');
    }
  };

  const uploadExcel = async (event, url, name) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    await runAction(name, url, {
      method: 'POST',
      body: formData,
    });

    event.target.value = '';
  };

  const download = (url) => {
    window.location.href = `${FACEBOOK_BASE_URL}${url}`;
  };

  const stop = () => runAction('stop', '/api/facebook/stop', { method: 'POST' });
  const startContacts = () => runAction('contacts', '/api/facebook/enrich-contacts', { method: 'POST' });
  const startLinkedIn = () => runAction('linkedin', '/api/facebook/find-linkedin', { method: 'POST' });
  const currentAction = activeAction || (status.facebookRunning ? 'Facebook contacts' : status.linkedinRunning ? 'LinkedIn URLs' : '-');

  const renderRows = (rows, final = false) => (
    rows.length ? rows.map((lead, index) => (
      <tr key={`${lead.id}-${index}`}>
        <td>{lead.full_name || '-'}</td>
        <td>{lead.company || '-'}</td>
        <td>{lead.role || '-'}</td>
        <td>{lead.email || '-'}</td>
        <td>{lead.phone || '-'}</td>
        <td>{lead.whatsapp_number || '-'}</td>
        <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.facebook_url ? <a href={lead.facebook_url} target="_blank" rel="noreferrer">{lead.facebook_url}</a> : '-'}
        </td>
        {final && (
          <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" rel="noreferrer">{lead.linkedin_url}</a> : '-'}
          </td>
        )}
        <td>{lead.extraction_date || '-'}</td>
      </tr>
    )) : (
      <tr>
        <td colSpan={final ? 9 : 8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
          No leads found.
        </td>
      </tr>
    )
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Facebook Leads</h1>
          <p className="page-subtitle">Upload Leads Excel to extract Facebook contacts, then upload the contact Excel to find LinkedIn URLs.</p>
        </div>
        <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
          <label className="btn btn-secondary" style={{ cursor: activeAction ? 'not-allowed' : 'pointer' }}>
            <span className="btn-icon"><Upload size={16} /></span>
            Upload Leads Excel
            <input type="file" accept=".xlsx,.xls" disabled={Boolean(activeAction)} onChange={(e) => uploadExcel(e, '/api/facebook/upload', 'upload-facebook')} style={{ display: 'none' }} />
          </label>
          <Button
            variant="primary"
            icon={activeAction === 'contacts' ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            onClick={startContacts}
            disabled={Boolean(activeAction) || status.facebookRunning}
          >
            Start Facebook Contact Bot
          </Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('/api/facebook/export')}>
            Download Facebook Contact Excel
          </Button>
          <label className="btn btn-secondary" style={{ cursor: activeAction ? 'not-allowed' : 'pointer' }}>
            <span className="btn-icon"><Upload size={16} /></span>
            Upload Contact Excel
            <input type="file" accept=".xlsx,.xls" disabled={Boolean(activeAction)} onChange={(e) => uploadExcel(e, '/api/facebook/upload', 'upload-contact')} style={{ display: 'none' }} />
          </label>
          <Button
            variant="primary"
            icon={activeAction === 'linkedin' ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            onClick={startLinkedIn}
            disabled={Boolean(activeAction) || status.linkedinRunning}
          >
            Start LinkedIn URL Bot
          </Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('/api/facebook/export-final')}>
            Download Final LinkedIn Excel
          </Button>
          {status.running && (
            <Button variant="danger" icon={<Square size={16} />} onClick={stop} disabled={Boolean(activeAction)}>
              Stop
            </Button>
          )}
        </div>
      </div>

      <div className="stats-grid mb-6">
        <div className="stat-card"><div className="stat-title">Facebook Leads</div><div className="stat-value">{status.facebookLeadsCount || facebookTotal}</div></div>
        <div className="stat-card"><div className="stat-title">LinkedIn URL Leads</div><div className="stat-value">{status.finalLeadsCount || finalTotal}</div></div>
        <div className="stat-card"><div className="stat-title">Workflow Status</div><div className="stat-value">{status.running ? 'Running' : 'Stopped'}</div></div>
        <div className="stat-card"><div className="stat-title">Current Action</div><div className="stat-value">{currentAction}</div></div>
      </div>

      {notice && (
        <div className="dashboard-section mb-6" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {notice}
        </div>
      )}

      <div className="dashboard-section mb-6">
        <h2 className="section-title">Facebook Excel</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Company</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>WhatsApp Number</th>
                <th>Facebook URL</th>
                <th>Extraction Date</th>
              </tr>
            </thead>
            <tbody>{renderRows(facebookLeads, false)}</tbody>
          </table>
        </div>
      </div>

      <div className="dashboard-section mb-6">
        <h2 className="section-title">Phase 3 LinkedIn URL Excel</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Company</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>WhatsApp Number</th>
                <th>Facebook URL</th>
                <th>LinkedIn URL</th>
                <th>Extraction Date</th>
              </tr>
            </thead>
            <tbody>{renderRows(finalLeads, true)}</tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-4">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Page {page} - Facebook {facebookTotal}, LinkedIn {finalTotal}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
            <Button variant="secondary" onClick={() => setPage((p) => p + 1)} disabled={facebookLeads.length < pageSize && finalLeads.length < pageSize}>Next</Button>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <h2 className="section-title">Processing Logs</h2>
        <div style={{ maxHeight: 200, overflow: 'auto', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {(status.logs || []).length ? status.logs.slice().reverse().map((entry, index) => (
            <div key={`${entry.at}-${index}`}>{new Date(entry.at).toLocaleTimeString()} - {entry.message}</div>
          )) : <div>No Facebook workflow logs yet.</div>}
        </div>
      </div>
    </div>
  );
};

export default Facebook;
