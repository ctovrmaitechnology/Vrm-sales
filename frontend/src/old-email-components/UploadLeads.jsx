import React, { useState } from 'react';
import '../styles/whatsapp.css';

export default function UploadLeads() {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // ==========================================
  // HANDLE FILE SELECTION
  // ==========================================
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setStatus('');
  };

  // ==========================================
  // HANDLE FILE UPLOAD
  // ==========================================
  const upload = async () => {
    if (!file) {
      alert('Please select a file ❗');
      setStatus('');
      return;
    }

    setLoading(true);
    setStatus('Uploading... ⏳');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:5002/api/upload-leads', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (res.ok) {
        setStatus(`✅ Upload Success: ${data.total || 'Upload'} records`);
        console.log('Server response:', data);
        setFile(null);
      } else {
        setStatus(`❌ Upload Failed: ${data.error || 'Unknown error'}`);
        console.error('Upload error response:', data);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setStatus('❌ Upload Failed');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // RENDER COMPONENT
  // ==========================================
  return (
    <div className="wa-dashboard">
      <div className="wa-container" style={{ padding: 0, maxWidth: 'none' }}>
        <div className="dashboard-section" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>Upload Excel / CSV</h2>

          {/* File Input */}
          <div className="form-group">
            <label className="form-label">Select File</label>
            <input
              type="file"
              onChange={handleFileChange}
              disabled={loading}
              className="form-control"
              accept=".csv,.xlsx,.xls"
            />
          </div>

          {/* Upload Button */}
          <div className="mb-4" style={{ marginTop: '1.5rem' }}>
            <button
              onClick={upload}
              disabled={loading || !file}
              className="btn btn-primary w-full"
            >
              {loading ? 'Uploading...' : 'Upload'}
            </button>
          </div>

          {/* Status Message */}
          {status && (
            <div className={`px-4 py-3 rounded-lg text-center font-medium transition ${
              status.includes('✅')
                ? 'bg-green-50 text-green-700 border border-green-200'
                : status.includes('⏳')
                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`} style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', textAlign: 'center', fontWeight: 500 }}>
              {status}
            </div>
          )}

          {/* File Name Display */}
          {file && (
            <div className="mt-4 p-3 rounded-lg border" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--primary-light)', borderColor: '#dbeafe' }}>
              <p className="text-sm" style={{ color: 'var(--primary)', fontSize: '0.875rem', margin: 0 }}>
                <strong>Selected File:</strong> {file.name}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
