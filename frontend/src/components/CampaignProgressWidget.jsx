import React, { useState, useEffect, useRef } from 'react';
import { Mail, MessageSquare, Loader2, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp, X, Timer } from 'lucide-react';
// Format seconds into human-readable time remaining
function formatTimeRemaining(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return '~' + h + 'h ' + m + 'm remaining';
  if (m > 0) return '~' + m + 'm ' + s + 's remaining';
  return '~' + s + 's remaining';
}

export default function CampaignProgressWidget({
  type = 'email', // 'email' | 'whatsapp'
  statusUrl,
  onComplete,
  onDeliveryUpdate,
}) {
  const [data, setData] = useState({
    running: false,
    total: 0,
    sent: 0,
    failed: 0,
    queued: 0,
    progress: 0,
    currentContact: '',
    isWaiting: false,
    waitingRemainingSeconds: 0,
    waitMessage: '',
    startedAt: null,
    completedAt: null,
  });

  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const wasRunningRef = useRef(false);
  const statusVersionRef = useRef(null);
  const onDeliveryUpdateRef = useRef(onDeliveryUpdate);
  const autoDismissTimerRef = useRef(null);

  useEffect(() => {
    onDeliveryUpdateRef.current = onDeliveryUpdate;
  }, [onDeliveryUpdate]);

  const isEmail = type === 'email';
  const themeColor = isEmail ? '#3b82f6' : '#10b981';
  const themeGradient = isEmail
    ? 'linear-gradient(90deg, #3b82f6, #6366f1)'
    : 'linear-gradient(90deg, #10b981, #059669)';

  const fetchStatus = async () => {
    if (!statusUrl) return;
    try {
      const res = await fetch(statusUrl);
      if (!res.ok) return;
      const json = await res.json();
      const statusVersion = Number(json.statusVersion || 0);
      if (statusVersionRef.current !== null && statusVersion !== statusVersionRef.current) {
        onDeliveryUpdateRef.current?.();
      }
      statusVersionRef.current = statusVersion;

      setData((prev) => {
        // Detect transition from running -> finished
        if (prev.running && !json.running) {
          if (onComplete) onComplete(json);
          // Auto-dismiss after 25s if completed
          if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
          autoDismissTimerRef.current = setTimeout(() => {
            setDismissed(true);
          }, 25000);
        }

        // If newly started running, un-dismiss
        if (json.running && dismissed) {
          setDismissed(false);
        }

        return json;
      });

      wasRunningRef.current = json.running;
    } catch {
      // Ignore polling errors
    }
  };

  // Listen to custom window event to trigger instant status check when campaign is launched
  useEffect(() => {
    const handleCampaignStarted = (e) => {
      if (!e.detail || e.detail.type === type) {
        setDismissed(false);
        setMinimized(false);
        fetchStatus();
      }
    };

    window.addEventListener('campaign-started', handleCampaignStarted);
    return () => window.removeEventListener('campaign-started', handleCampaignStarted);
  }, [type]);

  // Polling effect
  useEffect(() => {
    fetchStatus();

    const interval = setInterval(() => {
      // Poll faster while running (900ms), slower while idle (4000ms)
      fetchStatus();
    }, data.running ? 900 : 4000);

    return () => clearInterval(interval);
  }, [statusUrl, data.running]);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
    };
  }, []);

  // Do not show widget if dismissed or if no campaign has been started in this session
  if (dismissed || (!data.running && !data.completedAt)) {
    return null;
  }

  const isCompleted = !data.running && Boolean(data.completedAt);

  // Time remaining calculation:
  // - waitingRemainingSeconds: live countdown for the current inter-email delay (from backend ticker)
  // - queued: emails not yet sent; each will wait ~4 min (3-5 min random delay)
  const queuedCount = data.queued || 0;
  const currentWaitSec = data.waitingRemainingSeconds || 0;
  // Total = current wait gap + future emails * 4 min avg
  const estTotalSeconds = data.running
    ? currentWaitSec + queuedCount * 240
    : 0;
  const estTimeRemainingLabel = data.running && (queuedCount > 0 || currentWaitSec > 0)
    ? formatTimeRemaining(Math.max(estTotalSeconds, currentWaitSec))
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '284px',
        zIndex: 1050,
        width: minimized ? '260px' : '360px',
        maxWidth: 'calc(100vw - 320px)',
        backgroundColor: 'var(--bg-card, #ffffff)',
        color: 'var(--text-dark, #1e293b)',
        borderRadius: '14px',
        boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.16), 0 4px 12px -2px rgba(0, 0, 0, 0.08)',
        border: `1px solid ${data.running ? (isEmail ? '#bfdbfe' : '#a7f3d0') : 'var(--border-color, #e2e8f0)'}`,
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
        animation: 'slideUpWidget 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUpWidget {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }
        .widget-spin {
          animation: spin 1s linear infinite;
        }
        @media (max-width: 768px) {
          .campaign-progress-widget {
            left: 16px !important;
            right: 16px !important;
            width: auto !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: minimized ? 'none' : '1px solid var(--border-color, #f1f5f9)',
          backgroundColor: data.running
            ? (isEmail ? 'rgba(239, 246, 255, 0.7)' : 'rgba(236, 253, 245, 0.7)')
            : 'var(--bg-card, #ffffff)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setMinimized(!minimized)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              backgroundColor: isEmail ? '#dbeafe' : '#d1fae5',
              color: themeColor,
              flexShrink: 0,
            }}
          >
            {isEmail ? <Mail size={16} /> : <MessageSquare size={16} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'block', lineHeight: 1.2 }}>
              {isEmail ? 'Email Campaign' : 'WhatsApp Campaign'}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)' }}>
              {data.running ? (data.isWaiting ? 'Waiting between messages (2m delay)' : 'In Progress') : 'Completed'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
          {data.running ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '0.7rem',
                fontWeight: 600,
                backgroundColor: isEmail ? '#eff6ff' : '#ecfdf5',
                color: themeColor,
                border: `1px solid ${isEmail ? '#bfdbfe' : '#a7f3d0'}`,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: themeColor,
                  animation: 'pulseGlow 1.5s infinite',
                }}
              />
              {data.progress}%
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '0.7rem',
                fontWeight: 600,
                backgroundColor: '#f0fdf4',
                color: '#16a34a',
                border: '1px solid #bbf7d0',
              }}
            >
              <CheckCircle2 size={12} />
              Done
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMinimized(!minimized);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '3px',
              cursor: 'pointer',
              color: 'var(--text-muted, #94a3b8)',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '4px',
            }}
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '3px',
              cursor: 'pointer',
              color: 'var(--text-muted, #94a3b8)',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '4px',
            }}
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* BODY (when expanded) */}
      {!minimized && (
        <div style={{ padding: '14px 16px' }}>
          {/* Progress Bar & Percentage */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.75rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>
                {data.running ? (data.isWaiting ? 'Waiting 2 minutes...' : 'Sending in progress...') : 'Finished'}
              </span>
              <span style={{ fontWeight: 700, color: themeColor }}>
                {data.progress}% ({data.sent + data.failed}/{data.total})
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '7px',
                backgroundColor: 'var(--border-color, #e2e8f0)',
                borderRadius: '9999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(3, data.progress)}%`,
                  height: '100%',
                  background: themeGradient,
                  borderRadius: '9999px',
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>
          </div>

          {/* TIME REMAINING BANNER */}
          {data.running && estTimeRemainingLabel && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '6px',
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                fontSize: '0.72rem',
                color: '#0369a1',
                fontWeight: 600,
                marginBottom: '10px',
              }}
            >
              <Timer size={12} style={{ flexShrink: 0 }} />
              <span>Est. time remaining: {estTimeRemainingLabel}</span>
            </div>
          )}

          {/* METRIC CHIPS GRID */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
              marginBottom: '12px',
            }}
          >
            {/* Messages accepted by WhatsApp; delivery webhooks can later mark these failed. */}
            <div
              style={{
                padding: '8px 4px',
                borderRadius: '8px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #dcfce7',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Accepted
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                {data.sent}
              </div>
            </div>

            {/* Queued */}
            <div
              style={{
                padding: '8px 4px',
                borderRadius: '8px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fef3c7',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Queued
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
                {data.queued}
              </div>
            </div>

            {/* Failed */}
            <div
              style={{
                padding: '8px 4px',
                borderRadius: '8px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fee2e2',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Failed
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#b91c1c', marginTop: '2px' }}>
                {data.failed}
              </div>
            </div>

            {/* Total */}
            <div
              style={{
                padding: '8px 4px',
                borderRadius: '8px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Total
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#334155', marginTop: '2px' }}>
                {data.total}
              </div>
            </div>
          </div>

          {/* ACTIVE CONTACT TICKER */}
          <div
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-main, #f8fafc)',
              border: '1px solid var(--border-color, #e2e8f0)',
              fontSize: '0.72rem',
              color: 'var(--text-muted, #64748b)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {data.running ? (
              <>
                {data.isWaiting ? (
                  <Clock size={12} style={{ color: themeColor, flexShrink: 0 }} />
                ) : (
                  <Loader2 size={12} className="widget-spin" style={{ color: themeColor, flexShrink: 0 }} />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {data.isWaiting
                    ? (data.waitMessage || data.currentContact)
                    : (data.currentContact ? `Sending: ${data.currentContact}` : 'Processing queue...')}
                </span>
              </>
            ) : (
              <>
                {data.failed > 0 ? (
                  <AlertCircle size={12} style={{ color: '#dc2626', flexShrink: 0 }} />
                ) : (
                  <CheckCircle2 size={12} style={{ color: '#16a34a', flexShrink: 0 }} />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: data.failed > 0 ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                  {data.failed > 0
                    ? `Done: ${data.sent} accepted, ${data.failed} failed${data.lastError ? ` (${data.lastError})` : ''}`
                    : `Campaign completed! Accepted: ${data.sent}, Failed: 0`}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
