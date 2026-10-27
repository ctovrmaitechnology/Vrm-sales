import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Play, Square, Upload } from 'lucide-react';
import Button from '../components/Button';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';

const FACEBOOK_BASE_URL = import.meta.env.VITE_FACEBOOK_BASE_URL || '/facebook-api';

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

const FACEBOOK_FILTER_CONFIG = {
  searchFields: ['full_name', 'company', 'role', 'email', 'phone', 'whatsapp_number', 'facebook_url', 'linkedin_url'],
  facets: [
    { key: 'company', label: 'Company', field: 'company' },
    { key: 'role', label: 'Role', field: 'role' },
  ],
  dateField: 'extraction_date',
};

const Facebook = () => {
  const [status, setStatus] = useState({ running: false, facebookLeadsCount: 0, finalLeadsCount: 0, logs: [] });
  const [facebookLeads, setFacebookLeads] = useState([]);
  const [finalLeads, setFinalLeads] = useState([]);
  const [facebookTotal, setFacebookTotal] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);
  const [activeAction, setActiveAction] = useState('');
  const [notice, setNotice] = useState('');
  const [facebookPage, setFacebookPage] = useState(1);
  const [finalPage, setFinalPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const facebookFilters = useTableFilters(facebookLeads, FACEBOOK_FILTER_CONFIG);
  const finalFilters = useTableFilters(finalLeads, FACEBOOK_FILTER_CONFIG);

  const facebookQueryString = useMemo(
    () => new URLSearchParams({ page: String(facebookPage), pageSize: String(pageSize) }).toString(),
    [facebookPage, pageSize]
  );
  const finalQueryString = useMemo(
    () => new URLSearchParams({ page: String(finalPage), pageSize: String(pageSize) }).toString(),
    [finalPage, pageSize]
  );

  const loadStatus = async () => {
    const res = await fetch(`${FACEBOOK_BASE_URL}/api/facebook/status`);
    if (res.ok) setStatus(await res.json());
  };

  const loadLeads = async () => {
    const [fbRes, finalRes] = await Promise.all([
      fetch(`${FACEBOOK_BASE_URL}/api/facebook/leads?${facebookQueryString}`).catch(() => null),
      fetch(`${FACEBOOK_BASE_URL}/api/facebook/final-leads?${finalQueryString}`).catch(() => null),
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
  }, [facebookQueryString, finalQueryString]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadStatus();
      if (status.running) loadLeads();
    }, 5000);
    return () => clearInterval(interval);
  }, [status.running, facebookQueryString, finalQueryString]);

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
        <TableFilters {...facebookFilters} searchPlaceholder="Search loaded Facebook rows..." />
        <p style={{ margin: '-0.5rem 0 0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          Filters apply to the currently loaded page.
        </p>
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
            <tbody>{renderRows(facebookFilters.filteredItems, false)}</tbody>
          </table>
          <TablePagination
            page={facebookPage}
            pageSize={pageSize}
            pageCount={Math.max(1, Math.ceil(facebookTotal / pageSize))}
            totalCount={facebookTotal}
            setPage={setFacebookPage}
            setPageSize={(size) => { setPageSize(size); setFacebookPage(1); setFinalPage(1); }}
          />
        </div>
      </div>

      <div className="dashboard-section mb-6">
        <h2 className="section-title">Phase 3 LinkedIn URL Excel</h2>
        <TableFilters {...finalFilters} searchPlaceholder="Search loaded LinkedIn rows..." />
        <p style={{ margin: '-0.5rem 0 0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          Filters apply to the currently loaded page.
        </p>
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
            <tbody>{renderRows(finalFilters.filteredItems, true)}</tbody>
          </table>
        </div>
        <TablePagination
          page={finalPage}
          pageSize={pageSize}
          pageCount={Math.max(1, Math.ceil(finalTotal / pageSize))}
          totalCount={finalTotal}
          setPage={setFinalPage}
          setPageSize={(size) => { setPageSize(size); setFacebookPage(1); setFinalPage(1); }}
        />
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
