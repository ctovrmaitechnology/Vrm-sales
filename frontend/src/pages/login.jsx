import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuroraBackground from '../components/AuroraBackground';

function Login() {

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const ADMIN_USERS = [
    { email: 'maanusree@vrmaitechnology.com', password: 'password@vrm' },
    { email: 'harini@vrmaitechnology.com', password: 'password@vrm' },
    { email: 'admin@vrmaitechnology.com', password: 'vrm123' },
  ];

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleLogin = (e) => {
    e.preventDefault();

    const matched = ADMIN_USERS.find(
      (u) => u.email === formData.email.trim().toLowerCase() && u.password === formData.password
    );

    if (matched) {
      localStorage.setItem('vrm_admin', JSON.stringify({ email: matched.email, loggedInAt: Date.now() }));
      navigate('/app');
    } else {
      setError('Invalid email or password.');
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        background: '#f4f8ff',
      }}
    >
      <AuroraBackground />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '420px',
          margin: '1.5rem',
          background: '#ffffff',
          padding: '40px',
          borderRadius: '16px',
          border: '1px solid rgba(220, 232, 248, 0.9)',
          boxShadow: '0 12px 32px -4px rgba(180, 205, 235, 0.25), 0 4px 12px -2px rgba(180, 205, 235, 0.12)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img
            src="/vrmLogo.png"
            alt="VRM Logo"
            style={{ width: '44px', height: '44px', objectFit: 'contain', marginBottom: '12px' }}
          />
          <h2
            style={{
              margin: '0 0 6px',
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.02em',
            }}
          >
            VRM Sales Agent
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
            Sign in to access your sales workspace
          </p>
        </div>

        <form onSubmit={handleLogin}>

          {/* EMAIL */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Email address
            </label>
            <input
              type="email"
              name="email"
              placeholder="name@company.com"
              value={formData.email}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                outline: 'none',
                fontSize: '0.925rem',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
            />
          </div>

          {/* PASSWORD */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Password
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                backgroundColor: '#ffffff',
                paddingRight: '10px',
                boxSizing: 'border-box',
              }}
            >
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.925rem',
                  backgroundColor: 'transparent',
                  boxSizing: 'border-box',
                }}
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#2563eb',
                  padding: '6px',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <div style={{ marginBottom: '16px', padding: '10px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', fontSize: '14px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {/* LOGIN BUTTON */}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              transition: 'background-color 0.2s',
            }}
          >
            Sign in
          </button>

        </form>
      </div>
    </div>
  );
}

export default Login;
