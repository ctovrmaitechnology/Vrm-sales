import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#f4f7fb',
      }}
    >
      <div
        style={{
          width: '400px',
          background: '#fff',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 0 20px rgba(0,0,0,0.1)',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            marginBottom: '30px',
            color: '#333',
          }}
        >
          Login
        </h2>

        <form onSubmit={handleLogin}>

          {/* EMAIL */}
          <div style={{ marginBottom: '20px' }}>
            <label>Email</label>

            <input
              type="email"
              name="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '8px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                outline: 'none',
              }}
            />
          </div>

          {/* PASSWORD */}
          <div style={{ marginBottom: '20px' }}>
            <label>Password</label>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid #ccc',
                borderRadius: '8px',
                marginTop: '8px',
                paddingRight: '10px',
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
                  padding: '12px',
                  border: 'none',
                  outline: 'none',
                }}
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {/* ERROR MESSAGE */}
          {error && (
            <div style={{ marginBottom: '15px', padding: '10px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', fontSize: '14px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {/* LOGIN BUTTON */}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              background: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
          >
            Login
          </button>

        </form>
      </div>
    </div>
  );
}

export default Login;