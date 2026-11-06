const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function TablePagination({
  page,
  pageSize,
  pageCount,
  totalCount,
  setPage,
  setPageSize
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: '0.75rem',
      padding: '0.75rem 1rem',
      borderTop: '1px solid #e2e8f0',
      color: '#475569',
      fontSize: '0.875rem'
    }}>
      <button
        type="button"
        aria-label="Previous page"
        onClick={() => setPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        style={buttonStyle}
      >
        ‹
      </button>
      <span>Page</span>
      <input
        aria-label="Current page"
        type="number"
        min="1"
        max={pageCount}
        value={page}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isInteger(value) && value >= 1 && value <= pageCount) setPage(value);
        }}
        style={{
          width: '4.5rem',
          padding: '0.45rem 0.6rem',
          border: '1px solid #cbd5e1',
          borderRadius: '0.75rem',
          textAlign: 'center',
          fontSize: '0.875rem'
        }}
      />
      <span>of {pageCount}</span>
      <button
        type="button"
        aria-label="Next page"
        onClick={() => setPage(Math.min(pageCount, page + 1))}
        disabled={page >= pageCount}
        style={buttonStyle}
      >
        ›
      </button>
      <select
        aria-label="Rows per page"
        value={pageSize}
        onChange={(event) => setPageSize(Number(event.target.value))}
        style={{
          padding: '0.45rem 0.65rem',
          border: '1px solid #cbd5e1',
          borderRadius: '0.75rem',
          background: '#fff',
          fontSize: '0.875rem'
        }}
      >
        {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} rows</option>)}
      </select>
      <span>{totalCount} records</span>
    </div>
  );
}

const buttonStyle = {
  width: '2.5rem',
  height: '2.5rem',
  border: '1px solid #e2e8f0',
  borderRadius: '0.75rem',
  background: '#fff',
  color: '#475569',
  fontSize: '1.25rem',
  lineHeight: 1,
  cursor: 'pointer'
};
