import React, { useEffect, useMemo, useState } from 'react';
import Button from '../components/Button';
import { Download, Loader2, Play, Square } from 'lucide-react';
import { DEFAULT_PRODUCT, PRODUCTS } from '../config/products';

const FACEBOOK_BASE_URL = import.meta.env.VITE_FACEBOOK_BASE_URL || '/facebook-api';
const INDIA_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

const formatIndiaDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return INDIA_DATE_TIME_FORMATTER.format(date);
};

const getIndiaDateInputValue = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const normalizeGoogleLead = (lead) => ({
  id: `google-${lead.id}`,
  rawId: lead.id,
  full_name: lead.full_name || '',
  role: lead.role || '',
  company_name: lead.company_name || lead.company || '',
  email: lead.email || lead.mail || '',
  phone_number: lead.phone_number || lead.phone || '',
  facebook_url: lead.facebook_url || '',
  source: 'Facebook Scraper',
  sourceKey: 'google',
  status: lead.status || 'new',
  extraction_date: lead.extraction_date || lead.created_at,
  message: '',
});

const Leads = () => {
  const [googleLeads, setGoogleLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapingMode, setScrapingMode] = useState('');
  const [googleStatus, setGoogleStatus] = useState({ running: false, inserted: 0, exported: 0, logs: [] });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadDate, setDownloadDate] = useState(getIndiaDateInputValue);
  const [downloadProduct, setDownloadProduct] = useState('all');
  const [productModalMode, setProductModalMode] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(DEFAULT_PRODUCT);
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({
    from: '',
    to: '',
  });
  const pageSize = 20;

  const googleQueryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    ['from', 'to'].forEach((key) => {
      if (filters[key]) params.set(key, filters[key]);
    });
    return params.toString();
  }, [filters, page]);

  const loadStatus = async () => {
    const res = await fetch(`${FACEBOOK_BASE_URL}/api/google/status`);
    if (res.ok) setGoogleStatus(await res.json());
  };

  const loadLeads = async () => {
    setLoading(true);
    try {
      const googleRes = await fetch(`${FACEBOOK_BASE_URL}/api/google/leads?${googleQueryString}`);
      const googleData = googleRes ? await googleRes.json() : { data: [], total: 0 };
      const googles = (googleData.data || []).map(normalizeGoogleLead);
      setGoogleLeads(googles);
      setTotal(googleData.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
    loadStatus();
  }, [googleQueryString]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadStatus();
      if (googleStatus.running) loadLeads();
    }, 5000);
    return () => clearInterval(interval);
  }, [googleStatus.running]);

  const leads = useMemo(() => googleLeads, [googleLeads]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const startScraping = async (mode, product) => {
    setScraping(true);
    setScrapingMode(mode);
    setNotice('');
    try {
      const endpoint = mode === 'india'
        ? '/api/google/start-india'
        : mode === 'international'
          ? '/api/google/start-international'
          : '/api/google/start';
      const res = await fetch(`${FACEBOOK_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product }),
      });
      const data = await res.json().catch(() => null);
      setNotice(data?.message || (res.ok ? 'Lead scraper started.' : 'Lead scraper could not start.'));
      await loadStatus();
    } finally {
      setScraping(false);
      setScrapingMode('');
    }
  };

  const stopScraping = async () => {
    const res = await fetch(`${FACEBOOK_BASE_URL}/api/google/stop`, { method: 'POST' });
    const data = await res.json().catch(() => null);
    setNotice(data?.message || 'Lead scraper stop requested.');
    await loadStatus();
  };

  const exportLeads = (selectedDate, product) => {
    const params = new URLSearchParams();
    if (selectedDate) params.set('date', selectedDate);
    if (product && product !== 'all') params.set('product', product);
    window.location.href = `${FACEBOOK_BASE_URL}/api/google/export?${params.toString()}`;
    setDownloadModalOpen(false);
  };

  const exportFilteredLeads = () => {
    const params = new URLSearchParams(googleQueryString);
    params.delete('page');
    params.delete('pageSize');
    window.location.href = `${FACEBOOK_BASE_URL}/api/google/export?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">Phase 1 Facebook lead scraping and exports</p>
        </div>
        <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
          {googleStatus.running ? (
            <Button
              variant="danger"
              icon={<Square size={16} />}
              onClick={stopScraping}
              disabled={scraping}
            >
              Stop Lead Scraper
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                icon={scraping && scrapingMode === 'india' ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                onClick={() => setProductModalMode('india')}
                disabled={scraping}
              >
                Start Scraping Indian Profiles
              </Button>
              <Button
                variant="primary"
                icon={scraping && scrapingMode === 'international' ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                onClick={() => setProductModalMode('international')}
                disabled={scraping}
              >
                Start Scraping International Leads
              </Button>
            </>
          )}
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => setDownloadModalOpen(true)}>
            Download Leads
          </Button>
        </div>
      </div>

      {notice && (
        <div className="dashboard-section" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          {notice}
        </div>
      )}

      {productModalMode && (
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
              <Button variant="secondary" onClick={() => setProductModalMode('')} disabled={scraping}>Cancel</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const mode = productModalMode;
                  setProductModalMode('');
                  await startScraping(mode, selectedProduct);
                }}
                disabled={scraping || !selectedProduct}
              >
                Start Scraping
              </Button>
            </div>
          </div>
        </div>
      )}

      {downloadModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem',
        }}>
          <div className="dashboard-section" style={{ width: '100%', maxWidth: 420, margin: 0 }}>
            <h2 className="section-title">Download Leads</h2>
            <div className="form-group">
              <label className="form-label">Scraped Date</label>
              <input
                className="form-control"
                type="date"
                value={downloadDate}
                onChange={(event) => setDownloadDate(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Product</label>
              <select className="form-control" value={downloadProduct} onChange={(event) => setDownloadProduct(event.target.value)}>
                <option value="all">All Products</option>
                {PRODUCTS.map((product) => <option key={product.value} value={product.value}>{product.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-4" style={{ justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setDownloadModalOpen(false)}>Cancel</Button>
              <Button variant="secondary" onClick={exportFilteredLeads}>Use Current Filters</Button>
              <Button variant="primary" icon={<Download size={16} />} onClick={() => exportLeads(downloadDate, downloadProduct)} disabled={!downloadDate}>
                Download
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="stats-grid mb-6">
        <div className="stat-card"><div className="stat-title">Total Leads</div><div className="stat-value">{total}</div></div>
        <div className="stat-card"><div className="stat-title">Scraped Leads Count</div><div className="stat-value">{googleStatus.inserted || googleLeads.length}</div></div>
        <div className="stat-card"><div className="stat-title">Exported Leads Count</div><div className="stat-value">{googleStatus.exported || 0}</div></div>
        <div className="stat-card"><div className="stat-title">Live Scraping Status</div><div className="stat-value">{googleStatus.running ? 'Running' : 'Stopped'}</div></div>
      </div>

      <div className="dashboard-section">
        <div className="flex gap-4 mb-4" style={{ flexWrap: 'wrap' }}>
          <div className="form-group">
            <label className="form-label">From</label>
            <input className="form-control" type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">To</label>
            <input className="form-control" type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Role</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone Number</th>
                <th>Facebook URL</th>
                <th>Source</th>
                <th>Status</th>
                <th>Extraction Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>Loading leads...</td></tr>
              ) : leads.length ? leads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.full_name || '-'}</td>
                  <td>{lead.role || '-'}</td>
                  <td>{lead.company_name || '-'}</td>
                  <td>{lead.email || '-'}</td>
                  <td>{lead.phone_number || '-'}</td>
                  <td style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={lead.facebook_url || ''}>
                    {lead.facebook_url ? <a href={lead.facebook_url} target="_blank" rel="noreferrer">{lead.facebook_url}</a> : '-'}
                  </td>
                  <td>{lead.source || '-'}</td>
                  <td>{lead.status || '-'}</td>
                  <td>{formatIndiaDateTime(lead.extraction_date)}</td>
                </tr>
              )) : (
                <tr><td colSpan="9" style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>No leads found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Page {page} of {totalPages} - {total} leads</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
            <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      </div>

      <div className="dashboard-section mt-6">
        <h2 className="section-title">Processing Logs</h2>
        <div style={{ maxHeight: 180, overflow: 'auto', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {(googleStatus.logs || []).length ? googleStatus.logs.slice().reverse().map((entry, index) => (
            <div key={`${entry.at}-${index}`}>{formatIndiaDateTime(entry.at)} - {entry.message}</div>
          )) : <div>No scraper logs yet.</div>}
        </div>
      </div>
    </div>
  );
};

export default Leads;
