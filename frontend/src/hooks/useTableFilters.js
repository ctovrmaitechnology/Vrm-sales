import { useMemo, useState } from 'react';

const getValue = (item, field) => {
  if (typeof field === 'function') return field(item);
  return String(field).split('.').reduce((value, part) => value?.[part], item);
};

const normalize = (value) => String(value ?? '').trim();

export default function useTableFilters(items, { searchFields = [], facets = [], dateField } = {}) {
  const [search, setSearch] = useState('');
  const [selectedFacets, setSelectedFacets] = useState({});
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const facetOptions = useMemo(() => facets.map((facet) => {
    if (facet.options) return { ...facet, options: facet.options };
    // a facet may supply getValues(item) -> array, so one row can match several filter values
    const values = new Set(
      items
        .flatMap((item) => (facet.getValues ? facet.getValues(item) : [getValue(item, facet.field)]))
        .map(normalize)
        .filter(Boolean)
    );
    return {
      ...facet,
      options: [...values].sort((a, b) => a.localeCompare(b)),
    };
  }), [items, facets]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (query && !searchFields.some((field) =>
        normalize(getValue(item, field)).toLowerCase().includes(query)
      )) return false;

      if (facets.some((facet) => {
        const selected = selectedFacets[facet.key];
        if (!selected) return false;
        if (facet.getValues) return !facet.getValues(item).map(normalize).includes(selected);
        return normalize(getValue(item, facet.field)) !== selected;
      })) return false;

      if (dateField && (fromDate || toDate)) {
        const dateValue = normalize(getValue(item, dateField));
        const date = /^\d{4}-\d{2}-\d{2}/.test(dateValue) ? dateValue.slice(0, 10) : '';
        if (!date || (fromDate && date < fromDate) || (toDate && date > toDate)) return false;
      }

      return true;
    });
  }, [items, search, searchFields, facets, selectedFacets, dateField, fromDate, toDate]);

  const hasFilters = Boolean(
    search.trim() || fromDate || toDate || Object.values(selectedFacets).some(Boolean)
  );
  const clearFilters = () => {
    setSearch('');
    setSelectedFacets({});
    setFromDate('');
    setToDate('');
  };

  return {
    filteredItems,
    search,
    setSearch,
    facets: facetOptions.map((facet) => ({
      ...facet,
      value: selectedFacets[facet.key] || '',
      onChange: (value) => setSelectedFacets((current) => ({ ...current, [facet.key]: value })),
    })),
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    hasFilters,
    clearFilters,
  };
}