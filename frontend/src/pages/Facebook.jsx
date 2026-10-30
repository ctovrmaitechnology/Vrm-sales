import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Play, Square, Upload, Users, Link as LinkIcon, Activity, CheckCircle2 } from 'lucide-react';
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
        throw new Error(data?.error || `Action failed: ${res.statusText}`);
      }
      setNotice(data?.message || 'Action completed successfully.');
      await loadStatus();
      await loadLeads();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setActiveAction('');
    }
  };

  const uploadExcel = async (event, url, actionName) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    await runAction(actionName, url, { method: 'POST', body });
    event.target.value = '';
  };

  const startContacts = () => runAction('contacts', '/api/facebook/start-contacts', { method: 'POST' });
  const startLinkedIn = () => runAction('linkedin', '/api/facebook/start-linkedin', { method: 'POST' });
  const stop = () => runAction('stop', '/api/facebook/stop', { method: 'POST' });

  const download = (url) => {
    window.open(`${FACEBOOK_BASE_URL}${url}`, '_blank');
  };

  const currentAction = activeAction
    ? activeAction
    : status.facebookRunning
      ? 'Facebook Contact Bot Running'
      : status.linkedinRunning
        ? 'LinkedIn URL Bot Running'
        : 'Idle';

  const renderRows = (items, final = false) => (
    items.length ? items.map((lead, index) => (
      <tr key={`${lead.id}-${index}`}>
        <td style={{ fontWeight: 600 }}>{lead.full_name || '-'}</td>
        <td>{lead.company || '-'}</td>
        <td>{lead.role || '-'}</td>
        <td>{lead.email || '-'}</td>
        <td>{lead.phone || '-'}</td>
        <td>
          {lead.whatsapp_number ? (
            <span style={{ color: '#16a34a', fontWeight: 500 }}>
              {lead.whatsapp_number}
              {lead.whatsapp_available ? ' ✓' : ''}
            </span>
          ) : '-'}
        </td>
        <td>
          {lead.facebook_url ? <a href={lead.facebook_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{lead.facebook_url}</a> : '-'}
        </td>
        {final && (
          <td>
            {lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{lead.linkedin_url}</a> : '-'}
          </td>
        )}
        <td>{lead.extraction_date || '-'}</td>
      </tr>
    )) : (
      <tr>
        <td colSpan={final ? 9 : 8} style={{ textAlign: 'center', color: '#64748b', padding: '2.5rem' }}>
          No leads found.
        </td>
      </tr>
    )
  );

  return (
    <div>
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Facebook Leads & Enrichment</h1>
          <p className="page-subtitle">Extract verified Facebook contact data and enrich profiles with matching LinkedIn URLs</p>
        </div>
        {status.running && (
          <Button variant="danger" icon={<Square size={16} />} onClick={stop} disabled={Boolean(activeAction)}>
            Stop Active Bot
          </Button>
        )}
      </div>

      {notice && (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '0.85rem 1.25rem',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1d4ed8',
            borderRadius: '12px',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {notice}
        </div>
      )}

      {/* KPI Overview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1.25rem 1.5rem', boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
            <span>Facebook Leads</span>
            <Users size={18} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '0.4rem' }}>
            {status.facebookLeadsCount || facebookTotal}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1.25rem 1.5rem', boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
            <span>LinkedIn Enriched</span>
            <LinkIcon size={18} style={{ color: '#0284c7' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '0.4rem' }}>
            {status.finalLeadsCount || finalTotal}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1.25rem 1.5rem', boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
            <span>Workflow Status</span>
            <Activity size={18} style={{ color: status.running ? '#16a34a' : '#64748b' }} />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: status.running ? '#16a34a' : '#64748b', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: status.running ? '#22c55e' : '#94a3b8', display: 'inline-block' }} />
            {status.running ? 'Running' : 'Idle'}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(220, 234, 250, 0.95)', padding: '1.25rem 1.5rem', boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
            <span>Current Action</span>
            <CheckCircle2 size={18} style={{ color: '#8b5cf6' }} />
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginTop: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentAction}
          </div>
        </div>
      </div>

      {/* Two-Phase Structured Workflow Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
        {/* Phase 1 Card */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid rgba(220, 234, 250, 0.95)',
            boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
            padding: '1.35rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'inline-flex', padding: '3px 10px', background: '#eff6ff', color: '#2563eb', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              PHASE 1
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.35rem' }}>
              Facebook Contact Extraction
            </h2>
            <p style={{ fontSize: '0.825rem', color: '#64748b', margin: 0 }}>
              Upload your initial Facebook leads sheet to scrape phone numbers and contact details.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
            <label className="btn btn-secondary" style={{ cursor: activeAction ? 'not-allowed' : 'pointer', fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}>
              <Upload size={14} />
              <span>Upload Leads Excel</span>
              <input type="file" accept=".xlsx,.xls" disabled={Boolean(activeAction)} onChange={(e) => uploadExcel(e, '/api/facebook/upload', 'upload-facebook')} style={{ display: 'none' }} />
            </label>
            <Button
              variant="primary"
              icon={activeAction === 'contacts' ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
              onClick={startContacts}
              disabled={Boolean(activeAction) || status.facebookRunning}
              style={{ fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}
            >
              Start Bot
            </Button>
            <Button
              variant="secondary"
              icon={<Download size={14} />}
              onClick={() => download('/api/facebook/export')}
              style={{ fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}
            >
              Export
            </Button>
          </div>
        </div>

        {/* Phase 2 Card */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid rgba(220, 234, 250, 0.95)',
            boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
            padding: '1.35rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'inline-flex', padding: '3px 10px', background: '#faf5ff', color: '#7e22ce', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              PHASE 2
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.35rem' }}>
              LinkedIn URL Enrichment
            </h2>
            <p style={{ fontSize: '0.825rem', color: '#64748b', margin: 0 }}>
              Upload extracted contacts to automatically discover corresponding verified LinkedIn profiles.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
            <label className="btn btn-secondary" style={{ cursor: activeAction ? 'not-allowed' : 'pointer', fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}>
              <Upload size={14} />
              <span>Upload Contact Excel</span>
              <input type="file" accept=".xlsx,.xls" disabled={Boolean(activeAction)} onChange={(e) => uploadExcel(e, '/api/facebook/upload', 'upload-contact')} style={{ display: 'none' }} />
            </label>
            <Button
              variant="primary"
              icon={activeAction === 'linkedin' ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
              onClick={startLinkedIn}
              disabled={Boolean(activeAction) || status.linkedinRunning}
              style={{ fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}
            >
              Start Bot
            </Button>
            <Button
              variant="secondary"
              icon={<Download size={14} />}
              onClick={() => download('/api/facebook/export-final')}
              style={{ fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}
            >
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Facebook Directory Section */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(220, 234, 250, 0.95)',
          boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Facebook Extracted Leads</h2>
            <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.8rem' }}>
              Loaded {facebookFilters.filteredItems.length} records on current page
            </p>
          </div>
        </div>

        <TableFilters {...facebookFilters} searchPlaceholder="Search loaded Facebook rows..." />

        <div className="table-container" style={{ marginTop: '0.75rem' }}>
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

      {/* LinkedIn Enriched Directory Section */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(220, 234, 250, 0.95)',
          boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Final LinkedIn Enriched Leads</h2>
            <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.8rem' }}>
              Loaded {finalFilters.filteredItems.length} records on current page
            </p>
          </div>
        </div>

        <TableFilters {...finalFilters} searchPlaceholder="Search loaded LinkedIn rows..." />

        <div className="table-container" style={{ marginTop: '0.75rem' }}>
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
          <TablePagination
            page={finalPage}
            pageSize={pageSize}
            pageCount={Math.max(1, Math.ceil(finalTotal / pageSize))}
            totalCount={finalTotal}
            setPage={setFinalPage}
            setPageSize={(size) => { setPageSize(size); setFacebookPage(1); setFinalPage(1); }}
          />
        </div>
      </div>

      {/* Live Processing Logs Panel */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(220, 234, 250, 0.95)',
          boxShadow: '0 4px 18px rgba(180, 205, 235, 0.16)',
          padding: '1.25rem 1.5rem',
          marginBottom: '2rem',
        }}
      >
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.85rem' }}>
          Workflow Activity Logs
        </h2>
        <div style={{ maxHeight: 220, overflow: 'auto', fontSize: '0.825rem', color: '#334155', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontFamily: 'monospace' }}>
          {(status.logs || []).length ? status.logs.slice().reverse().map((entry, index) => (
            <div key={`${entry.at}-${index}`} style={{ padding: '3px 0' }}>
              <span style={{ color: '#2563eb', fontWeight: 600 }}>[{new Date(entry.at).toLocaleTimeString()}]</span> {entry.message}
            </div>
          )) : <div style={{ color: '#94a3b8' }}>No Facebook workflow logs yet.</div>}
        </div>
      </div>
    </div>
  );
};

export default Facebook;
