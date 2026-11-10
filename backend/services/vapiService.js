const axios = require('axios');

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
const VAPI_BASE_URL = 'https://api.vapi.ai';

function vapiHeaders() {
  return {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  };
}
/** Convert any Indian number format to +91XXXXXXXXXX (other countries pass through) */
function toE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}
/**
 * Initiate an outbound phone call via VAPI.
 */
async function startCall({ phone, name, assistantId, assistantOverrides }) {
  const payload = {
    phoneNumberId: VAPI_PHONE_NUMBER_ID,
    assistantId: assistantId || VAPI_ASSISTANT_ID,
    customer: {
      number: toE164(phone),

      name: name || undefined,
    },
  };

  if (assistantOverrides) {
    payload.assistantOverrides = assistantOverrides;
  }

  const response = await axios.post(`${VAPI_BASE_URL}/call/phone`, payload, {
    headers: vapiHeaders(),
  });

  return response.data;
}

/**
 * Fetch a single call's current status from VAPI.
 */
async function getCall(callId) {
  const response = await axios.get(`${VAPI_BASE_URL}/call/${callId}`, {
    headers: vapiHeaders(),
  });
  return response.data;
}

/**
 * List calls from VAPI with optional date filters.
 */
async function listCalls({ limit = 100, createdAtGt, createdAtLt } = {}) {
  const params = { limit };
  if (createdAtGt) params.createdAtGt = createdAtGt;
  if (createdAtLt) params.createdAtLt = createdAtLt;

  const response = await axios.get(`${VAPI_BASE_URL}/call`, {
    headers: vapiHeaders(),
    params,
  });
  return response.data;
}

/**
 * Parse a raw VAPI webhook event body into a normalized object.
 */
function parseWebhookEvent(body) {
  const message = body?.message || body;
  const type = message?.type;
  const call = message?.call || body?.call || {};

  const callId = call?.id || message?.callId || body?.callId;
  let status = null;
  let endedReason = null;

  if (type === 'call-started' || call?.status === 'ringing') {
    status = 'in-progress';
  } else if (type === 'call-ended' || type === 'end-of-call-report') {
    // VAPI sends 'end-of-call-report' for completed calls with transcript/recording
    endedReason = call?.endedReason || message?.endedReason || body?.endedReason;
    if (!endedReason || endedReason === 'assistant-ended-call' || endedReason === 'customer-ended-call') {
      status = 'completed';
    } else if (endedReason === 'customer-did-not-answer' || endedReason === 'no-answer') {
      status = 'no-answer';
    } else if (endedReason === 'busy') {
      status = 'busy';
    } else {
      status = 'failed';
    }
  } else if (type === 'status-update') {
    const rawStatus = call?.status || message?.status;
    if (rawStatus === 'queued') status = 'queued';
    else if (rawStatus === 'ringing') status = 'ringing';
    else if (rawStatus === 'in-progress') status = 'in-progress';
    else if (rawStatus === 'ended') status = 'completed';
  }

  // Parse transcript — can be array of {role, message} or a plain string
  // VAPI end-of-call-report puts it at message.transcript (string) or message.messages (array)
  let transcript = null;
  const rawTranscript = message?.transcript || call?.transcript;
  const rawMessages = message?.messages || call?.messages;
  if (Array.isArray(rawMessages) && rawMessages.length > 0) {
    transcript = rawMessages; // structured turn-by-turn
  } else if (Array.isArray(rawTranscript)) {
    transcript = rawTranscript;
  } else if (typeof rawTranscript === 'string' && rawTranscript.trim()) {
    transcript = rawTranscript; // keep as plain string; frontend handles both
  }

  const duration = call?.endedAt && call?.startedAt
    ? Math.round((new Date(call.endedAt) - new Date(call.startedAt)) / 1000)
    : (call?.duration ?? null);

  return {
    callId,
    type,
    status,
    endedReason: endedReason || call?.endedReason || null,
    duration,
    cost: call?.cost ?? message?.cost ?? null,
    recordingUrl: call?.recordingUrl ?? message?.recordingUrl ?? null,
    transcript,
    summary: call?.summary ?? message?.summary ?? null,
    startedAt: call?.startedAt ?? message?.startedAt ?? null,
    endedAt: call?.endedAt ?? message?.endedAt ?? null,
  };
}

/**
 * Fetch assistant details from VAPI.
 */
async function getAssistant(assistantId) {
  const id = assistantId || VAPI_ASSISTANT_ID;
  const response = await axios.get(`${VAPI_BASE_URL}/assistant/${id}`, {
    headers: vapiHeaders(),
  });
  return response.data;
}

/**
 * Patch an assistant config in VAPI (PATCH /assistant/:id).
 * @param {object} patch - Fields to update (e.g. { tools: [...] })
 */
async function updateAssistant(patch, assistantId) {
  const id = assistantId || VAPI_ASSISTANT_ID;
  const response = await axios.patch(`${VAPI_BASE_URL}/assistant/${id}`, patch, {
    headers: vapiHeaders(),
  });
  return response.data;
}

module.exports = { startCall, getCall, listCalls, parseWebhookEvent, getAssistant, updateAssistant };