import { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/calls.css';
import {
  Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff,
  Clock, CheckCircle, XCircle, RefreshCw, X, Mic, ChevronLeft, ChevronRight,
  PlayCircle, FileText, Search, Filter, Users, History, Zap,
  Settings, Plus, Trash2, ArrowRightLeft, CheckSquare, AlertCircle,
} from 'lucide-react';
import CampaignProgressWidgetShared from '../components/CampaignProgressWidget';

const API = import.meta.env.VITE_BACKEND_BASE_URL || '';

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Status Badge ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  queued:        { label: 'Queued',      color: 'bg-amber-100 text-amber-700 border border-amber-200',   Icon: Clock },
  ringing:       { label: 'Ringing',     color: 'bg-blue-100 text-blue-700 border border-blue-200',      Icon: PhoneIncoming },
  'in-progress': { label: 'In Progress', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200', Icon: PhoneCall },
  completed:     { label: 'Completed',   color: 'bg-green-100 text-green-700 border border-green-200',   Icon: CheckCircle },
  'no-answer':   { label: 'No Answer',   color: 'bg-orange-100 text-orange-700 border border-orange-200', Icon: PhoneMissed },
  busy:          { label: 'Busy',        color: 'bg-red-100 text-red-700 border border-red-200',         Icon: PhoneOff },
  failed:        { label: 'Failed',      color: 'bg-rose-100 text-rose-700 border border-rose-200',      Icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status || '—', color: 'bg-gray-100 text-gray-500 border border-gray-200', Icon: Clock };
  const { label, color, Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <Icon size={10} /> {label}
    </span>
  );
}

function TypeBadge({ type }) {
  const map = {
    lead:          'bg-blue-50 text-blue-600 border border-blue-100',
    company:       'bg-violet-50 text-violet-600 border border-violet-100',
    whatsapp_lead: 'bg-green-50 text-green-600 border border-green-100',
  };
  const label = type === 'whatsapp_lead' ? 'WA Lead' : type ? type.charAt(0).toUpperCase() + type.slice(1) : '—';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[type] || 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
      {label}
    </span>
  );
}

// ─── Transcript Modal ─────────────────────────────────────────────────────────

function TranscriptModal({ record, onClose }) {
  if (!record) return null;

  const rawTranscript = record.transcript ?? record.transcriptText ?? null;
  const transcriptTurns = Array.isArray(rawTranscript) ? rawTranscript : null;
  const transcriptText = typeof rawTranscript === 'string' ? rawTranscript : null;
  const recordingUrl = record.recording_url || record.recordingUrl || null;
  const summary = record.summary || null;
  const contactName = record.contact_name || record.name || 'Unknown';
  const phone = record.phone_number || record.phone || '—';
  const endedReason = record.ended_reason || record.endedReason || null;
  const cost = record.cost ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col border border-gray-100 dark:border-gray-800">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold shadow">
              {initials(contactName)}
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100">{contactName}</p>
              <p className="text-xs text-gray-400 font-mono">{phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Recording Player */}
        {recordingUrl && (
          <div className="mx-5 mt-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 p-4">
            <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1.5">
              <PlayCircle size={13} /> Voice Recording
            </p>
            <audio controls src={recordingUrl} className="w-full h-9" />
            <a href={recordingUrl} target="_blank" rel="noopener noreferrer"
               className="inline-block mt-2 text-xs text-green-600 hover:text-green-700 underline underline-offset-2">
              Open in new tab ↗
            </a>
          </div>
        )}

        {/* AI Summary */}
        {summary && (
          <div className="mx-5 mt-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-4">
            <p className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
              <Zap size={12} /> AI Summary
            </p>
            <p className="text-sm text-blue-800 leading-relaxed">{summary}</p>
          </div>
        )}

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={11} /> Transcript
          </p>

          {transcriptTurns && transcriptTurns.length > 0 && transcriptTurns.map((turn, i) => {
            const isAI = turn.role === 'assistant' || turn.role === 'ai' || turn.role === 'bot';
            return (
              <div key={i} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm max-w-[80%] shadow-sm ${
                  isAI
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    : 'bg-gradient-to-br from-blue-600 to-blue-700 text-white'
                }`}>
                  {isAI && <span className="block text-[10px] font-semibold opacity-50 mb-0.5">AI Agent</span>}
                  {turn.message || turn.content || turn.text || '…'}
                </div>
              </div>
            );
          })}

          {transcriptText && (
            <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-sans bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              {transcriptText}
            </pre>
          )}

          {!transcriptTurns && !transcriptText && (
            <div className="text-center py-10">
              <FileText size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No transcript available yet.</p>
            </div>
          )}
          {transcriptTurns && transcriptTurns.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Transcript is empty.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-4 text-xs text-gray-400 bg-gray-50/50 dark:bg-gray-800/30 rounded-b-2xl">
          <span className="flex items-center gap-1"><Clock size={11} /> {fmtDuration(record.duration)}</span>
          {cost != null && <span>💲 ${Number(cost).toFixed(4)}</span>}
          {endedReason && <span className="truncate">🔚 {endedReason}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Calls() {
  const [tab, setTab] = useState('contacts');

  // Contacts tab
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());

  // History tab
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyPage, setHistoryPage] = useState(0);
  const HISTORY_LIMIT = 50;

  // Campaign
  const [progress, setProgress] = useState(null);
  const progressInterval = useRef(null);

  // Transcript modal
  const [transcriptRecord, setTranscriptRecord] = useState(null);

  // Transfer settings modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferDestinations, setTransferDestinations] = useState([]);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferApplying, setTransferApplying] = useState(false);
  const [transferMsg, setTransferMsg] = useState(null); // { type: 'success'|'error', text }
  const [newDest, setNewDest] = useState({ number: '', name: '', role: '' });

  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const res = await fetch(`${API}/api/calls/contacts`);
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (page = 0) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/api/calls/history?limit=${HISTORY_LIMIT}&offset=${page * HISTORY_LIMIT}`);
      const data = await res.json();
      setHistory(data.records || []);
      setHistoryTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchTransferSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/calls/transfer/settings`);
      const data = await res.json();
      setTransferDestinations(data.destinations || []);
    } catch (e) { console.error(e); }
  }, []);

  const saveTransfer = async () => {
    setTransferSaving(true);
    setTransferMsg(null);
    try {
      const res = await fetch(`${API}/api/calls/transfer/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinations: transferDestinations }),
      });
      const data = await res.json();
      if (data.success) setTransferMsg({ type: 'success', text: 'Numbers saved!' });
      else setTransferMsg({ type: 'error', text: data.error || 'Save failed' });
    } catch (e) {
      setTransferMsg({ type: 'error', text: 'Network error' });
    } finally {
      setTransferSaving(false);
    }
  };

  const applyToVapi = async () => {
    setTransferApplying(true);
    setTransferMsg(null);
    try {
      const res = await fetch(`${API}/api/calls/transfer/apply`, { method: 'POST' });
      const data = await res.json();
      if (data.success) setTransferMsg({ type: 'success', text: data.message });
      else setTransferMsg({ type: 'error', text: data.error || 'Failed to apply' });
    } catch (e) {
      setTransferMsg({ type: 'error', text: 'Network error' });
    } finally {
      setTransferApplying(false);
    }
  };

  const removeFromVapi = async () => {
    setTransferApplying(true);
    setTransferMsg(null);
    try {
      const res = await fetch(`${API}/api/calls/transfer/remove`, { method: 'POST' });
      const data = await res.json();
      if (data.success) setTransferMsg({ type: 'success', text: 'Transfer tool removed from VAPI assistant.' });
      else setTransferMsg({ type: 'error', text: data.error || 'Failed to remove' });
    } catch (e) {
      setTransferMsg({ type: 'error', text: 'Network error' });
    } finally {
      setTransferApplying(false);
    }
  };

  const addDestination = () => {
    if (!newDest.number.trim()) return;
    setTransferDestinations(prev => [...prev, { ...newDest }]);
    setNewDest({ number: '', name: '', role: '' });
  };

  const removeDestination = (idx) => {
    setTransferDestinations(prev => prev.filter((_, i) => i !== idx));
  };

  const startPolling = useCallback(() => {
    if (progressInterval.current) return;
    progressInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/calls/campaign/status`);
        const data = await res.json();
        setProgress(data);
        if (!data.running) {
          clearInterval(progressInterval.current);
          progressInterval.current = null;
          fetchContacts();
        }
      } catch (e) { /* ignore */ }
    }, 2000);
  }, [fetchContacts]);

  useEffect(() => {
    fetchContacts();
    fetchHistory(0);
    fetchTransferSettings();
    fetch(`${API}/api/calls/campaign/status`)
      .then(r => r.json())
      .then(data => { if (data.running) { setProgress(data); startPolling(); } })
      .catch(() => {});
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  }, [fetchContacts, fetchHistory, fetchTransferSettings, startPolling]);

  useEffect(() => { fetchHistory(historyPage); }, [historyPage, fetchHistory]);

  const filteredContacts = contacts.filter(c => {
    if (typeFilter !== 'all' && c.contactType !== typeFilter) return false;
    if (contactSearch) {
      const q = contactSearch.toLowerCase();
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.company || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredHistory = history.filter(r => {
    if (historyStatusFilter !== 'all' && r.status !== historyStatusFilter) return false;
    if (historySearch) {
      const q = historySearch.toLowerCase();
      return (
        (r.contact_name || '').toLowerCase().includes(q) ||
        (r.phone_number || '').includes(q)
      );
    }
    return true;
  });

  const toggleSelect = (phone) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredContacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredContacts.map(c => c.phone)));
    }
  };

  const startCampaign = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Start calls to ${selected.size} contact(s)?`)) return;
    const selectedContacts = filteredContacts
      .filter(c => selected.has(c.phone))
      .map(c => ({ phone: c.phone, name: c.name, contactType: c.contactType, id: c.id }));
    try {
      const res = await fetch(`${API}/api/calls/campaign/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: selectedContacts }),
      });
      if (!res.ok) {
        const err = await res.json();
        return alert(err.error || 'Failed to start campaign');
      }
      setSelected(new Set());
      startPolling();
    } catch (e) {
      alert('Network error starting campaign');
    }
  };

  const cancelCampaign = async () => {
    await fetch(`${API}/api/calls/campaign/cancel`, { method: 'POST' });
    setProgress(prev => ({ ...prev, running: false }));
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  };

  const callSingle = async (contact) => {
    if (!window.confirm(`Call ${contact.name || contact.phone}?`)) return;
    try {
      const res = await fetch(`${API}/api/calls/single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: contact.phone,
          name: contact.name,
          contactType: contact.contactType,
          id: contact.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'Call failed');
      alert(`Calling ${contact.name || contact.phone}…`);
      fetchContacts();
    } catch (e) {
      alert('Network error');
    }
  };

  const syncCall = async (vapiCallId) => {
    if (!vapiCallId) return;
    await fetch(`${API}/api/calls/sync/${vapiCallId}`);
    fetchHistory(historyPage);
  };

  return (
    <div className="calls-page">
      <div className="p-2">

        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
              <Phone size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">Calls</h1>
              <p className="text-sm text-gray-500">AI-powered outbound voice campaigns via VAPI</p>
            </div>
          </div>

          {/* Transfer Settings Button */}
          <button
            onClick={() => { setTransferModalOpen(true); setTransferMsg(null); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-2 border-blue-200 text-blue-600 rounded-xl hover:bg-blue-50 transition-all"
          >
            <ArrowRightLeft size={15} />
            Transfer Settings
            {transferDestinations.length > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {transferDestinations.length}
              </span>
            )}
          </button>
        </div>

        <CampaignProgressWidgetShared
          type="call"
          statusUrl={`${API}/api/calls/campaign/status`}
          pauseUrl={`${API}/api/calls/campaign/pause`}
          resumeUrl={`${API}/api/calls/campaign/resume`}
          stopUrl={`${API}/api/calls/campaign/stop`}
          onComplete={() => fetchHistory(historyPage)}
        />

        {/* Tabs */}
        <div className="flex gap-0 mb-6 border-b-2 border-gray-200">
          <button
            onClick={() => setTab('contacts')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-0.5 transition-all ${
              tab === 'contacts'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={15} /> Contacts
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              tab === 'contacts' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
            }`}>{contacts.length}</span>
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-0.5 transition-all ${
              tab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <History size={15} /> Call History
            {historyTotal > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                tab === 'history' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
              }`}>{historyTotal}</span>
            )}
          </button>
        </div>

        {/* ── CONTACTS TAB ── */}
        {tab === 'contacts' && (
          <div>
            {/* Toolbar */}
            <div className="flex flex-wrap gap-3 items-center mb-4">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search name, phone, company…"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>

              {/* Type filter */}
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400 cursor-pointer font-medium text-gray-600"
              >
                <option value="all">All Types</option>
                <option value="lead">Leads</option>
                <option value="company">Companies</option>
                <option value="whatsapp_lead">WA Leads</option>
              </select>

              {/* Refresh */}
              <button
                onClick={fetchContacts}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 border-2 border-gray-200 rounded-xl bg-white hover:border-gray-300 hover:bg-gray-50 transition-all"
              >
                <RefreshCw size={14} className={contactsLoading ? 'animate-spin text-blue-500' : ''} />
                Refresh
              </button>

              {/* Bulk call button */}
              {selected.size > 0 && (
                <button
                  onClick={startCampaign}
                  className="flex items-center gap-2 bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors shadow-md shadow-blue-200"
                >
                  <PhoneCall size={15} />
                  Call {selected.size} Contact{selected.size > 1 ? 's' : ''}
                </button>
              )}

              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-600 underline">
                  Clear
                </button>
              )}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.size === filteredContacts.length && filteredContacts.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded accent-blue-600"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Call</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Owner</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {contactsLoading && (
                    <tr>
                      <td colSpan={8} className="text-center py-16">
                        <RefreshCw size={24} className="mx-auto text-gray-300 animate-spin mb-2" />
                        <p className="text-sm text-gray-400">Loading contacts…</p>
                      </td>
                    </tr>
                  )}
                  {!contactsLoading && filteredContacts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-16">
                        <Users size={36} className="mx-auto text-gray-200 mb-3" />
                        <p className="text-sm text-gray-400 font-medium">No contacts found</p>
                        <p className="text-xs text-gray-300 mt-1">Contacts appear here after receiving a WhatsApp message with Contacts appear here after they click Book a Demo or Demo Video in WhatsApp.</p>
                      </td>
                    </tr>
                  )}
                  {filteredContacts.map((c, i) => (
                    <tr key={i} className={`hover:bg-blue-50/30 dark:hover:bg-gray-800/40 transition-colors ${selected.has(c.phone) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(c.phone)}
                          onChange={() => toggleSelect(c.phone)}
                          className="rounded accent-blue-600"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-white flex items-center justify-center text-xs font-bold shadow-sm flex-shrink-0">
                            {initials(c.name)}
                          </div>
                          <span className="font-medium text-gray-800 dark:text-gray-100">{c.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400 font-mono text-xs">{c.phone}</td>
                      <td className="px-4 py-3.5"><TypeBadge type={c.contactType} /></td>
                      <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400 text-sm">{c.company || '—'}</td>
                      <td className="px-4 py-3.5">
                        {c.lastCall ? (
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={c.lastCall.status} />
                            <span className="text-xs text-gray-400">{fmtDate(c.lastCall.date)}</span>
                            {c.lastCall.duration > 0 && (
                              <span className="text-xs text-gray-300">{fmtDuration(c.lastCall.duration)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">Never called</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-400 text-xs">{c.owner || '—'}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => callSingle(c)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium border border-blue-200 text-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
                          >
                            <Phone size={11} /> Call
                          </button>
                          {c.lastCall && (c.lastCall.transcript || c.lastCall.recordingUrl) && (
                            <button
                              onClick={() => setTranscriptRecord({
                                name: c.name, phone: c.phone,
                                transcript: c.lastCall.transcript,
                                recording_url: c.lastCall.recordingUrl,
                                summary: c.lastCall.summary,
                                duration: c.lastCall.duration,
                                cost: c.lastCall.cost,
                                ended_reason: c.lastCall.endedReason,
                              })}
                              className="inline-flex items-center gap-1 text-xs border border-violet-200 text-violet-600 rounded-lg px-2 py-1.5 hover:bg-violet-600 hover:text-white hover:border-violet-600 transition-all"
                              title="View transcript & recording"
                            >
                              <Mic size={11} />
                            </button>
                          )}
                          {c.lastCall?.recordingUrl && (
                            <a
                              href={c.lastCall.recordingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs border border-green-200 text-green-600 rounded-lg px-2 py-1.5 hover:bg-green-600 hover:text-white hover:border-green-600 transition-all"
                              title="Play recording"
                            >
                              <PlayCircle size={11} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2 pl-1">{filteredContacts.length} contacts eligible for calling</p>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div>
            {/* Toolbar */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4 shadow-sm">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search name or phone…"
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div className="relative">
                  <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select
                    value={historyStatusFilter}
                    onChange={e => setHistoryStatusFilter(e.target.value)}
                    className="pl-8 pr-8 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="completed">Completed</option>
                    <option value="in-progress">In Progress</option>
                    <option value="no-answer">No Answer</option>
                    <option value="failed">Failed</option>
                    <option value="queued">Queued</option>
                    <option value="busy">Busy</option>
                  </select>
                </div>

                <button
                  onClick={() => fetchHistory(historyPage)}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration / Cost</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {historyLoading && (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <RefreshCw size={24} className="mx-auto text-gray-300 animate-spin mb-2" />
                        <p className="text-sm text-gray-400">Loading call history…</p>
                      </td>
                    </tr>
                  )}
                  {!historyLoading && filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <History size={36} className="mx-auto text-gray-200 mb-3" />
                        <p className="text-sm text-gray-400 font-medium">No call records found</p>
                        <p className="text-xs text-gray-300 mt-1">Call records will appear here after calls are made</p>
                      </td>
                    </tr>
                  )}
                  {filteredHistory.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center text-xs font-bold shadow-sm flex-shrink-0">
                            {initials(r.contact_name)}
                          </div>
                          <span className="font-medium text-gray-800 dark:text-gray-100">{r.contact_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-500">{r.phone_number || '—'}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={r.status} />
                          {r.ended_reason && (
                            <span className="text-xs text-gray-400 truncate max-w-[120px]">{r.ended_reason}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        <div className="font-medium text-gray-700 dark:text-gray-300">{fmtDuration(r.duration)}</div>
                        {r.cost != null && <div className="text-gray-400 mt-0.5">${Number(r.cost).toFixed(4)}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3.5"><TypeBadge type={r.contact_type} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setTranscriptRecord(r)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg px-2.5 py-1.5 hover:bg-gray-800 hover:text-white hover:border-gray-800 transition-all"
                            title="View transcript"
                          >
                            <Mic size={11} /> Transcript
                          </button>
                          {r.recording_url && (
                            <a
                              href={r.recording_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-medium border border-green-200 text-green-600 rounded-lg px-2.5 py-1.5 hover:bg-green-600 hover:text-white hover:border-green-600 transition-all"
                            >
                              <PlayCircle size={11} /> Audio
                            </a>
                          )}
                          {r.vapi_call_id && (
                            <button
                              onClick={() => syncCall(r.vapi_call_id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all"
                              title="Sync from VAPI"
                            >
                              <RefreshCw size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 px-1">
              <span className="text-xs text-gray-400">{historyTotal} total records</span>
              <div className="flex gap-1 items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-1 shadow-sm">
                <button
                  onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                  disabled={historyPage === 0}
                  className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-3 text-xs font-medium text-gray-600 dark:text-gray-300">
                  {historyPage + 1} / {Math.max(1, Math.ceil(historyTotal / HISTORY_LIMIT))}
                </span>
                <button
                  onClick={() => setHistoryPage(p => p + 1)}
                  disabled={(historyPage + 1) * HISTORY_LIMIT >= historyTotal}
                  className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {transcriptRecord && (
          <TranscriptModal record={transcriptRecord} onClose={() => setTranscriptRecord(null)} />
        )}

        {/* ── TRANSFER SETTINGS MODAL ── */}
        {transferModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-100">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow">
                    <ArrowRightLeft size={16} className="text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-800">Transfer Settings</h2>
                    <p className="text-xs text-gray-400">AI will auto-transfer when contact says "interested"</p>
                  </div>
                </div>
                <button onClick={() => setTransferModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* How it works info */}
              <div className="mx-6 mt-4 p-3.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700 leading-relaxed">
                <p className="font-semibold mb-1 flex items-center gap-1.5"><Zap size={11} /> How it works</p>
                When a contact says <strong>"I'm interested"</strong>, <strong>"connect me to someone"</strong>, or similar phrases — the AI will <strong>immediately transfer the live call</strong> to one of the numbers below. Your phone will ring and you continue the conversation personally.
              </div>

              {/* Destinations list */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Team Members</p>

                {transferDestinations.length === 0 && (
                  <div className="text-center py-6 text-sm text-gray-400">
                    <Settings size={28} className="mx-auto mb-2 opacity-30" />
                    No team numbers added yet
                  </div>
                )}

                {transferDestinations.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-100 bg-gray-50 hover:border-gray-200 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow flex-shrink-0">
                      {(d.name || d.number).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{d.name || 'Unnamed'}</p>
                      <p className="text-xs text-gray-500 font-mono">{d.number}{d.role ? ` · ${d.role}` : ''}</p>
                    </div>
                    <button onClick={() => removeDestination(i)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {/* Add new */}
                <div className="mt-4 p-3.5 rounded-xl border-2 border-dashed border-gray-200 space-y-2.5">
                  <p className="text-xs font-semibold text-gray-400">Add Team Member</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Phone +91..."
                      value={newDest.number}
                      onChange={e => setNewDest(p => ({ ...p, number: e.target.value }))}
                      className="col-span-2 px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 transition-colors font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Name"
                      value={newDest.name}
                      onChange={e => setNewDest(p => ({ ...p, name: e.target.value }))}
                      className="px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Role (e.g. Sales)"
                      value={newDest.role}
                      onChange={e => setNewDest(p => ({ ...p, role: e.target.value }))}
                      className="px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
                    />
                  </div>
                  <button
                    onClick={addDestination}
                    disabled={!newDest.number.trim()}
                    className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus size={15} /> Add to list
                  </button>
                </div>
              </div>

              {/* Status message */}
              {transferMsg && (
                <div className={`mx-6 mb-2 p-3 rounded-xl text-sm flex items-center gap-2 ${
                  transferMsg.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {transferMsg.type === 'success'
                    ? <CheckSquare size={14} />
                    : <AlertCircle size={14} />}
                  {transferMsg.text}
                </div>
              )}

              {/* Footer actions */}
              <div className="px-6 py-4 border-t border-gray-100 flex gap-2.5">
                <button
                  onClick={saveTransfer}
                  disabled={transferSaving}
                  className="flex-1 py-2.5 text-sm font-semibold border-2 border-gray-200 text-gray-700 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50"
                >
                  {transferSaving ? 'Saving…' : 'Save Numbers'}
                </button>
                <button
                  onClick={applyToVapi}
                  disabled={transferApplying || transferDestinations.length === 0}
                  className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md shadow-blue-200"
                >
                  {transferApplying ? 'Applying…' : '✓ Apply to VAPI'}
                </button>
              </div>
              <div className="px-6 pb-4">
                <button
                  onClick={removeFromVapi}
                  disabled={transferApplying}
                  className="w-full py-2 text-xs font-medium text-gray-400 hover:text-red-500 transition-colors"
                >
                  Remove transfer tool from VAPI assistant
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}