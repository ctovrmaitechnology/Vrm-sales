// Login session helpers. The token is checked by the server on every request;
// the stored user is only used to decide what to show on screen.
const TOKEN_KEY = 'vrm_token';
const USER_KEY = 'vrm_user';
const MARKER_KEY = 'vrm_admin'; // older logout buttons only remove this key, which also signs the user out

const API_BASE = import.meta.env.VITE_BACKEND_BASE_URL || '';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function setSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(MARKER_KEY, JSON.stringify({ email: user.email, loggedInAt: Date.now() }));
  } catch { /* storage blocked */ }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(MARKER_KEY);
    localStorage.removeItem('isLoggedIn');
  } catch { /* storage blocked */ }
}

export function getToken() {
  if (!read(MARKER_KEY)) return null;
  return read(TOKEN_KEY);
}

export function getUser() {
  if (!getToken()) return null;
  try { return JSON.parse(read(USER_KEY) || 'null'); } catch { return null; }
}

// The Super Admin can do everything an Admin can, plus manage access
export function isAdmin() { const r = getUser()?.role; return r === 'admin' || r === 'super_admin'; }
export function isSuperAdmin() { return getUser()?.role === 'super_admin'; }
export function isTeamLead() { return getUser()?.role === 'team_lead'; }

export const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', team_lead: 'Team Lead', caller: 'Caller' };

function isApiUrl(url) {
  const path = url.startsWith(API_BASE) && API_BASE ? url.slice(API_BASE.length) : url;
  return (path.startsWith('/api/') || path.startsWith('/linkedin-api/')) &&
    (!/^https?:\/\//.test(url) || Boolean(API_BASE && url.startsWith(API_BASE)));
}

// Adds the login token to every request that goes to our own API,
// and sends the user back to the login page when the server says the session is over.
export function installAuthFetch() {
  if (window.__vrmFetchPatched) return;
  window.__vrmFetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : '';
    if (!url || !isApiUrl(url)) return originalFetch(input, init);

    const headers = new Headers(init.headers || {});
    const token = getToken();
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

    const response = await originalFetch(input, { ...init, headers });
    if (response.status === 401 && !url.includes('/api/auth/login')) {
      clearSession();
      if (window.location.pathname !== '/') window.location.assign('/');
    }
    return response;
  };
}