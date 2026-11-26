function cleanPhone(value) {
  return String(value || '').trim().replace(/[\s\-.()]/g, '');
}

function isValidPhone(value) {
  return /^\+?\d{7,15}$/.test(cleanPhone(value));
}

function phoneError(value, label = 'Phone number') {
  const text = String(value || '').trim();
  if (!text) return null;
  return isValidPhone(text)
    ? null
    : `${label} is invalid. Use 7 to 15 digits, with an optional leading +.`;
}

// WhatsApp number counts as a phone
function hasContact(email, phone, whatsapp) {
  return Boolean(
    String(email || '').trim() ||
    String(phone || '').trim() ||
    String(whatsapp || '').trim()
  );
}

const CONTACT_REQUIRED_MESSAGE = 'Enter an email or a phone number. Leads with neither are not saved.';

module.exports = { cleanPhone, isValidPhone, phoneError, hasContact, CONTACT_REQUIRED_MESSAGE };