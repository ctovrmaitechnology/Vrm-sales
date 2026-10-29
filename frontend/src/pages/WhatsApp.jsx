import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2, X, RefreshCw, CheckCheck, Eye } from 'lucide-react';
import CampaignProgressWidget from '../components/CampaignProgressWidget';
import TablePagination from '../components/TablePagination';
import TableFilters from '../components/TableFilters';
import useTableFilters from '../hooks/useTableFilters';
import useTablePagination from '../hooks/useTablePagination';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;

const WHATSAPP_TEMPLATES = [
  { value: 'workflow_ai', label: 'Workflow Final (workflow_final)', templateName: 'workflow_final' },
  { value: 'bench_to_billing', label: 'Bench to Billing Final (benchtodeploy_final)', templateName: 'benchtodeploy_final' },
];

const EMPTY_LIST = [];
const isAcceptedWhatsAppStatus = (status) => ['accepted', 'sent', 'delivered', 'read'].includes(status);
const getCurrentTemplateStatuses = (lead) =>
  (lead.whatsappTemplateStatuses || []).filter((item) =>
    WHATSAPP_TEMPLATES.some((template) => template.templateName === item.templateName)
  );
const formatFailureReason = (reason) => {
  const text = String(reason || '').trim();
  if (!text || /^message undeliverable\.?$/i.test(text)) return 'Message Undeliverable.';
  return /[.!?]$/.test(text) ? text : `${text}.`;
};
const getLeadFailureReason = (lead) => {
  const reasons = getCurrentTemplateStatuses(lead)
    .filter((item) => item.status === 'failed')
    .map((item) => formatFailureReason(item.failureReason));
  return reasons.length ? [...new Set(reasons)].join('; ') : lead.failureReason || '';
};
const hasSentWhatsAppTemplate = (lead) => {
  const statuses = getCurrentTemplateStatuses(lead);
  return statuses.length
    ? statuses.some((item) => isAcceptedWhatsAppStatus(item.status))
    : lead.whatsappStatus === 'sent' || lead.status === 'sent';
};
const hasFailedWhatsAppTemplate = (lead) => {
  const statuses = getCurrentTemplateStatuses(lead);
  return statuses.length
    ? statuses.some((item) => item.status === 'failed')
    : lead.whatsappStatus === 'failed' || lead.status === 'failed';
};
const hasUnsentWhatsAppTemplate = (lead) => {
  const statuses = getCurrentTemplateStatuses(lead);
  return statuses.length
    ? WHATSAPP_TEMPLATES.some((template) => {
      const status = statuses.find((item) => item.templateName === template.templateName)?.status;
      return !status || status === 'failed';
    })
    : !hasSentWhatsAppTemplate(lead);
};

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
    staleTime: 5000,
    refetchOnWindowFocus: true,
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
      { key: 'reason', label: 'Reason', field: getLeadFailureReason },
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
          if (hasSentWhatsAppTemplate(lead) && hasFailedWhatsAppTemplate(lead)) return 'partially failed';
          if (hasSentWhatsAppTemplate(lead)) return 'sent';
          if (hasFailedWhatsAppTemplate(lead)) return 'failed';
          return 'not sent';
        },
        options: activeTab === 'sent'
          ? [{ value: 'sent', label: 'Sent' }, { value: 'partially failed', label: 'Partially failed' }]
          : [{ value: 'failed', label: 'Failed' }, { value: 'partially failed', label: 'Partially failed' }, { value: 'not sent', label: 'Not sent' }],
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
  const [selectedTemplates, setSelectedTemplates] = useState(['workflow']);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignMessage, setCampaignMessage] = useState('');
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [chatLead, setChatLead] = useState(null);
  const [failureDetailLead, setFailureDetailLead] = useState(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatMessagesRef = useRef(null);
  const deliveryRefreshTimerRef = useRef(null);
  const validSelectedTemplates = WHATSAPP_TEMPLATES
    .map((template) => template.value)
    .filter((value) => selectedTemplates.includes(value));

  const getPhone = (lead) => String(lead?.whatsappNumber || lead?.phoneNumber || lead?.phone || '').trim();
  const hasPhone = (lead) => Boolean(getPhone(lead));
  const failureDetailPhone = getPhone(failureDetailLead);
  const failureDetailContact = failureDetailLead
    ? leads.find((lead) => failureDetailPhone && getPhone(lead) === failureDetailPhone) || failureDetailLead
    : null;
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
    const sentList = leads.filter(hasSentWhatsAppTemplate);
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
  const refreshAfterDeliveryUpdate = () => {
    if (deliveryRefreshTimerRef.current) clearTimeout(deliveryRefreshTimerRef.current);
    deliveryRefreshTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] });
    }, 350);
  };

  useEffect(() => () => {
    if (deliveryRefreshTimerRef.current) clearTimeout(deliveryRefreshTimerRef.current);
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

  const deleteSelectedLeads = async () => {
    const identifiers = [...selectedContacts];
    if (!identifiers.length) return;
    if (!window.confirm(`Are you sure you want to delete ${identifiers.length} selected contact${identifiers.length === 1 ? '' : 's'}?`)) return;

    const results = await Promise.allSettled(identifiers.map(async (identifier) => {
      const response = await fetch(apiUrl('/api/delete'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `Failed to delete ${identifier}.`);
      return identifier;
    }));

    const deletedIdentifiers = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    const failedCount = results.length - deletedIdentifiers.length;

    setSelectedContacts((current) => {
      const next = new Set(current);
      deletedIdentifiers.forEach((identifier) => next.delete(identifier));
      return next;
    });
    if (deletedIdentifiers.length) {
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] });
    }

    if (failedCount) {
      alert(`Deleted ${deletedIdentifiers.length} contact${deletedIdentifiers.length === 1 ? '' : 's'}. ${failedCount} could not be deleted. Please refresh and try again.`);
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

  const isSentLead = hasSentWhatsAppTemplate;

  // Mixed outcomes appear in both tabs so neither the successful nor failed template is hidden.
  const tabLeads = filteredLeads.filter((lead) =>
    activeTab === 'sent' ? isSentLead(lead) : hasUnsentWhatsAppTemplate(lead)
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
        <table className="wa-table wa-table-compact">
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: tableType === 'sent' ? '23%' : '27%' }} />
            <col style={{ width: tableType === 'sent' ? '8%' : '9%' }} />
            {tableType === 'sent' && <col style={{ width: '6%' }} />}
            <col style={{ width: tableType === 'sent' ? '9%' : '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="wa-text-center">
                <input
                  type="checkbox"
                  aria-label="Select all contacts on this page"
                  checked={tablePagination.pageItems.filter(hasPhone).length > 0 && tablePagination.pageItems.filter(hasPhone).every((lead) => selectedContacts.has(getPhone(lead)))}
                  onChange={() => {
                    const eligible = tablePagination.pageItems.filter(hasPhone);
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
              <th>Template delivery status</th>
              <th className="wa-text-center">Conversation</th>
              {tableType === 'sent' && <th className="wa-text-center">Read</th>}
              <th className="wa-text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tablePagination.pageItems.length > 0 ? tablePagination.pageItems.map((lead) => {
              const phone = getPhone(lead);
              const isSent = hasSentWhatsAppTemplate(lead);
              const isCompany = lead.isCompanyContact || lead.type === 'Company';
              const isChecked = Boolean(phone && selectedContacts.has(phone));
              const templateStatuses = getCurrentTemplateStatuses(lead);

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
                    {isSent && hasFailedWhatsAppTemplate(lead)
                      ? <span className="wa-badge wa-badge-red">Partially failed</span>
                      : hasFailedWhatsAppTemplate(lead)
                        ? <span className="wa-badge wa-badge-red">Failed</span>
                      : isSent
                        ? <span className="wa-badge wa-badge-blue">Sent</span>
                        : <span className="wa-badge wa-badge-gray">Not Sent</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.55rem' }}>
                      {templateStatuses.length === 0 && isSent ? (
                        <span style={{ fontSize: '0.8rem', color: '#4b5563', whiteSpace: 'normal' }}>
                          Sent — template-specific status unavailable
                        </span>
                      ) : templateStatuses.length === 0 && hasFailedWhatsAppTemplate(lead) ? (
                        <span style={{ fontSize: '0.8rem', color: '#991b1b', whiteSpace: 'normal' }}>
                          Failed: {formatFailureReason(lead.failureReason)}
                        </span>
                      ) : WHATSAPP_TEMPLATES.map((template) => {
                        const message = templateStatuses.find((item) => item.templateName === template.templateName);
                        const status = message?.status || 'not_sent';
                        const isFailed = status === 'failed';
                        const isAccepted = isAcceptedWhatsAppStatus(status);
                        const statusLabel = isFailed
                          ? 'Failed'
                          : status === 'accepted'
                            ? 'Accepted'
                            : status === 'delivered'
                              ? 'Delivered'
                              : status === 'read'
                                ? 'Read'
                                : isAccepted
                                  ? 'Sent'
                                  : 'Not sent';
                        return (
                          <div key={template.templateName} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <span style={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: isFailed ? '#991b1b' : isAccepted ? '#166534' : '#4b5563',
                            }}>
                              {template.templateName}: {statusLabel}
                            </span>
                            {isFailed && (
                              <span style={{ fontSize: '0.78rem', color: '#991b1b', whiteSpace: 'normal' }}>
                                {formatFailureReason(message.failureReason)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
                  <td className="wa-text-right wa-table-actions">
                    <button
                      type="button"
                      onClick={() => setFailureDetailLead(lead)}
                      aria-label={`View delivery details for ${lead.name || phone || 'contact'}`}
                      title="View template delivery details"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.4rem',
                        marginRight: '0.35rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        background: 'transparent',
                        color: '#4b5563',
                        cursor: 'pointer',
                        verticalAlign: 'middle',
                      }}
                    >
                      <Eye size={16} />
                    </button>
                    <button onClick={() => deleteLead(lead)} className="wa-btn-danger">Delete</button>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={tableType === 'sent' ? 10 : 9} className="wa-text-center wa-text-secondary" style={{ padding: '3rem 1.5rem' }}>
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
    if (validSelectedTemplates.length === 0) {
      setCampaignMessage('Please select at least one template.');
      return;
    }
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
          templateProducts: validSelectedTemplates,
          selectedPhones: phones,
          selectedCompanyIds: companyIds.length > 0 ? companyIds : undefined
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start campaign.');
      setCampaignMessage(data.message || 'WhatsApp campaign started successfully!');
      setSelectedContacts(new Set());
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
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--primary, #3b5bff)', fontWeight: 600 }}>
                ✓ {selectedContacts.size} contact{selectedContacts.size === 1 ? '' : 's'} selected
              </span>
              <button
                type="button"
                onClick={deleteSelectedLeads}
                className="wa-btn-danger"
              >
                Delete selected
              </button>
            </div>
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

      {failureDetailContact && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFailureDetailLead(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-failure-title"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '1.5rem',
              borderRadius: '12px',
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-color, #e5e7eb)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <h2 id="whatsapp-failure-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                  WhatsApp delivery details
                </h2>
                <p style={{ margin: '0.4rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                  {failureDetailContact.name || 'Contact'}{getPhone(failureDetailContact) ? ` · ${getPhone(failureDetailContact)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFailureDetailLead(null)}
                aria-label="Close delivery details"
                style={{ border: 0, background: 'transparent', color: '#6b7280', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: '8px', background: '#f9fafb' }}>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280' }}>
                Template delivery status
              </p>
              {getCurrentTemplateStatuses(failureDetailContact).length > 0
                ? WHATSAPP_TEMPLATES.map((template) => {
                const message = getCurrentTemplateStatuses(failureDetailContact)
                  .find((item) => item.templateName === template.templateName);
                const status = message?.status || 'not_sent';
                const label = status === 'failed'
                  ? 'Failed'
                  : status === 'accepted'
                    ? 'Accepted by WhatsApp'
                  : status === 'delivered'
                    ? 'Delivered'
                    : status === 'read'
                      ? 'Read'
                      : isAcceptedWhatsAppStatus(status)
                        ? 'Sent'
                        : 'Not sent';
                return (
                  <div key={template.templateName} style={{ padding: '0.65rem 0', borderTop: '1px solid #e5e7eb' }}>
                    <p style={{ margin: 0, color: '#111827', fontWeight: 600, fontSize: '0.875rem' }}>
                      {template.templateName}: {label}
                    </p>
                    {status === 'failed' && (
                      <p role="status" style={{ margin: '0.3rem 0 0', color: '#991b1b', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                        {formatFailureReason(message.failureReason)}
                      </p>
                    )}
                  </div>
                );
              })
                : (
                <p role="status" style={{ margin: 0, color: '#111827', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  {failureDetailContact.failureReason
                    || 'No template-specific delivery details are available for this contact yet.'}
                </p>
                )}
            </div>
          </section>
        </div>
      )}

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
              {/* 1. Select Templates */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  marginBottom: '0.5rem',
                  color: 'var(--text-dark, #1f2937)'
                }}>
                  1. Select Templates
                </label>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="form-control"
                    aria-haspopup="listbox"
                    aria-expanded={templateDropdownOpen}
                    onClick={() => setTemplateDropdownOpen((open) => !open)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      textAlign: 'left',
                      background: '#fff',
                    }}
                  >
                    <span>
                      {validSelectedTemplates.length
                        ? `${validSelectedTemplates.length} template${validSelectedTemplates.length === 1 ? '' : 's'} selected`
                        : 'Select templates'}
                    </span>
                    <span aria-hidden="true">{templateDropdownOpen ? '▲' : '▼'}</span>
                  </button>
                  {templateDropdownOpen && (
                    <div
                      role="listbox"
                      aria-label="WhatsApp templates"
                      aria-multiselectable="true"
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        zIndex: 5,
                        maxHeight: '240px',
                        overflowY: 'auto',
                        padding: '0.35rem',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        borderRadius: '6px',
                        background: '#fff',
                        boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)',
                      }}
                    >
                      {WHATSAPP_TEMPLATES.map((tmpl) => {
                        const checked = validSelectedTemplates.includes(tmpl.value);
                        return (
                          <label
                            key={tmpl.value}
                            role="option"
                            aria-selected={checked}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.6rem',
                              padding: '0.55rem 0.5rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setSelectedTemplates((current) => (
                                checked
                                  ? WHATSAPP_TEMPLATES
                                    .map((template) => template.value)
                                    .filter((value) => current.includes(value) && value !== tmpl.value)
                                  : [...validSelectedTemplates, tmpl.value]
                              ))}
                            />
                            <span>{tmpl.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                  Each selected template will be sent to every selected contact.
                </div>
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
                {validSelectedTemplates.length} template{validSelectedTemplates.length === 1 ? '' : 's'} · {selectedContacts.size} contact{selectedContacts.size === 1 ? '' : 's'} selected
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
                  disabled={campaignRunning || validSelectedTemplates.length === 0 || selectedContacts.size === 0}
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
        onDeliveryUpdate={refreshAfterDeliveryUpdate}
      />
    </div>
  );
};

export default WhatsApp;