const prisma = require('../prismaClient');
const vapiService = require('../services/vapiService');
const fs = require('fs');
const path = require('path');

const TRANSFER_SETTINGS_PATH = path.join(__dirname, '../data/transfer_settings.json');

function readTransferSettings() {
  try {
    const raw = fs.readFileSync(TRANSFER_SETTINGS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { destinations: [] };
  }
}

function writeTransferSettings(data) {
  fs.mkdirSync(path.dirname(TRANSFER_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(TRANSFER_SETTINGS_PATH, JSON.stringify(data, null, 2));
}

const CALL_CAMPAIGN_DELAY_SECONDS = parseInt(process.env.CALL_CAMPAIGN_DELAY_SECONDS || '120', 10);

// In-memory campaign state (mirrors the email/whatsapp pattern)
let callCampaignRunning = false;
let callCampaignPaused = false;
let callCampaignProgress = {
  running: false,
  paused: false,
  total: 0,
  sent: 0,
  failed: 0,
  queued: 0,
  progress: 0,
  currentContact: null,
  isWaiting: false,
  waitingRemainingSeconds: 0,
  waitMessage: '',
};

function resetProgress() {
  callCampaignProgress = {
    running: false,
    paused: false,
    total: 0,
    sent: 0,
    failed: 0,
    queued: 0,
    progress: 0,
    currentContact: null,
    isWaiting: false,
    waitingRemainingSeconds: 0,
    waitMessage: '',
  };
}

/** Normalise a phone number to last 10 digits for dedup */
function last10(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits.slice(-10);
}

/**
 * GET /api/calls/contacts
 * Returns all contacts with a phone number from leads, company, and WhatsAppLeads,
 * deduplicated by last 10 digits. Attaches most recent call record.
 */
async function getCallableContacts(req, res) {
  try {
    // First: fetch all phone numbers that have received a WhatsApp message
    // (status: sent, delivered, read, or clicked — meaning the message went out)
    const whatsappSentLeads = await prisma.whatsAppLeads.findMany({
      where: {
        whatsapp_number: { not: null },
        whatsapp_status: { in: ['sent', 'delivered', 'read', 'clicked'] },
      },
      select: { whatsapp_number: true },
    });

    // Build a Set of eligible last-10-digit phone keys
    const eligiblePhones = new Set(
      whatsappSentLeads.map(w => last10(w.whatsapp_number)).filter(Boolean)
    );

    if (eligiblePhones.size === 0) {
      return res.json({ contacts: [], total: 0 });
    }

    const [leads, companies, waLeads, recentCalls] = await Promise.all([
      prisma.leads.findMany({
        where: {
          OR: [
            { phone_number: { not: null } },
            { whatsapp_number: { not: null } },
          ],
        },
        select: {
          id: true,
          full_name: true,
          phone_number: true,
          whatsapp_number: true,
          company_name: true,
          role: true,
          source: true,
          status: true,
          owner: { select: { employee_name: true } },
        },
      }),
      prisma.company.findMany({
        where: {
          OR: [
            { phone_number: { not: null } },
            { whatsapp_number: { not: null } },
          ],
        },
        select: {
          id: true,
          full_name: true,
          phone_number: true,
          whatsapp_number: true,
          company_name: true,
          role: true,
          source: true,
          status: true,
          owner: { select: { employee_name: true } },
        },
      }),
      prisma.whatsAppLeads.findMany({
        where: {
          whatsapp_number: { not: null },
          whatsapp_status: { in: ['sent', 'delivered', 'read', 'clicked'] },
        },
        select: {
          id: true,
          name: true,
          whatsapp_number: true,
          company: true,
          role: true,
          source: true,
          status: true,
        },
      }),
      prisma.call_history.findMany({
        orderBy: { created_at: 'desc' },
        select: {
          phone_number: true,
          status: true,
          created_at: true,
          duration: true,
          ended_reason: true,
          recording_url: true,
          transcript: true,
          summary: true,
          vapi_call_id: true,
          cost: true,
        },
      }),
    ]);

    // Build a map of last-call by last-10 phone digits
    const lastCallMap = {};
    for (const c of recentCalls) {
      const key = last10(c.phone_number);
      if (key && !lastCallMap[key]) {
        lastCallMap[key] = {
          status: c.status,
          date: c.created_at,
          duration: c.duration,
          endedReason: c.ended_reason,
          recordingUrl: c.recording_url || null,
          transcript: c.transcript || null,
          summary: c.summary || null,
          vapiCallId: c.vapi_call_id || null,
          cost: c.cost ?? null,
        };
      }
    }

    const seen = new Set();
    const contacts = [];

    const addContact = (raw, contactType) => {
      const phone = raw.phone_number || raw.whatsapp_number;
      if (!phone) return;
      const key = last10(phone);
      // Only include contacts who have received a WhatsApp message
      if (!key || seen.has(key) || !eligiblePhones.has(key)) return;
      seen.add(key);
      contacts.push({
        id: raw.id,
        name: raw.full_name || raw.name || 'Unknown',
        phone,
        contactType,
        company: raw.company_name || raw.company || null,
        role: raw.role || null,
        source: raw.source || null,
        status: raw.status || null,
        owner: raw.owner?.employee_name || null,
        lastCall: lastCallMap[key] || null,
      });
    };

    leads.forEach(l => addContact(l, 'lead'));
    companies.forEach(c => addContact(c, 'company'));
    waLeads.forEach(w => addContact(w, 'whatsapp_lead'));

    res.json({ contacts, total: contacts.length });
  } catch (err) {
    console.error('[callController] getCallableContacts error:', err);
    res.status(500).json({ error: 'Failed to fetch callable contacts' });
  }
}

/**
 * POST /api/calls/campaign/start
 * Body: { phones: ["+91..."], companyIds: [...] }
 * Starts a background bulk call campaign.
 */
async function startCallCampaign(req, res) {
  if (callCampaignRunning) {
    return res.status(409).json({ error: 'A call campaign is already running.' });
  }

  const { phones = [], companyIds = [] } = req.body;

  if (!phones.length && !companyIds.length) {
    return res.status(400).json({ error: 'No contacts selected.' });
  }

  // Build contact list
  let contacts = [];

  if (phones.length) {
    // phones is an array of { phone, name, contactType, id }
    contacts = Array.isArray(phones[0])
      ? phones.map(p => ({ phone: p[0], name: p[1], contactType: p[2], id: p[3] }))
      : phones; // already shaped objects
  }

  if (companyIds.length) {
    const rows = await prisma.company.findMany({
      where: { id: { in: companyIds.map(Number) } },
      select: { id: true, full_name: true, phone_number: true, whatsapp_number: true },
    });
    for (const r of rows) {
      const phone = r.phone_number || r.whatsapp_number;
      if (phone) contacts.push({ phone, name: r.full_name, contactType: 'company', id: r.id });
    }
  }

  // Deduplicate
  const seenKeys = new Set();
  const deduped = [];
  for (const c of contacts) {
    const key = last10(c.phone);
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      deduped.push(c);
    }
  }

  if (!deduped.length) {
    return res.status(400).json({ error: 'No valid unique contacts to call.' });
  }

  // Respond immediately
  callCampaignRunning = true;
  callCampaignPaused = false;
  callCampaignProgress = {
    running: true,
    paused: false,
    total: deduped.length,
    sent: 0,
    failed: 0,
    queued: deduped.length,
    progress: 0,
    currentContact: null,
    isWaiting: false,
    waitingRemainingSeconds: 0,
    waitMessage: '',
  };

  res.json({ message: 'Call campaign started', total: deduped.length });

  // Run in background
  (async () => {
    for (let i = 0; i < deduped.length; i++) {
      if (!callCampaignRunning) break;

      // Pause check — hold here until resumed or stopped
      while (callCampaignPaused && callCampaignRunning) {
        callCampaignProgress.paused = true;
        callCampaignProgress.waitMessage = 'Campaign paused. Click Resume to continue.';
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!callCampaignRunning) break;
      callCampaignProgress.paused = false;

      const contact = deduped[i];
      callCampaignProgress.currentContact = `${contact.name || 'Unknown'} (${contact.phone})`;
      callCampaignProgress.queued = deduped.length - i;

      let vapiCallId = null;
      let callStatus = 'queued';

      try {
        const result = await vapiService.startCall({
          phone: contact.phone,
          name: contact.name,
        });
        vapiCallId = result?.id || result?.callId || null;
        callStatus = 'ringing';
        callCampaignProgress.sent++;
      } catch (err) {
        console.error(`[callCampaign] Failed to call ${contact.phone}:`, err?.message);
        callStatus = 'failed';
        callCampaignProgress.failed++;
      }

      // Save to DB
      try {
        await prisma.call_history.create({
          data: {
            vapi_call_id: vapiCallId,
            lead_id: contact.contactType === 'lead' ? contact.id : null,
            company_id: contact.contactType === 'company' ? contact.id : null,
            phone_number: contact.phone,
            contact_name: contact.name || null,
            contact_type: contact.contactType || null,
            status: callStatus,
          },
        });
      } catch (dbErr) {
        console.error('[callCampaign] DB save error:', dbErr?.message);
      }

      callCampaignProgress.queued = deduped.length - i - 1;
      callCampaignProgress.progress = Math.round(((i + 1) / deduped.length) * 100);

      // Wait between calls (skip wait after last contact)
      if (i < deduped.length - 1 && callCampaignRunning) {
        const nextContact = deduped[i + 1];
        let remaining = CALL_CAMPAIGN_DELAY_SECONDS;
        callCampaignProgress.isWaiting = true;

        await new Promise(resolve => {
          const timer = setInterval(() => {
            if (!callCampaignRunning) {
              clearInterval(timer);
              return resolve();
            }
            // Don't count down while paused
            if (callCampaignPaused) {
              callCampaignProgress.waitMessage = 'Campaign paused. Click Resume to continue.';
              return;
            }
            remaining--;
            callCampaignProgress.waitingRemainingSeconds = remaining;
            callCampaignProgress.waitMessage = `Waiting ${remaining}s before next call → ${nextContact?.name || 'Unknown'}`;
            if (remaining <= 0) {
              clearInterval(timer);
              resolve();
            }
          }, 1000);
        });

        callCampaignProgress.isWaiting = false;
        callCampaignProgress.waitingRemainingSeconds = 0;
        callCampaignProgress.waitMessage = '';
      }
    }

    callCampaignRunning = false;
    callCampaignPaused = false;
    callCampaignProgress.running = false;
    callCampaignProgress.paused = false;
    callCampaignProgress.currentContact = null;
    callCampaignProgress.progress = 100;
    callCampaignProgress.queued = 0;
    callCampaignProgress.isWaiting = false;
    callCampaignProgress.waitingRemainingSeconds = 0;
    callCampaignProgress.waitMessage = '';
    console.log('[callCampaign] Campaign finished.');
  })();
}

/**
 * GET /api/calls/campaign/status
 */
function getCallCampaignStatus(req, res) {
  res.json(callCampaignProgress);
}

/**
 * POST /api/calls/campaign/cancel
 */
function cancelCallCampaign(req, res) {
  if (!callCampaignRunning) {
    return res.status(400).json({ error: 'No campaign is running.' });
  }
  callCampaignRunning = false;
  callCampaignPaused = false;
  callCampaignProgress.running = false;
  callCampaignProgress.paused = false;
  res.json({ message: 'Campaign cancelled.' });
}

/**
 * POST /api/calls/campaign/pause
 */
function pauseCallCampaign(req, res) {
  if (!callCampaignRunning) {
    return res.status(400).json({ error: 'No call campaign is currently running.' });
  }
  callCampaignPaused = true;
  callCampaignProgress.paused = true;
  res.json({ success: true, message: 'Call campaign paused.' });
}

/**
 * POST /api/calls/campaign/resume
 */
function resumeCallCampaign(req, res) {
  if (!callCampaignRunning) {
    return res.status(400).json({ error: 'No call campaign is currently running.' });
  }
  callCampaignPaused = false;
  callCampaignProgress.paused = false;
  callCampaignProgress.waitMessage = '';
  res.json({ success: true, message: 'Call campaign resumed.' });
}

/**
 * POST /api/calls/campaign/stop
 */
function stopCallCampaign(req, res) {
  if (!callCampaignRunning) {
    return res.status(400).json({ error: 'No call campaign is currently running.' });
  }
  callCampaignRunning = false;
  callCampaignPaused = false;
  callCampaignProgress.running = false;
  callCampaignProgress.paused = false;
  callCampaignProgress.isWaiting = false;
  callCampaignProgress.waitingRemainingSeconds = 0;
  callCampaignProgress.waitMessage = 'Campaign stopped.';
  res.json({ success: true, message: 'Call campaign stopped.' });
}

/**
 * POST /api/calls/single
 * Body: { phone, name, contactType, id }
 */
async function startSingleCall(req, res) {
  const { phone, name, contactType, id } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  let vapiCallId = null;
  let callStatus = 'queued';

  try {
    const result = await vapiService.startCall({ phone, name });
    vapiCallId = result?.id || result?.callId || null;
    callStatus = 'ringing';
  } catch (err) {
    console.error('[singleCall] VAPI error:', err?.message);
    callStatus = 'failed';
  }

  try {
    const record = await prisma.call_history.create({
      data: {
        vapi_call_id: vapiCallId,
        lead_id: contactType === 'lead' ? Number(id) : null,
        company_id: contactType === 'company' ? Number(id) : null,
        phone_number: phone,
        contact_name: name || null,
        contact_type: contactType || null,
        status: callStatus,
      },
    });

    if (callStatus === 'failed') {
      return res.status(500).json({ error: 'VAPI call failed', record });
    }

    res.json({ message: 'Call initiated', vapiCallId, record });
  } catch (err) {
    console.error('[singleCall] DB error:', err?.message);
    res.status(500).json({ error: 'Failed to save call record' });
  }
}

/**
 * POST /api/calls/webhook
 * Receives VAPI webhook events and updates call_history.
 */
async function handleVapiWebhook(req, res) {
  // Acknowledge immediately
  res.status(200).json({ received: true });

  try {
    const parsed = vapiService.parseWebhookEvent(req.body);
    if (!parsed.callId) return;

    const update = {};
    if (parsed.status) update.status = parsed.status;
    if (parsed.endedReason) update.ended_reason = parsed.endedReason;
    if (parsed.duration != null) update.duration = parsed.duration;
    if (parsed.cost != null) update.cost = parsed.cost;
    if (parsed.recordingUrl) update.recording_url = parsed.recordingUrl;
    if (parsed.transcript) update.transcript = parsed.transcript;
    if (parsed.summary) update.summary = parsed.summary;
    if (parsed.startedAt) update.started_at = new Date(parsed.startedAt);
    if (parsed.endedAt) update.ended_at = new Date(parsed.endedAt);
    update.updated_at = new Date();

    await prisma.call_history.updateMany({
      where: { vapi_call_id: parsed.callId },
      data: update,
    });
  } catch (err) {
    console.error('[callWebhook] Error processing webhook:', err?.message);
  }
}

/**
 * GET /api/calls/sync/:vapiCallId
 * Manually syncs a call's status from VAPI into the DB.
 */
async function syncCallStatus(req, res) {
  const { vapiCallId } = req.params;
  try {
    const vapiData = await vapiService.getCall(vapiCallId);
    const parsed = vapiService.parseWebhookEvent({ call: vapiData });

    const update = {};
    if (parsed.status) update.status = parsed.status;
    if (parsed.endedReason) update.ended_reason = parsed.endedReason;
    if (parsed.duration != null) update.duration = parsed.duration;
    if (parsed.cost != null) update.cost = parsed.cost;
    if (parsed.recordingUrl) update.recording_url = parsed.recordingUrl;
    if (parsed.transcript) update.transcript = parsed.transcript;
    if (parsed.summary) update.summary = parsed.summary;
    if (parsed.startedAt) update.started_at = new Date(parsed.startedAt);
    if (parsed.endedAt) update.ended_at = new Date(parsed.endedAt);
    update.updated_at = new Date();

    await prisma.call_history.updateMany({
      where: { vapi_call_id: vapiCallId },
      data: update,
    });

    res.json({ message: 'Synced', data: update });
  } catch (err) {
    console.error('[syncCallStatus] Error:', err?.message);
    res.status(500).json({ error: 'Failed to sync call status' });
  }
}

/**
 * GET /api/calls/history
 * Query params: limit (default 50), offset (default 0)
 */
async function getCallHistory(req, res) {
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);

  try {
    const [records, total] = await Promise.all([
      prisma.call_history.findMany({
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.call_history.count(),
    ]);

    res.json({ records, total, limit, offset });
  } catch (err) {
    console.error('[getCallHistory] Error:', err?.message);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
}

/**
 * GET /api/calls/transfer/settings
 * Returns the saved transfer destinations.
 */
function getTransferSettings(req, res) {
  const settings = readTransferSettings();
  res.json(settings);
}

/**
 * POST /api/calls/transfer/settings
 * Body: { destinations: [{ number, name, role }] }
 * Saves transfer destinations (does NOT push to VAPI yet).
 */
function saveTransferSettings(req, res) {
  const { destinations = [] } = req.body;

  if (!Array.isArray(destinations)) {
    return res.status(400).json({ error: 'destinations must be an array' });
  }

  for (const d of destinations) {
    if (!d.number || !d.number.trim()) {
      return res.status(400).json({ error: 'Each destination must have a phone number' });
    }
  }

  const settings = { destinations };
  writeTransferSettings(settings);
  res.json({ success: true, settings });
}

/**
 * POST /api/calls/transfer/apply
 * Pushes the saved transfer destinations to VAPI assistant as a transferCall tool.
 * Also updates the assistant's system prompt to trigger transfer on interest signals.
 */
async function applyTransferToVapi(req, res) {
  const settings = readTransferSettings();

  if (!settings.destinations || settings.destinations.length === 0) {
    return res.status(400).json({ error: 'No transfer destinations configured. Add at least one number first.' });
  }

  const destinations = settings.destinations.map(d => ({
    type: 'phoneNumber',
    number: d.number,
    ...(d.name ? { description: `${d.name}${d.role ? ' - ' + d.role : ''}` } : {}),
  }));

  try {
    // First fetch current assistant to preserve existing tools & config
    let currentAssistant = {};
    try {
      currentAssistant = await vapiService.getAssistant();
    } catch (e) {
      console.warn('[applyTransfer] Could not fetch current assistant:', e?.message);
    }

    // Build updated tools array — replace any existing transferCall tool
    const existingTools = Array.isArray(currentAssistant?.model?.tools)
      ? currentAssistant.model.tools.filter(t => t.type !== 'transferCall')
      : [];

    const transferTool = {
      type: 'transferCall',
      destinations,
    };

    const updatedTools = [...existingTools, transferTool];

    // Build transfer instruction to append to system prompt
    const teamNames = settings.destinations.map(d => d.name || d.number).join(', ');
    const transferInstruction = `\n\n[TRANSFER RULE] If the person expresses interest, says they want to speak to a human, asks to be connected to someone, or says things like "I'm interested", "tell me more", "can I speak to someone", "connect me" — immediately use the transferCall tool. Before transferring say: "Great! Let me connect you to our team right away." Your team members available for transfer: ${teamNames}.`;

    // Get existing system prompt
    const existingPrompt = currentAssistant?.model?.messages?.find(m => m.role === 'system')?.content || '';
    // Remove any previous transfer instruction we added
    const cleanPrompt = existingPrompt.replace(/\n\n\[TRANSFER RULE\][\s\S]*$/, '');
    const newPrompt = cleanPrompt + transferInstruction;

    // Build patch — update tools and system prompt
    const patch = {
      model: {
        ...(currentAssistant?.model || {}),
        tools: updatedTools,
        messages: [
          ...(currentAssistant?.model?.messages || []).filter(m => m.role !== 'system'),
          { role: 'system', content: newPrompt },
        ],
      },
    };

    const updated = await vapiService.updateAssistant(patch);

    res.json({
      success: true,
      message: `Transfer tool applied to VAPI assistant with ${destinations.length} destination(s).`,
      assistantId: updated?.id,
      destinations,
    });
  } catch (err) {
    console.error('[applyTransfer] VAPI error:', err?.response?.data || err?.message);
    res.status(500).json({
      error: 'Failed to update VAPI assistant',
      detail: err?.response?.data?.message || err?.message,
    });
  }
}

/**
 * POST /api/calls/transfer/remove
 * Removes the transferCall tool from the VAPI assistant.
 */
async function removeTransferFromVapi(req, res) {
  try {
    let currentAssistant = {};
    try {
      currentAssistant = await vapiService.getAssistant();
    } catch (e) {
      console.warn('[removeTransfer] Could not fetch assistant:', e?.message);
    }

    const existingTools = Array.isArray(currentAssistant?.model?.tools)
      ? currentAssistant.model.tools.filter(t => t.type !== 'transferCall')
      : [];

    // Strip transfer instruction from system prompt
    const existingMessages = currentAssistant?.model?.messages || [];
    const cleanedMessages = existingMessages.map(m => {
      if (m.role === 'system') {
        return { ...m, content: m.content.replace(/\n\n\[TRANSFER RULE\][\s\S]*$/, '') };
      }
      return m;
    });

    const patch = {
      model: {
        ...(currentAssistant?.model || {}),
        tools: existingTools,
        messages: cleanedMessages,
      },
    };

    await vapiService.updateAssistant(patch);
    res.json({ success: true, message: 'Transfer tool removed from VAPI assistant.' });
  } catch (err) {
    console.error('[removeTransfer] VAPI error:', err?.response?.data || err?.message);
    res.status(500).json({ error: 'Failed to remove transfer tool', detail: err?.message });
  }
}

module.exports = {
  getCallableContacts,
  startCallCampaign,
  getCallCampaignStatus,
  cancelCallCampaign,
  pauseCallCampaign,
  resumeCallCampaign,
  stopCallCampaign,
  startSingleCall,
  handleVapiWebhook,
  syncCallStatus,
  getCallHistory,
  getTransferSettings,
  saveTransferSettings,
  applyTransferToVapi,
  removeTransferFromVapi,
};