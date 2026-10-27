import { useState } from 'react';
import { Download, Upload, X } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';
const apiUrl = (path) => `${API_BASE_URL}${path}`;

const ExcelImportControls = ({ entity, users, onImported }) => {
  const [userId, setUserId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState([]);
  const [rowErrors, setRowErrors] = useState([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const endpoint = entity === 'lead' ? '/api/manual-leads' : '/api/companies';
  const selectedUserId = userId || String(users[0]?.id || '');
  const selectedUser = users.find((user) => String(user.id) === selectedUserId);

  const uploadFile = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setMessage('');
    setError('');
    setDuplicates([]);
    setRowErrors([]);
    if (!file) {
      input.value = '';
      return;
    }
    if (!selectedUserId) {
      setError('Select an assigned user before uploading.');
      input.value = '';
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('Choose an .xlsx, .xls, or .csv file.');
      input.value = '';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('The selected file is larger than the 25 MB upload limit.');
      input.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress({ processed: 0, total: 0 });
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('user_id', selectedUserId);
      const response = await fetch(apiUrl(`${endpoint}/import`), { method: 'POST', body });
      const contentType = response.headers.get('content-type') || '';
      let result = null;
      if (contentType.includes('application/x-ndjson') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = '';

        const handleEvent = (line) => {
          if (!line.trim()) return;
          const item = JSON.parse(line);
          if (item.type === 'start' || item.type === 'progress') {
            setUploadProgress({ processed: item.processed || 0, total: item.total || 0 });
          } else if (item.type === 'complete') {
            result = item.result;
          } else if (item.type === 'error') {
            throw new Error(item.error || 'Import failed while processing rows.');
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          pending += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = pending.split('\n');
          pending = lines.pop() || '';
          lines.forEach(handleEvent);
          if (done) break;
        }
        if (pending.trim()) handleEvent(pending);
      } else if (contentType.includes('application/json')) {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Failed to import spreadsheet.');
        result = data;
      }
      if (!response.ok) {
        throw new Error(
          result?.error ||
          `Upload failed (HTTP ${response.status}). The server did not return an import result.`
        );
      }
      if (!result || !Number.isInteger(result.imported)) {
        throw new Error('The server response did not include an import result. Please check the server logs.');
      }

      input.value = '';
      setMessage(
        `Imported ${result.imported} ${entity === 'lead' ? 'lead' : 'company contact'}${result.imported === 1 ? '' : 's'}.` +
        (result.duplicates?.length ? ` Skipped ${result.duplicates.length} duplicate row(s).` : '') +
        (result.errors?.length ? ` ${result.errors.length} other row(s) need attention.` : '')
      );
      setDuplicates(result.duplicates || []);
      setRowErrors(result.errors || []);
      setImportedCount(result.imported);
      setReportOpen(true);
      try {
        await onImported();
      } catch (refreshError) {
        setError(`Import completed, but refreshing the table failed: ${refreshError.message}`);
      }
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      input.value = '';
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#475569' }}>
        Assigned user
        <select
          value={selectedUserId}
          onChange={(event) => setUserId(event.target.value)}
          aria-label="Assigned user for spreadsheet import"
          style={{ minWidth: '150px', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
        >
          <option value="">Select user...</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.employee_name}</option>
          ))}
        </select>
      </label>
      <a
        className="btn btn-secondary"
        href={selectedUser ? apiUrl(`${endpoint}/template?user_id=${encodeURIComponent(selectedUserId)}`) : undefined}
        download
        aria-disabled={!selectedUser}
        onClick={(event) => {
          if (!selectedUser) event.preventDefault();
        }}
        style={{ opacity: selectedUser ? 1 : 0.55, pointerEvents: selectedUser ? 'auto' : 'none' }}
      >
        <span className="btn-icon"><Download size={16} /></span>
        Download Template
      </a>
      <label
        className="btn btn-secondary"
        aria-disabled={uploading || !selectedUser}
        style={{
          position: 'relative',
          overflow: 'hidden',
          opacity: uploading || !selectedUser ? 0.55 : 1,
          cursor: uploading || !selectedUser ? 'not-allowed' : 'pointer',
        }}
      >
        <span className="btn-icon"><Upload size={16} /></span>
        {uploading
          ? uploadProgress?.total
            ? `Uploading ${uploadProgress.processed}/${uploadProgress.total}`
            : 'Preparing...'
          : 'Upload Excel'}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={uploadFile}
          disabled={uploading || !selectedUser}
          aria-label="Choose Excel or CSV file to upload"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: uploading || !selectedUser ? 'not-allowed' : 'pointer',
          }}
        />
      </label>
      {uploading && uploadProgress?.total > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{ width: '100%', maxWidth: '260px', fontSize: '0.75rem', color: '#475569' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Processed {uploadProgress.processed} of {uploadProgress.total} rows</span>
            <span>{Math.round((uploadProgress.processed / uploadProgress.total) * 100)}%</span>
          </div>
          <div style={{ height: 6, overflow: 'hidden', borderRadius: 999, background: '#e2e8f0' }}>
            <div style={{
              width: `${Math.min(100, (uploadProgress.processed / uploadProgress.total) * 100)}%`,
              height: '100%',
              background: '#3b5bff',
              transition: 'width 160ms ease',
            }} />
          </div>
        </div>
      )}
      {(message || error) && (
        <div role={error ? 'alert' : 'status'} style={{ width: '100%', color: error ? '#b91c1c' : '#166534', fontSize: '0.8rem' }}>
          {error || message}
          {!error && (duplicates.length > 0 || rowErrors.length > 0) && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              style={{ marginLeft: '0.5rem', border: 0, background: 'none', color: '#1d4ed8', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
            >
              View upload report
            </button>
          )}
        </div>
      )}
      {reportOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReportOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="excel-import-report-title"
            style={{
              width: 'min(100%, 560px)',
              maxHeight: 'min(82vh, 560px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: '12px',
              background: '#fff',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.24)',
              border: '1px solid #e2e8f0',
            }}
          >
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.15rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h2 id="excel-import-report-title" style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Upload summary</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.8rem' }}>
                  {importedCount} {entity === 'lead' ? 'lead' : 'company contact'}{importedCount === 1 ? '' : 's'} imported
                  {duplicates.length + rowErrors.length > 0 && ` · ${duplicates.length + rowErrors.length} row(s) need attention`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close upload report"
                onClick={() => setReportOpen(false)}
                style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, border: 0, borderRadius: 6, background: '#f1f5f9', color: '#475569', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </header>
            <div style={{ overflowY: 'auto', padding: '0.9rem 1.15rem 1.1rem' }}>
              {duplicates.length + rowErrors.length === 0 ? (
                <div style={{ padding: '1rem', borderRadius: 8, background: '#f0fdf4', color: '#166534', fontSize: '0.875rem' }}>
                  All valid rows were imported. No duplicate or failed rows.
                </div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left' }}>
                        <th style={{ width: 58, padding: '0.65rem 0.75rem', fontWeight: 600 }}>Row</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Name</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...duplicates.map((item) => ({ ...item, category: 'Duplicate' })),
                        ...rowErrors.map((item) => ({ ...item, reason: item.error, category: 'Not imported' })),
                      ]
                        .sort((a, b) => a.row - b.row)
                        .map((item, index) => (
                          <tr key={`${item.row}-${item.category}-${index}`} style={{ borderTop: '1px solid #e2e8f0', color: '#334155' }}>
                            <td style={{ padding: '0.65rem 0.75rem', verticalAlign: 'top' }}>{item.row}</td>
                            <td style={{ padding: '0.65rem 0.75rem', verticalAlign: 'top', fontWeight: 500 }}>
                              {item.name || 'Unnamed'}
                              {item.email && <div style={{ marginTop: 2, color: '#64748b', fontSize: '0.72rem', fontWeight: 400 }}>{item.email}</div>}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', verticalAlign: 'top' }}>
                              <span style={{
                                display: 'inline-block',
                                marginRight: '0.35rem',
                                padding: '0.15rem 0.4rem',
                                borderRadius: 999,
                                background: item.category === 'Duplicate' ? '#fef3c7' : '#fee2e2',
                                color: item.category === 'Duplicate' ? '#92400e' : '#991b1b',
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}>{item.category}</span>
                              {item.reason}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <footer style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 1.15rem', borderTop: '1px solid #e2e8f0' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setReportOpen(false)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default ExcelImportControls;
