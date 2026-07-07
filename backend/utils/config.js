require('dotenv').config();

const IS_DEV = process.env.NODE_ENV !== "production";

function cleanUrl(url) {
  return String(url || "").trim().replace(/\/$/, "");
}

const BACKEND_BASE_URL = cleanUrl(
  IS_DEV
    ? `http://localhost:${process.env.PORT || 5002}`
    : (process.env.BACKEND_BASE_URL || process.env.BASE_URL || "")
);

const FRONTEND_BASE_URL = cleanUrl(
  IS_DEV
    ? "http://localhost:5173"
    : (process.env.FRONTEND_BASE_URL || "https://vrmaitechnology.com")
);

const POSTER_URL = cleanUrl(
  process.env.POSTER_URL ||
  `${FRONTEND_BASE_URL}/contactus/#send-message-section`
);

const SENDER_EMAIL =
  process.env.SENDER_EMAIL ||
  "contactus@vrmaitechnology.com";

const LINKEDIN_BACKEND_URL = cleanUrl(
  process.env.LINKEDIN_BACKEND_URL ||
  "http://localhost:3000"
);

module.exports = {
  IS_DEV,
  BACKEND_BASE_URL,
  FRONTEND_BASE_URL,
  POSTER_URL,
  SENDER_EMAIL,
  LINKEDIN_BACKEND_URL,
  cleanUrl
};
