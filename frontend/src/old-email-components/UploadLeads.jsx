import React, { useState } from 'react';
import '../styles/whatsapp.css';

export default function UploadLeads() {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Single Lead State
  const [singleLead, setSingleLead] = useState({ name: '', email: '', phone: '', product_type: 'workflow_ai' });
  const [singleStatus, setSingleStatus] = useState('');
  const [singleLoading, setSingleLoading] = useState(false);

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
  // HANDLE SINGLE LEAD SUBMIT
  // ==========================================
  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!singleLead.email && !singleLead.phone) {
      setSingleStatus('❌ Email or Phone is required');
      return;
    }

    setSingleLoading(true);
    setSingleStatus('Sending Campaign... ⏳');

    try {
      const payload = {
        ...singleLead,
        sendImmediately: true // Immediately trigger the campaign
      };

      const res = await fetch('http://localhost:5002/api/upload-lead-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        setSingleStatus(`✅ Success! Campaign sent to ${singleLead.name || 'Lead'}`);
        setSingleLead({ name: '', email: '', phone: '', product_type: 'workflow_ai' });
      } else {
        setSingleStatus(`❌ Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Submit error:', err);
      setSingleStatus('❌ Submit Failed');
    } finally {
      setSingleLoading(false);
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

        {/* SINGLE LEAD SECTION */}
        <div className="dashboard-section" style={{ maxWidth: '600px', margin: '2rem auto' }}>
          <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>Send Campaign to Single Lead</h2>
          
          <form onSubmit={handleSingleSubmit}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                value={singleLead.name}
                onChange={e => setSingleLead({...singleLead, name: e.target.value})}
                className="form-control"
                placeholder="John Doe"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                value={singleLead.email}
                onChange={e => setSingleLead({...singleLead, email: e.target.value})}
                className="form-control"
                placeholder="john@example.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">WhatsApp Number</label>
              <input
                type="text"
                value={singleLead.phone}
                onChange={e => setSingleLead({...singleLead, phone: e.target.value})}
                className="form-control"
                placeholder="e.g. 6382108701"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Product Campaign</label>
              <select
                value={singleLead.product_type}
                onChange={e => setSingleLead({...singleLead, product_type: e.target.value})}
                className="form-control"
              >
                <option value="workflow_ai">Workflow AI</option>
                <option value="lyntro_ai">Lyntro AI</option>
                <option value="survey_campaign">Survey & Campaign</option>
              </select>
            </div>

            <div className="mb-4" style={{ marginTop: '1.5rem' }}>
              <button
                type="submit"
                disabled={singleLoading || (!singleLead.email && !singleLead.phone)}
                className="btn btn-primary w-full"
                style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
              >
                {singleLoading ? 'Sending...' : 'Add Lead & Send Campaign'}
              </button>
            </div>
            
            {singleStatus && (
              <div className={`px-4 py-3 rounded-lg text-center font-medium transition ${
                singleStatus.includes('✅')
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : singleStatus.includes('⏳')
                  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`} style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', textAlign: 'center', fontWeight: 500, marginTop: '1rem' }}>
                {singleStatus}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
