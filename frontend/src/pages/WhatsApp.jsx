import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2, X, RefreshCw, CheckCheck } from 'lucide-react';
import CampaignProgressWidget from '../components/CampaignProgressWidget';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;

const WHATSAPP_TEMPLATES = [
  { value: 'workflow',          label: 'Workflow - AI Recruitment (Approved: workflow)' },
  { value: 'workflow_ai',       label: 'WorkflowAI - Recruitment Automation' },
  { value: 'bench_to_billing',  label: 'B2B - Bench to Billing' },
  { value: 'voice_agent',       label: 'TalkSphere AI - Voice Agent' },
  { value: 'face_recognition',  label: 'VisionixAI - Face Recognition' },
  { value: 'english_tutor_ai',  label: 'BuddyAI - AI English Tutor' },
  { value: 'exit_interview_ai', label: 'ExitConnect - Exit Interview' },
  { value: 'election_survey',   label: 'PeopleConnect - Election Survey' },
  { value: 'outreach_ai',       label: 'LyntroAI - Outreach Bot' },
  { value: 'ai_sales_agent',    label: 'AI Sales Agent' },
];

const EMPTY_LIST = [];

const WhatsApp = () => {
  const queryClient = useQueryClient();
  const leadsQuery = useQuery({
    queryKey: ['whatsapp-leads'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/ingestion/whatsapp'));
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to load WhatsApp leads.');
      if (!Array.isArray(data)) throw new Error('The WhatsApp leads API returned an invalid response.');
      return data;
    },
  });
  const leads = leadsQuery.data || EMPTY_LIST;
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState('notsent'); // 'notsent' | 'sent'
  const whatsappFilterConfig = useMemo(() => ({
    facets: [
      {
        key: 'type',
        label: 'Type',
        field: (lead) => lead.isCompanyContact || lead.type === 'Company' ? 'Company' : 'Lead',
        options: [{ value: 'Lead', label: 'Lead' }, { value: 'Company', label: 'Company' }],
      },
      { key: 'addedBy', label: 'Added by', field: 'createdByName' },
      { key: 'source', label: 'Source', field: 'source' },
      {
        key: 'replied',
        label: 'Replied',
        field: (lead) => lead.hasWhatsAppReply ? 'replied' : 'not replied',
        options: [
          { value: 'replied', label: 'Replied' },
          { value: 'not replied', label: 'Not replied' },
        ],
      },
      {
        key: 'status',
        label: 'Status',
        field: (lead) => {
          if (lead.whatsappStatus === 'sent' || lead.status === 'sent') return 'sent';
          if (lead.whatsappStatus === 'failed' || lead.status === 'failed') return 'failed';
          return 'not sent';
        },
        options: activeTab === 'sent'
          ? [{ value: 'sent', label: 'Sent' }]
          : [{ value: 'failed', label: 'Failed' }, { value: 'not sent', label: 'Not sent' }],
      },
      ...(activeTab === 'sent'
        ? [{
          key: 'read',
          label: 'Read status',
          field: (lead) => lead.read ? 'read' : 'unread',
          options: [{ value: 'read', label: 'Read' }, { value: 'unread', label: 'Unread' }],
        }]
        : []),
    ],
  }), [activeTab]);
  const whatsappFilters = useTableFilters(leads, whatsappFilterConfig);

  // Campaign Modal & State
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('workflow');
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignMessage, setCampaignMessage] = useState('');
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [chatLead, setChatLead] = useState(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatMessagesRef = useRef(null);

  const getPhone = (lead) => String(lead?.whatsappNumber || lead?.phoneNumber || lead?.phone || '').trim();
  const hasPhone = (lead) => Boolean(getPhone(lead));
  const chatPhone = getPhone(chatLead);
  const conversationQuery = useQuery({
    queryKey: ['whatsapp-conversation', chatPhone],
    enabled: Boolean(chatPhone),
    queryFn: async () => {
      const response = await fetch(apiUrl(`/api/whatsapp/conversation/${encodeURIComponent(chatPhone)}`));
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to load conversation.');
      if (!Array.isArray(data)) throw new Error('The conversation API returned an invalid response.');
      return data;
    },
    refetchInterval: chatPhone ? 4000 : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const messages = chatMessagesRef.current;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, [conversationQuery.data]);

  const sendChatMessage = async (event) => {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!chatPhone || !message || chatSending) return;

    setChatSending(true);
    setChatError('');
    try {
      const response = await fetch(apiUrl(`/api/whatsapp/conversation/${encodeURIComponent(chatPhone)}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'WhatsApp could not send this message.');
      setChatDraft('');
      await Promise.all([
        conversationQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] }),
      ]);
    } catch (error) {
      setChatError(error.message || 'WhatsApp could not send this message.');
    } finally {
      setChatSending(false);
    }
  };

  const dashboardData = useMemo(() => {
    const sentList = leads.filter((lead) => lead.status === 'sent' || lead.whatsappStatus === 'sent');
    const readList = sentList.filter((lead) => Boolean(lead.read));
    return {
      totalLeads: leads.length,
      whatsappSent: sentList.length,
      readCount: readList.length,
      unreadCount: Math.max(0, sentList.length - readList.length),
    };
  }, [leads]);
  const refreshing = leadsQuery.isFetching;
  const fetchDashboardData = () => leadsQuery.refetch();

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
        await queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] });
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete lead.');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('An error occurred while deleting the lead.');
    }
  };

  const filteredLeads = whatsappFilters.filteredItems.filter((lead) => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) return true;

    const isSent = lead.whatsappStatus === "sent" || lead.status === "sent";
    const isFailed = lead.whatsappStatus === "failed" || lead.status === "failed";
    const notSentReason = isFailed ? (lead.failureReason || "Message undeliverable") : (!isSent ? "Not Sent" : "");
    const isRead = Boolean(lead.read);

    return [
      lead.name,
      lead.phone,
      lead.phoneNumber,
      lead.whatsappNumber,
      isSent ? "sent" : "",
      notSentReason,
      lead.failureReason,
      isRead ? "read" : "unread",
    ]
      .filter(Boolean)
      .some((value) =>
        value.toString().toLowerCase().includes(search)
      );
  });

  const isSentLead = (lead) => lead.whatsappStatus === 'sent' || lead.status === 'sent';

  // One table, filtered by the selected tab.
  const tabLeads = filteredLeads.filter((lead) =>
    activeTab === 'sent' ? isSentLead(lead) : !isSentLead(lead)
  );
  const tablePagination = useTablePagination(tabLeads);

  const TABS = [
    { key: 'notsent', label: 'Not Sent' }, // change label text here
    { key: 'sent', label: 'Sent' },
  ];

  const emptyMessages = {
    notsent: 'No unsent messages found.',
    sent: 'No sent messages found.',
  };

  const renderLeadsTable = (tableLeads, tableType) => (
    <div className="wa-table-container" style={{ minWidth: 0 }}>
      <div className="wa-table-scroll">
        <table className="wa-table">
          <thead>
            <tr>
              <th className="wa-text-center" style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  aria-label="Select all contacts"
                  checked={tableLeads.filter(hasPhone).length > 0 && tableLeads.filter(hasPhone).every((lead) => selectedContacts.has(getPhone(lead)))}
                  onChange={() => {
                    const eligible = tableLeads.filter(hasPhone);
                    const allSelected = eligible.length > 0 && eligible.every((lead) => selectedContacts.has(getPhone(lead)));
                    setSelectedContacts((prev) => {
                      const next = new Set(prev);
                      eligible.forEach((lead) => {
                        if (allSelected) next.delete(getPhone(lead));
                        else next.add(getPhone(lead));
                      });
                      return next;
                    });
                  }}
                />
              </th>
              <th>Name</th>
              <th>Type</th>
              <th>Assigned User</th>
              <th>Phone Number</th>
              <th className="wa-text-center">Sent Status</th>
              <th className="wa-text-center">Conversation</th>
              {tableType === 'sent' && <th className="wa-text-center">Read</th>}
              <th className="wa-text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableLeads.length > 0 ? tablePagination.pageItems.map((lead) => {
              const phone = getPhone(lead);
              const isSent = lead.whatsappStatus === 'sent' || lead.status === 'sent';
              const isCompany = lead.isCompanyContact || lead.type === 'Company';
              const isChecked = Boolean(phone && selectedContacts.has(phone));

              return (
                <tr key={lead.id || phone || lead.email || lead.name} className={lead.read ? 'wa-table-row-success' : 'wa-table-row-default'}>
                  <td className="wa-text-center">
                    <input
                      type="checkbox"
                      aria-label={`Select ${lead.name || 'contact'}`}
                      checked={isChecked}
                      disabled={!phone}
                      onChange={() => toggleContact(lead)}
                    />
                  </td>
                  <td className="wa-text-primary" style={{ fontWeight: 600 }}>{lead.name || '-'}</td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                      fontSize: '0.72rem', fontWeight: 700,
                      backgroundColor: isCompany ? '#d1fae5' : '#dbeafe',
                      color: isCompany ? '#065f46' : '#1e40af'
                    }}>{isCompany ? 'Company' : 'Lead'}</span>
                  </td>
                  <td className="wa-text-secondary">{lead.createdByName || '-'}</td>
                  <td className="wa-text-secondary">{phone || '-'}</td>
                  <td className="wa-text-center">
                    {isSent ? <span className="wa-badge wa-badge-blue">Sent</span> : <span className="wa-badge wa-badge-gray">Not Sent</span>}
                  </td>
                  <td className="wa-text-center">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setChatLead(lead);
                        setChatDraft('');
                        setChatError('');
                      }}
                      disabled={!phone}
                      style={{
                        padding: '0.3rem 0.7rem',
                        fontSize: '0.8rem',
                        ...(lead.hasWhatsAppReply
                          ? { backgroundColor: '#16a34a', borderColor: '#16a34a', color: '#fff' }
                          : {}),
                      }}
                    >
                      View
                    </button>
                  </td>
                  {tableType === 'sent' && (
                    <td className="wa-text-center">
                      {lead.read ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', verticalAlign: 'middle' }} title="Read"><CheckCheck size={20} strokeWidth={2.5} /></span> : <span style={{ color: '#9ca3af' }}>-</span>}
                    </td>
                  )}
                  <td className="wa-text-right">
                    <button onClick={() => deleteLead(lead)} className="wa-btn-danger">Delete</button>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={tableType === 'sent' ? 9 : 8} className="wa-text-center wa-text-secondary" style={{ padding: '3rem 1.5rem' }}>
                {emptyMessages[tableType]}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <TablePagination {...tablePagination} />
    </div>
  );

  const eligibleContacts = leads.filter(hasPhone);

  const toggleContact = (lead) => {
    const phone = getPhone(lead);
    if (!phone) return;
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else {
        next.add(phone);
      }
      return next;
    });
  };

  const toggleSelectAllTable = () => {
    const eligibleFiltered = filteredLeads.filter(hasPhone);
    const allSelected = eligibleFiltered.length > 0 && eligibleFiltered.every((lead) => selectedContacts.has(getPhone(lead)));
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        eligibleFiltered.forEach((lead) => next.delete(getPhone(lead)));
      } else {
        eligibleFiltered.forEach((lead) => next.add(getPhone(lead)));
      }
      return next;
    });
  };

  const toggleSelectAllModal = () => {
    const allSelected = eligibleContacts.length > 0 && eligibleContacts.every((c) => selectedContacts.has(getPhone(c)));
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        eligibleContacts.forEach((c) => next.delete(getPhone(c)));
      } else {
        eligibleContacts.forEach((c) => next.add(getPhone(c)));
      }
      return next;
    });
  };

  const sendCampaign = async () => {
    if (selectedContacts.size === 0) {
      setCampaignMessage('Please select at least one contact.');
      return;
    }
    setCampaignRunning(true);
    setCampaignMessage('');
    try {
      const phones = [...selectedContacts];
      const selectedCompanies = eligibleContacts.filter(
        (c) => (c.isCompanyContact || c.type === 'Company') && selectedContacts.has(getPhone(c))
      );
      const companyIds = selectedCompanies
        .map((c) => c.originalId || Number(String(c.id).replace('company-', '')))
        .filter((n) => Number.isInteger(n) && n > 0);

      const response = await fetch(apiUrl('/api/whatsapp/send-campaign'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateProduct: selectedTemplate,
          selectedPhones: phones,
          selectedCompanyIds: companyIds.length > 0 ? companyIds : undefined
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start campaign.');
      setCampaignMessage(data.message || 'WhatsApp campaign started successfully!');
      window.dispatchEvent(new CustomEvent('campaign-started', { detail: { type: 'whatsapp' } }));
      setTimeout(() => {
        setCampaignModalOpen(false);
        setCampaignMessage('');
      }, 1000);
      fetchDashboardData();
    } catch (err) {
      setCampaignMessage(err.message || 'Failed to send campaign.');
    } finally {
      setCampaignRunning(false);
    }
  };

  const modalContacts = eligibleContacts.filter((contact) => {
    if (!modalSearchTerm.trim()) return true;
    const term = modalSearchTerm.trim().toLowerCase();
    const phone = getPhone(contact).toLowerCase();
    const name = String(contact.name || '').toLowerCase();
    const type = contact.isCompanyContact ? 'company' : 'lead';
    return name.includes(term) || phone.includes(term) || type.includes(term);
  });

  return (
    <div className="wa-dashboard">
      {/* TOP HEADER */}
      <header className="wa-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className="wa-header-title">
          WhatsApp Overview
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={fetchDashboardData}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
            title="Refresh WhatsApp data"
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            onClick={() => {
              setCampaignModalOpen(true);
              setCampaignMessage('');
            }}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
          >
            <Send size={16} />
            Send Campaign {selectedContacts.size > 0 && `(${selectedContacts.size})`}
          </button>
        </div>
      </header>
      {leadsQuery.error && (
        <div role="alert" style={{ color: '#b91c1c', marginBottom: '1rem' }}>
          {leadsQuery.error.message}
        </div>
      )}

      {/* TABS */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0 2rem',
          marginTop: '1rem',
          borderBottom: '1px solid var(--border-color, #e5e7eb)'
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              onClick={() => {
                whatsappFilters.clearFilters();
                setActiveTab(tab.key);
              }}
              style={{
                padding: '0.75rem 0.5rem',
                marginRight: '0.75rem',
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--primary, #3b5bff)' : '2px solid transparent',
                marginBottom: '-1px',
                color: active ? 'var(--primary, #3b5bff)' : 'var(--text-muted, #64748b)',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SEARCH AND SELECTION BAR */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1rem",
        padding: "0 2rem",
        marginTop: "1.5rem",
        marginBottom: "1rem"
      }}>
        <div>
          {selectedContacts.size > 0 ? (
            <span style={{ fontSize: '0.875rem', color: 'var(--primary, #3b5bff)', fontWeight: 600 }}>
              ✓ {selectedContacts.size} contact{selectedContacts.size === 1 ? '' : 's'} selected
            </span>
          ) : (
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
              Select contacts from table or click &ldquo;Send Campaign&rdquo; to launch
            </span>
          )}
        </div>
        <input
          type="text"
          placeholder="Search WhatsApp leads..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "300px",
            maxWidth: "100%",
            padding: "8px 12px",
            border: "1px solid var(--border-color, #d1d5db)",
            borderRadius: "8px",
            fontSize: "14px",
            backgroundColor: "var(--bg-card, #ffffff)",
            color: "var(--text-dark, inherit)"
          }}
        />
      </div>
      <div style={{ padding: '0 2rem' }}>
        <TableFilters
          {...whatsappFilters}
          showSearch={false}
          hasFilters={whatsappFilters.hasFilters || Boolean(searchTerm)}
          clearFilters={() => {
            whatsappFilters.clearFilters();
            setSearchTerm('');
          }}
        />
      </div>

      <div className="wa-container" style={{ paddingTop: 0 }}>
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

          {/* Messages Read Card */}
          <div className="wa-card wa-card-green">
            <p className="wa-card-label wa-card-label-green">Messages Read</p>
            <h2 className="wa-card-value wa-card-value-green">{dashboardData.readCount}</h2>
          </div>

          {/* Unread / Pending Card */}
          <div className="wa-card wa-card-purple">
            <p className="wa-card-label wa-card-label-purple">Unread / Pending</p>
            <h2 className="wa-card-value wa-card-value-purple">{dashboardData.unreadCount}</h2>
          </div>
        </div>

        {/* TABLE FOR THE ACTIVE TAB */}
        <div style={{ marginBottom: '2rem' }}>
          {renderLeadsTable(tabLeads, activeTab)}
        </div>
      </div>

      {/* CAMPAIGN MODAL */}
      {campaignModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem',
        }}>
          <div style={{
            background: 'var(--bg-card, #ffffff)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid var(--border-color, #e5e7eb)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-color, #e5e7eb)'
            }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📱</span> Send WhatsApp Campaign
              </h2>
              <button
                onClick={() => {
                  setCampaignModalOpen(false);
                  setCampaignMessage('');
                }}
                style={{
                  color: 'var(--text-muted, #64748b)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {/* 1. Select Template */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  marginBottom: '0.5rem',
                  color: 'var(--text-dark, #1f2937)'
                }}>
                  1. Select Template
                </label>
                <select
                  className="form-control"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px' }}
                >
                  {WHATSAPP_TEMPLATES.map((tmpl) => (
                    <option key={tmpl.value} value={tmpl.value}>
                      {tmpl.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Select Contacts */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem'
                }}>
                  <label style={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: 'var(--text-dark, #1f2937)'
                  }}>
                    2. Select Contacts (with phone numbers)
                  </label>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--bg-page, #f8fafc)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderBottom: 'none',
                  borderTopLeftRadius: '8px',
                  borderTopRightRadius: '8px'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}>
                    <input
                      type="checkbox"
                      checked={eligibleContacts.length > 0 && eligibleContacts.every((c) => selectedContacts.has(getPhone(c)))}
                      onChange={toggleSelectAllModal}
                    />
                    Select All ({eligibleContacts.length})
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                    {selectedContacts.size} of {eligibleContacts.length} selected
                  </span>
                </div>

                {/* Contacts list */}
                <div style={{
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderBottomLeftRadius: '8px',
                  borderBottomRightRadius: '8px',
                  maxHeight: '220px',
                  overflowY: 'auto'
                }}>
                  {eligibleContacts.length > 0 ? (
                    eligibleContacts.map((contact) => {
                      const phone = getPhone(contact);
                      const isChecked = selectedContacts.has(phone);
                      const isCompany = contact.isCompanyContact || contact.type === 'Company';

                      return (
                        <div
                          key={contact.id || phone}
                          onClick={() => toggleContact(contact)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.625rem 0.75rem',
                            borderBottom: '1px solid var(--border-color, #f1f5f9)',
                            cursor: 'pointer',
                            backgroundColor: isChecked ? 'rgba(59, 91, 255, 0.05)' : 'transparent',
                            transition: 'background-color 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by row click
                              style={{ cursor: 'pointer' }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <span style={{
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                color: 'var(--text-dark, #1e293b)',
                                display: 'block',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap'
                              }}>
                                {contact.name || 'Unnamed Contact'}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                            <span style={{
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              color: 'var(--text-muted, #64748b)'
                            }}>
                              {phone}
                            </span>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              backgroundColor: isCompany ? '#d1fae5' : '#dbeafe',
                              color: isCompany ? '#065f46' : '#1e40af'
                            }}>
                              {isCompany ? 'Company' : 'Lead'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: '0.875rem' }}>
                      No contacts with phone numbers found.
                    </div>
                  )}
                </div>
              </div>

              {/* Message */}
              {campaignMessage && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  backgroundColor: campaignMessage.toLowerCase().includes('error') || campaignMessage.toLowerCase().includes('failed') || campaignMessage.toLowerCase().includes('please')
                    ? '#fee2e2'
                    : '#dcfce7',
                  color: campaignMessage.toLowerCase().includes('error') || campaignMessage.toLowerCase().includes('failed') || campaignMessage.toLowerCase().includes('please')
                    ? '#b91c1c'
                    : '#15803d'
                }}>
                  {campaignMessage}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border-color, #e5e7eb)',
              backgroundColor: 'var(--bg-page, #f8fafc)'
            }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted, #64748b)', fontWeight: 500 }}>
                {selectedContacts.size} contact{selectedContacts.size === 1 ? '' : 's'} selected
              </span>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCampaignModalOpen(false);
                    setCampaignMessage('');
                  }}
                  disabled={campaignRunning}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={sendCampaign}
                  disabled={campaignRunning || selectedContacts.size === 0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {campaignRunning ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Sending Campaign...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Send Campaign
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {chatLead && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !chatSending) setChatLead(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '1rem',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`WhatsApp conversation with ${chatLead.name || chatPhone}`}
            style={{
              background: '#f0f2f5',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '620px',
              height: 'min(720px, 90vh)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <header style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              background: '#fff',
              borderBottom: '1px solid #e5e7eb',
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', color: '#1f2937' }}>{chatLead.name || 'WhatsApp contact'}</h2>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{chatPhone}</span>
              </div>
              <button
                type="button"
                onClick={() => setChatLead(null)}
                disabled={chatSending}
                aria-label="Close conversation"
                style={{ background: 'transparent', border: 0, cursor: 'pointer', color: '#64748b', padding: '0.3rem' }}
              >
                <X size={20} />
              </button>
            </header>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }} ref={chatMessagesRef}>
              {conversationQuery.isLoading ? (
                <div style={{ margin: 'auto', color: '#64748b' }}>Loading conversation...</div>
              ) : conversationQuery.error ? (
                <div role="alert" style={{ margin: 'auto', color: '#b91c1c' }}>{conversationQuery.error.message}</div>
              ) : (conversationQuery.data || EMPTY_LIST).length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b' }}>
                  No saved messages yet. New incoming and outgoing messages will appear here.
                </div>
              ) : (conversationQuery.data || EMPTY_LIST).map((item) => {
                if (item.kind === 'button') {
                  return (
                    <div key={item.id} style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.78rem', padding: '0.2rem' }}>
                      {item.name} clicked · {new Date(item.timestamp).toLocaleString()}
                    </div>
                  );
                }
                const isOutbound = item.direction === 'outbound';
                return (
                  <div
                    key={item.id}
                    style={{
                      alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                      padding: '0.65rem 0.8rem',
                      borderRadius: '10px',
                      background: isOutbound ? '#d9fdd3' : '#fff',
                      color: '#1f2937',
                      boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    <div>{item.text || '[message]'}</div>
                    {item.interactive?.type === 'cta_url' && item.interactive.url && (
                      <a
                        href={item.interactive.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'block',
                          marginTop: '0.55rem',
                          padding: '0.55rem 0.8rem',
                          borderRadius: '8px',
                          background: '#16a34a',
                          color: '#fff',
                          textAlign: 'center',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        {item.interactive.displayText || 'Open link'}
                      </a>
                    )}
                    <time style={{ display: 'block', marginTop: '0.25rem', color: '#64748b', fontSize: '0.68rem', textAlign: 'right' }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </time>
                  </div>
                );
              })}
            </div>

            <div style={{ background: '#fff', borderTop: '1px solid #e5e7eb', padding: '0.75rem 1rem' }}>
              <p style={{ margin: '0 0 0.5rem', color: '#64748b', fontSize: '0.72rem' }}>
                Free-form WhatsApp messages may only be sent during the customer-service window. Meta may require an approved template outside that window.
              </p>
              {chatError && <div role="alert" style={{ color: '#b91c1c', fontSize: '0.82rem', marginBottom: '0.5rem' }}>{chatError}</div>}
              <form onSubmit={sendChatMessage} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                <textarea
                  aria-label="Write a WhatsApp message"
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  maxLength={4096}
                  rows={2}
                  placeholder="Type a message..."
                  style={{
                    flex: 1,
                    resize: 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: '20px',
                    padding: '0.65rem 0.9rem',
                    font: 'inherit',
                    outlineColor: '#22c55e',
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={chatSending || !chatDraft.trim()}
                  aria-label="Send WhatsApp message"
                  style={{ minWidth: '44px', height: '44px', borderRadius: '50%', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {chatSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
                </button>
              </form>
            </div>
          </section>
        </div>
      )}

      {/* BOTTOM-LEFT CAMPAIGN PROGRESS WIDGET */}
      <CampaignProgressWidget
        type="whatsapp"
        statusUrl={apiUrl('/api/whatsapp/send-campaign/status')}
        onComplete={fetchDashboardData}
      />
    </div>
  );
};

export default WhatsApp;