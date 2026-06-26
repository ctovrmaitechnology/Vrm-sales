import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const StatCard = ({ title, value, trend, trendValue, icon }) => {
  const isPositive = trend === 'up';
  
  return (
    <div className="card stat-card">
      <div className="stat-header">
        <span>{title}</span>
        {icon && <div style={{ color: 'var(--primary)' }}>{icon}</div>}
      </div>
      <div className="stat-value">{value}</div>
      {trendValue && (
        <div className={`stat-trend ${isPositive ? 'trend-up' : 'trend-down'}`}>
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{trendValue} vs last month</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
