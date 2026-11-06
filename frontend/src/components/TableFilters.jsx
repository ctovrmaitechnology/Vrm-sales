import { Search, X, Calendar, RotateCcw } from 'lucide-react';

const baseSelectStyle = {
  minWidth: '110px',
  maxWidth: '160px',
  flex: '1 1 auto',
  padding: '0.45rem 0.65rem',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  background: '#ffffff',
  color: '#0f172a',
  fontSize: '0.8125rem',
  outline: 'none',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

export default function TableFilters({
  search,
  setSearch,
  facets = [],
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  hasFilters,
  clearFilters,
  searchPlaceholder = 'Search records...',
  showSearch = true,
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '0.6rem',
    }}>
      {showSearch && (
        <label style={{ position: 'relative', flex: '1 1 240px', maxWidth: '340px' }}>
          <Search
            size={16}
            aria-hidden="true"
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            style={{
              width: '100%',
              padding: '0.45rem 0.65rem 0.45rem 2.2rem',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: '0.8125rem',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </label>
      )}

      {facets.map((facet) => {
        const isActive = Boolean(facet.value);
        return (
          <select
            key={facet.key}
            value={facet.value}
            onChange={(event) => facet.onChange(event.target.value)}
            aria-label={`Filter by ${facet.label.toLowerCase()}`}
            style={{
              ...baseSelectStyle,
              borderColor: isActive ? '#3b82f6' : '#cbd5e1',
              backgroundColor: isActive ? '#eff6ff' : '#ffffff',
              color: isActive ? '#1d4ed8' : '#0f172a',
              fontWeight: isActive ? 600 : 400,
            }}
          >
            <option value="">All {facet.label}</option>
            {facet.options.map((option) => (
              <option key={option.value ?? option} value={option.value ?? option}>
                {option.label ?? option}
              </option>
            ))}
          </select>
        );
      })}

      {setFromDate && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.65rem',
            border: (fromDate || toDate) ? '1px solid #3b82f6' : '1px solid #cbd5e1',
            borderRadius: '8px',
            backgroundColor: (fromDate || toDate) ? '#eff6ff' : '#ffffff',
            color: '#1e293b',
            fontSize: '0.8125rem',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            transition: 'all 0.15s ease',
          }}
        >
          <Calendar size={14} style={{ color: (fromDate || toDate) ? '#2563eb' : '#64748b', flexShrink: 0 }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: (fromDate || toDate) ? '#1d4ed8' : '#64748b' }}>From:</span>
          <input
            type="date"
            value={fromDate || ''}
            onChange={(event) => setFromDate(event.target.value)}
            aria-label="Filter from date"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '0.8125rem',
              color: '#0f172a',
              outline: 'none',
              padding: '0',
              width: '130px',
              fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: (fromDate || toDate) ? '#1d4ed8' : '#64748b' }}>To:</span>
          <input
            type="date"
            value={toDate || ''}
            onChange={(event) => setToDate(event.target.value)}
            aria-label="Filter to date"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '0.8125rem',
              color: '#0f172a',
              outline: 'none',
              padding: '0',
              width: '130px',
              fontFamily: 'inherit',
            }}
          />
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => { setFromDate(''); setToDate(''); }}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: '#64748b',
                display: 'inline-flex',
                alignItems: 'center',
                marginLeft: '2px',
              }}
              title="Clear date range"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.42rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fee2e2';
            e.currentTarget.style.borderColor = '#fca5a5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fef2f2';
            e.currentTarget.style.borderColor = '#fecaca';
          }}
        >
          <RotateCcw size={13} /> Reset Filters
        </button>
      )}
    </div>
  );
}
