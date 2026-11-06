import React from 'react';
import { useNavigate } from 'react-router-dom';

const ChannelCard = ({ title, description, icon, path }) => {
  const navigate = useNavigate();
  
  return (
    <div className="card channel-card" onClick={() => navigate(path)}>
      <div className="channel-icon-wrapper">
        {icon}
      </div>
      <div>
        <h3 className="channel-title">{title}</h3>
        <p className="channel-desc">{description}</p>
      </div>
      
      <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 500, fontSize: '0.875rem' }}>
        Open Dashboard
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
    </div>
  );
};

export default ChannelCard;
