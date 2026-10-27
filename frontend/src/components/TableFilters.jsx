import { Search, X } from 'lucide-react';

const controlStyle = {
  minWidth: '150px',
  padding: '0.55rem 0.65rem',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  background: '#fff',
  color: '#0f172a',
  fontSize: '0.875rem',
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
      marginBottom: '1rem',
    }}>
      {showSearch && <label style={{ position: 'relative', flex: '1 1 260px', maxWidth: '360px' }}>
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
          style={{ ...controlStyle, width: '100%', paddingLeft: '2.2rem' }}
        />
      </label>}

      {facets.map((facet) => (
        <select
          key={facet.key}
          value={facet.value}
          onChange={(event) => facet.onChange(event.target.value)}
          aria-label={`Filter by ${facet.label.toLowerCase()}`}
          style={controlStyle}
        >
          <option value="">All {facet.label}</option>
          {facet.options.map((option) => (
            <option key={option.value ?? option} value={option.value ?? option}>
              {option.label ?? option}
            </option>
          ))}
        </select>
      ))}

      {setFromDate && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#475569', fontSize: '0.8rem' }}>
            From
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Filter from date" style={controlStyle} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#475569', fontSize: '0.8rem' }}>
            To
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Filter to date" style={controlStyle} />
          </label>
        </>
      )}

      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          style={{ ...controlStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', cursor: 'pointer' }}
        >
          <X size={14} /> Clear filters
        </button>
      )}
    </div>
  );
}
