import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Check, X, AlertCircle } from 'lucide-react';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${BACKEND_BASE_URL}${path}`;

const DEFAULT_CATEGORIES = ['IT', 'NON IT', 'BPO', 'Recruitment'];

const CategoryDropdown = ({
  value = '',
  onChange,
  placeholder = 'Select category (e.g. IT, Recruitment...)',
  id = 'category-select',
  name = 'source',
  required = false,
}) => {
  const queryClient = useQueryClient();
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [modalError, setModalError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch categories dynamically from backend database
  const { data: categories = DEFAULT_CATEGORIES, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/categories'));
      if (!res.ok) {
        throw new Error('Failed to load categories');
      }
      const data = await res.json();
      return Array.isArray(data.categories) && data.categories.length > 0
        ? data.categories
        : DEFAULT_CATEGORIES;
    },
    staleTime: 60_000,
  });

  // Ensure default categories are always included at top
  const mergedCategories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...(Array.isArray(categories) ? categories : [])])
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Autofocus input when modal opens
  useEffect(() => {
    if (modalOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [modalOpen]);

  const handleSelect = (category) => {
    setIsOpen(false);
    if (typeof onChange === 'function') {
      onChange({ target: { name, value: category } });
    }
  };

  const handleOpenModal = () => {
    setIsOpen(false);
    setNewCategoryName('');
    setModalError('');
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSaving) return;
    setModalOpen(false);
    setNewCategoryName('');
    setModalError('');
  };

  const handleSaveCategory = async (e) => {
    if (e) e.preventDefault();
    const trimmed = newCategoryName.trim();

    // 1. Validation: Prevent empty
    if (!trimmed) {
      setModalError('Please enter a category name.');
      return;
    }

    // 2. Validation: Prevent duplicate (case-insensitive)
    const exists = mergedCategories.some(
      (c) => c.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setModalError(`Category "${trimmed}" already exists in the list.`);
      return;
    }

    setIsSaving(true);
    setModalError('');

    try {
      const response = await fetch(apiUrl('/api/categories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save new category.');
      }

      // Invalidate react-query cache so all components update
      await queryClient.invalidateQueries({ queryKey: ['categories'] });

      // Automatically select the newly created category
      handleSelect(trimmed);

      // Close modal
      setModalOpen(false);
      setNewCategoryName('');
    } catch (err) {
      setModalError(err.message || 'Error saving category.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }} ref={dropdownRef}>
      {/* Hidden input to ensure native form submission compatibility */}
      <input
        type="hidden"
        id={id}
        name={name}
        value={value || ''}
        required={required}
      />

      {/* Dropdown Trigger */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        style={{
          width: '100%',
          padding: '0.65rem 0.85rem',
          borderRadius: '8px',
          border: isOpen ? '1.5px solid #2563eb' : '1.5px solid #cbd5e1',
          fontSize: '0.875rem',
          color: value ? '#0f172a' : '#94a3b8',
          backgroundColor: '#ffffff',
          outline: 'none',
          cursor: 'pointer',
          boxShadow: isOpen
            ? '0 0 0 3px rgba(37, 99, 235, 0.12)'
            : '0 1px 2px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxSizing: 'border-box',
          userSelect: 'none',
        }}
      >
        <span style={{ fontWeight: value ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || placeholder}
        </span>
        <ChevronDown
          size={16}
          color="#64748b"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
            marginLeft: '8px',
          }}
        />
      </div>

      {/* Floating Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
            zIndex: 110,
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '4px',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {/* Clear / Optional Option */}
          {!required && (
            <div
              onClick={() => handleSelect('')}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <span style={{ fontStyle: 'italic' }}>None (Clear category)</span>
              {!value && <Check size={14} color="#2563eb" />}
            </div>
          )}

          {/* List of Categories */}
          {mergedCategories.map((category) => {
            const isSelected = value === category;
            const isDefault = DEFAULT_CATEGORIES.includes(category);

            return (
              <div
                key={category}
                onClick={() => handleSelect(category)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: isSelected ? '#2563eb' : '#1e293b',
                  fontWeight: isSelected ? 600 : 400,
                  backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background-color 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#f1f5f9';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{category}</span>
                {isSelected && <Check size={15} color="#2563eb" />}
              </div>
            );
          })}

          <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />

          {/* "+ Add New Category" Option */}
          <div
            onClick={handleOpenModal}
            style={{
              padding: '9px 12px',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#2563eb',
              backgroundColor: '#f0f7ff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#dbeafe';
              e.currentTarget.style.color = '#1d4ed8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f0f7ff';
              e.currentTarget.style.color = '#2563eb';
            }}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Plus size={13} strokeWidth={2.5} />
            </div>
            <span>Add New Category</span>
          </div>
        </div>
      )}

      {/* Modal / Popup for Adding New Category */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              animation: 'modalSlideUp 0.2s ease-out',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                    Add New Category
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCategory} style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  htmlFor="new-category-input"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '0.4rem',
                  }}
                >
                  Category Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  ref={inputRef}
                  id="new-category-input"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    if (modalError) setModalError('');
                  }}
                  placeholder="e.g. Healthcare, Real Estate..."
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '0.75rem 0.95rem',
                    borderRadius: '8px',
                    border: modalError ? '1.5px solid #ef4444' : '1.5px solid #cbd5e1',
                    fontSize: '0.9rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => {
                    if (!modalError) e.target.style.borderColor = '#2563eb';
                  }}
                  onBlur={(e) => {
                    if (!modalError) e.target.style.borderColor = '#cbd5e1';
                  }}
                />
              </div>

              {/* Error Alert */}
              {modalError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    color: '#dc2626',
                    fontSize: '0.8rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaving) e.currentTarget.style.backgroundColor = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaving) e.currentTarget.style.backgroundColor = '#1d4ed8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryDropdown;

