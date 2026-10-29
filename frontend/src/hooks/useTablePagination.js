import { useMemo, useState } from 'react';

const DATE_FIELDS = [
  'created_at',
  'createdAt',
  'created_on',
  'createdOn',
  'attempted_at',
  'attemptedAt',
  'sent_at',
  'sentAt',
];

function getEntryTimestamp(item) {
  for (const field of DATE_FIELDS) {
    const value = item?.[field];
    if (!value) continue;
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

export default function useTablePagination(items) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = useMemo(() => {
    const orderedItems = items
      .map((item, index) => ({ item, index, timestamp: getEntryTimestamp(item) }))
      .sort((a, b) => {
        if (a.timestamp === null && b.timestamp === null) return a.index - b.index;
        if (a.timestamp === null) return 1;
        if (b.timestamp === null) return -1;
        return a.timestamp - b.timestamp || a.index - b.index;
      })
      .map(({ item }) => item);

    return orderedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [items, currentPage, pageSize]);

  return {
    pageItems,
    page: currentPage,
    pageSize,
    pageCount,
    totalCount: items.length,
    setPage,
    setPageSize: (size) => {
      setPageSize(size);
      setPage(1);
    }
  };
}
