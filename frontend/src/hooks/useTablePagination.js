import { useMemo, useState } from 'react';

export default function useTablePagination(items) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );

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
