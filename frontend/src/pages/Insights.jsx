import { useQuery } from '@tanstack/react-query';
import {
  MessageCircle, CheckCircle2, Eye, Users,
  ShieldCheck, Gauge, Wallet, RefreshCw,
} from 'lucide-react';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${BACKEND_BASE_URL}${path}`;

const QUALITY_COLORS = {
  GREEN: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', label: 'High quality' },
  YELLOW: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: 'Medium quality' },
  RED: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'Low quality' },
  UNKNOWN: { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0', label: 'Unknown' },
};

const StatCard = ({ label, value, icon, tint }) => (
  <div style={{
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    border: '1px solid rgba(220, 234, 250, 0.95)',
    boxShadow: '0 4px 18px rgba(180, 205, 235, 0.14)',
    padding: '1.1rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
  }}>
    <div style={{
      width: '42px', height: '42px', borderRadius: '11px',
      background: tint?.bg || '#eff6ff', color: tint?.color || '#2563eb',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {icon}
    </div>
    <div>
      <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>{label}</p>
      <h3 style={{ margin: '0.15rem 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#0f172a' }}>{value}</h3>
    </div>
  </div>
);

const SectionCard = ({ title, subtitle, children }) => (
  <div style={{
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid rgba(220, 234, 250, 0.95)',
    boxShadow: '0 4px 18px rgba(180, 205, 235, 0.14)',
    padding: '1.5rem',
  }}>
    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
    {subtitle && <p style={{ margin: '0.25rem 0 1rem', fontSize: '0.82rem', color: '#64748b' }}>{subtitle}</p>}
    {children}
  </div>
);

const EmptyNotice = ({ message }) => (
  <div style={{
    padding: '1rem 1.1rem',
    borderRadius: '10px',
    background: '#f8fafc',
    border: '1px dashed #cbd5e1',
    color: '#64748b',
    fontSize: '0.82rem',
  }}>
    {message}
  </div>
);

const Insights = () => {
  const insightsQuery = useQuery({
    queryKey: ['whatsapp-insights'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/insights/whatsapp'));
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to load WhatsApp insights.');
      return data;
    },
    refetchOnWindowFocus: false,
  });

  const data = insightsQuery.data;
  const phone = data?.phoneNumber || {};
  const account = data?.account || {};
  const stats = data?.stats || {};
  const templates = data?.templates || {};
  const spend = data?.spend || {};
  const volume = data?.volume || {};
  const quality = QUALITY_COLORS[phone.qualityRating] || QUALITY_COLORS.UNKNOWN;
  const hasLiveVolume = volume.configured && !volume.error;

  return (
    <div style={{ paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, letterSpacing: '-0.025em', color: '#0f172a' }}>
            Analytics & <span style={{ color: '#2563eb' }}>Insights</span>
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.35rem 0 0' }}>
            WhatsApp Business performance, account health, and delivery analytics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => insightsQuery.refetch()}
          disabled={insightsQuery.isFetching}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={16} className={insightsQuery.isFetching ? 'spin' : ''} />
          {insightsQuery.isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {insightsQuery.isLoading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading WhatsApp insights...</div>
      )}

      {insightsQuery.error && (
        <div role="alert" style={{ marginBottom: '1rem', color: '#b91c1c' }}>
          {insightsQuery.error.message}
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top-level stat cards — all live from the Meta Graph API (last 7 days) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <StatCard
              label="Messages Sent"
              value={hasLiveVolume ? volume.totalSent : stats.totalSent ?? 0}
              icon={<MessageCircle size={20} />}
              tint={{ bg: '#eff6ff', color: '#2563eb' }}
            />
            <StatCard
              label="Messages Delivered"
              value={hasLiveVolume ? volume.totalDelivered : stats.totalDelivered ?? 0}
              icon={<CheckCircle2 size={20} />}
              tint={{ bg: '#f0fdf4', color: '#16a34a' }}
            />
            <StatCard
              label="Template Reads"
              value={stats.totalRead ?? 0}
              icon={<Eye size={20} />}
              tint={{ bg: '#eef2ff', color: '#4338ca' }}
            />
            <StatCard
              label="Delivery Rate"
              value={`${stats.deliveryRate ?? 0}%`}
              icon={<Gauge size={20} />}
              tint={{ bg: '#fdf4ff', color: '#9333ea' }}
            />
            <StatCard
              label="Replies"
              value={stats.totalReplied ?? 0}
              icon={<Users size={20} />}
              tint={{ bg: '#fffbeb', color: '#b45309' }}
            />
          </div>
          {stats.error && (
            <p style={{ margin: '-0.75rem 0 0', fontSize: '0.78rem', color: '#dc2626' }}>{stats.error}</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
            {/* Account health */}
            <SectionCard title="WhatsApp Account Health" subtitle="Live status pulled from the Meta Graph API for your connected number.">
              {phone.error ? (
                <EmptyNotice message={phone.error} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 0.9rem', borderRadius: '10px',
                    background: quality.bg, border: `1px solid ${quality.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ShieldCheck size={18} color={quality.color} />
                      <span style={{ fontWeight: 700, color: quality.color }}>Phone Number Quality</span>
                    </div>
                    <span style={{ fontWeight: 700, color: quality.color }}>
                      {phone.qualityRating || 'UNKNOWN'} · {quality.label}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {[
                      ['Display Number', phone.displayPhoneNumber, null],
                      ['Verified Name', phone.verifiedName, null],
                      ['Messaging Limit', phone.messagingLimitTier, 'Not yet tiered by Meta'],
                      ['Name Status', phone.nameStatus, null],
                      ['Verification', phone.codeVerificationStatus, null],
                      ['Throughput', phone.throughputLevel, null],
                      ['Account Review', account.accountReviewStatus, null],
                      ['Business Verification', account.businessVerificationStatus, null],
                    ].map(([label, value, unknownHint]) => {
                      const isUnknown = !value || value === 'UNKNOWN';
                      return (
                        <div key={label} style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: isUnknown ? '#94a3b8' : '#0f172a', marginTop: '2px' }}>
                            {isUnknown ? (unknownHint || 'Not available') : value}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Spend / cost analytics */}
            <SectionCard title="Amount Spent" subtitle="Per-message pricing analytics from your WhatsApp Business Account (last 7 days).">
              {spend.error || !spend.configured ? (
                <EmptyNotice message={spend.error || 'Not configured.'} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <StatCard
                    label={`Total Charges (${spend.currency || 'USD'})`}
                    value={spend.totalCost != null ? spend.totalCost.toFixed(2) : '-'}
                    icon={<Wallet size={20} />}
                    tint={{ bg: '#eff6ff', color: '#2563eb' }}
                  />
                  {spend.byCategory && spend.byCategory.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {spend.byCategory.map((cat) => (
                        <div key={cat.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.4rem 0.6rem', borderRadius: '8px', background: '#f8fafc' }}>
                          <span style={{ color: '#334155', fontWeight: 600, textTransform: 'capitalize' }}>{cat.category.toLowerCase()}</span>
                          <span style={{ color: '#64748b' }}>{cat.volume} msgs</span>
                          <span style={{ color: '#0f172a', fontWeight: 700 }}>{spend.currency} {cat.cost.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(spend.totalCost ?? 0) === 0 && (spend.totalVolume ?? 0) === 0 && (
                    <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: 0 }}>
                      No billable messages in this period.
                    </p>
                  )}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Per-template breakdown — sourced directly from Meta's template_analytics */}
          <SectionCard title="Template Performance" subtitle="Live per-template delivery stats from the Meta Graph API (last 7 days).">
            {stats.error ? (
              <EmptyNotice message={stats.error} />
            ) : stats.perTemplate && stats.perTemplate.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Template</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Sent</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Delivered</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Read</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Replied</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Clicked</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Quality (Meta)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.perTemplate.map((tmpl) => {
                      const metaTemplate = templates.templates?.find((t) => t.name === tmpl.templateName);
                      return (
                        <tr key={tmpl.templateName} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.65rem 0.6rem', fontWeight: 600, color: '#0f172a' }}>{tmpl.templateName}</td>
                          <td style={{ padding: '0.65rem 0.6rem', color: '#334155' }}>{tmpl.sent}</td>
                          <td style={{ padding: '0.65rem 0.6rem', color: '#16a34a' }}>{tmpl.delivered}</td>
                          <td style={{ padding: '0.65rem 0.6rem', color: '#2563eb' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Eye size={13} /> {tmpl.read}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.6rem', color: '#b45309' }}>{tmpl.replied}</td>
                          <td style={{ padding: '0.65rem 0.6rem', color: '#9333ea' }}>{tmpl.clicked}</td>
                          <td style={{ padding: '0.65rem 0.6rem', color: '#94a3b8' }}>
                            {!templates.configured
                              ? '—'
                              : !metaTemplate?.qualityScore || metaTemplate.qualityScore === 'UNKNOWN'
                                ? 'Not yet scored'
                                : metaTemplate.qualityScore}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyNotice message="No WhatsApp template sends in this period." />
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
};

export default Insights;
