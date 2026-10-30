import React from 'react';
import { PhoneCall } from 'lucide-react';

const Calls = () => {
  return (
    <div style={{ paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, letterSpacing: '-0.025em', color: '#0f172a' }}>
            Calls <span style={{ color: '#2563eb' }}>Management</span>
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.35rem 0 0' }}>
            Track and manage outbound & inbound calls, recordings, and lead interaction logs.
          </p>
        </div>
      </div>

      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '2.5rem',
        border: '1px solid rgba(220, 234, 250, 0.95)',
        boxShadow: '0 4px 18px rgba(180, 205, 235, 0.14)',
        textAlign: 'center',
        color: '#64748b'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: '#eff6ff',
          color: '#2563eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1rem',
        }}>
          <PhoneCall size={28} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
          Calls Module
        </h3>
        <p style={{ maxWidth: '420px', margin: '0 auto', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Calls workspace is ready. Share your design requirements or layout preferences to build the UI here.
        </p>
      </div>
    </div>
  );
};

export default Calls;

