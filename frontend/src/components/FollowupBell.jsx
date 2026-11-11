import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';

const fmt = (iso) => {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${String(y).slice(2)}`;
};

const FollowupBell = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data } = useQuery({
    queryKey: ['lead-followups'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_BASE_URL}/api/lead-followups`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load follow-ups.');
      return json;
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const today = data?.today;
  const items = data?.data || [];
  const todayItems = items.filter((i) => i.followupDate === today);
  const upcoming = items.filter((i) => i.followupDate !== today);

  const renderItem = (i) => (
    <div key={i.id} style={{ padding: '0.65rem 0.85rem', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>{i.name}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', background: i.followupDate === today ? '#fee2e2' : '#dbeafe', color: i.followupDate === today ? '#b91c1c' : '#1d4ed8', whiteSpace: 'nowrap' }}>
          {i.followupDate === today ? 'Today' : fmt(i.followupDate)}
        </span>
      </div>
      {i.company && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{i.company}</div>}
      {i.note && <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '0.25rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{i.note}</div>}
      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.25rem' }}>
        Assigned to: <strong style={{ color: '#2563eb' }}>{i.assignedTo || 'Unassigned'}</strong>
        {i.phone ? <> · {i.phone}</> : null}
      </div>
    </div>
  );

  const section = (title, list) => list.length > 0 && (
    <div>
      <div style={{ padding: '0.4rem 0.85rem', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', color: '#64748b', background: '#f8fafc' }}>{title.toUpperCase()}</div>
      {list.map(renderItem)}
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="Follow-up notifications"
        onClick={() => setOpen((v) => !v)}
        style={{ position: 'relative', width: '38px', height: '38px', borderRadius: '50%', border: '1px solid #e2e8f0', background: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <Bell size={18} color="#334155" />
        {items.length > 0 && (
          <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '18px', height: '18px', padding: '0 4px', borderRadius: '999px', background: todayItems.length ? '#dc2626' : '#2563eb', color: '#fff', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '46px', width: '340px', maxHeight: '420px', overflowY: 'auto', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 12px 32px rgba(15,23,42,0.18)', zIndex: 1000 }}>
          <div style={{ padding: '0.7rem 0.85rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>Follow-ups</div>
          {items.length === 0 ? (
            <div style={{ padding: '1.25rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No follow-ups scheduled.</div>
          ) : (
            <>
              {section('Today', todayItems)}
              {section('Upcoming', upcoming)}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FollowupBell;
