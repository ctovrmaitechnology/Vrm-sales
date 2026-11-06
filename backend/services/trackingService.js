const {
  BACKEND_BASE_URL,
  FRONTEND_BASE_URL,
  POSTER_URL,
  SENDER_EMAIL
} = require('../utils/config');
const { hasPublicBackendUrl } = require('../utils/helpers');

function encodeLeadRef(email) {
  return encodeURIComponent(Buffer.from(email).toString('base64'));
}

function decodeLeadRef(ref) {
  return Buffer
    .from(decodeURIComponent(ref), 'base64')
    .toString('utf8');
}

function buildUnsubscribeUrl(email) {
  if (hasPublicBackendUrl()) {
    const token = encodeURIComponent(Buffer.from(email).toString('base64'));
    return `${BACKEND_BASE_URL}/api/unsubscribe?token=${token}`;
  }

  const body =
    encodeURIComponent(`Please unsubscribe ${email}`);

  return `mailto:${SENDER_EMAIL}?subject=Unsubscribe&body=${body}`;
}

function buildUnsubscribeHeaders(unsubscribeUrl) {
  if (process.env.ENABLE_UNSUBSCRIBE_HEADERS !== "true") {
    return {};
  }

  const headers = {
    'List-Unsubscribe': `<${unsubscribeUrl}>`
  };

  if (/^https:\/\//i.test(unsubscribeUrl)) {
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  return headers;
}

function buildDemoUrl(email) {
  if (hasPublicBackendUrl() && email) {
    return `${BACKEND_BASE_URL}/api/demo?ref=${encodeLeadRef(email)}`;
  }

  return `${FRONTEND_BASE_URL}/contactus/#send-message-section`;
}

function buildTrackedDemoRedirectUrl(email, redirectUrl, kind = "demo") {
  if (hasPublicBackendUrl() && email && redirectUrl) {
    return `${BACKEND_BASE_URL}/api/demo?ref=${encodeLeadRef(email)}&kind=${encodeURIComponent(kind)}&redirectUrl=${encodeURIComponent(redirectUrl)}`;
  }

  return redirectUrl || `${FRONTEND_BASE_URL}/contactus/#send-message-section`;
}

function buildPosterUrl(email) {
  if (hasPublicBackendUrl() && email) {
    return `${BACKEND_BASE_URL}/api/poster?ref=${encodeLeadRef(email)}`;
  }

  return POSTER_URL;
}

function buildWhatsAppDemoUrl(email) {
  if (hasPublicBackendUrl() && email) {
    return `${BACKEND_BASE_URL}/api/book-demo?ref=${encodeLeadRef(email)}`;
  }

  return `${FRONTEND_BASE_URL}/contactus/#send-message-section`;
}

module.exports = {
  encodeLeadRef,
  decodeLeadRef,
  buildUnsubscribeUrl,
  buildUnsubscribeHeaders,
  buildDemoUrl,
  buildTrackedDemoRedirectUrl,
  buildPosterUrl,
  buildWhatsAppDemoUrl
};
