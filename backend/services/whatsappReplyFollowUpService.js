const prisma = require('../prismaClient');
const { sendWhatsAppText } = require('./whatsappService');
const { recordWhatsAppOutboundChat } = require('../unifiedDb');
const { isWhatsAppEnabled } = require('../utils/helpers');
const { FOLLOW_UP_TEMPLATE_NAME } = require('../constants/whatsappFollowUp');

const DEFAULT_REPLY_FOLLOWUP_MESSAGE = `Hi, I noticed you checked out our demo link recently. We'd love to show you how WorkflowSI and Bench to Deploy can help streamline your recruitment workflows and talent deployment.

Would you be available for a quick demo this week? You can book a convenient slot here: https://www.vrmaitechnology.com/contactus#send-message

Alternatively, feel free to email us at contactus@vrmaitechnology.com

Looking forward to hearing from you!`;

function getReplyFollowUpMessage() {
  return process.env.WHATSAPP_REPLY_FOLLOWUP_MESSAGE || DEFAULT_REPLY_FOLLOWUP_MESSAGE;
}

// `metadata.replyFollowUp` ({ dueAt, sentAt }) is maintained incrementally by
// unifiedDb.js's upsertWhatsAppConversationEvent as messages/button-clicks
// flow in, so this filters directly in SQL instead of pulling every
// conversation's full chat history into Node and re-deriving eligibility
// from scratch on every tick.
async function getDueWhatsAppConversations() {
  return prisma.$queryRaw`
    SELECT id, email, metadata
    FROM lead_status
    WHERE channel = 'whatsapp'
      AND action = 'whatsapp_conversation'
      AND metadata -> 'replyFollowUp' ->> 'dueAt' IS NOT NULL
      AND metadata -> 'replyFollowUp' ->> 'sentAt' IS NULL
      AND (metadata -> 'replyFollowUp' ->> 'dueAt')::timestamptz <= NOW()
  `;
}

async function getPendingWhatsAppConversations() {
  return prisma.$queryRaw`
    SELECT id, email, metadata
    FROM lead_status
    WHERE channel = 'whatsapp'
      AND action = 'whatsapp_conversation'
      AND metadata -> 'replyFollowUp' ->> 'dueAt' IS NOT NULL
      AND metadata -> 'replyFollowUp' ->> 'sentAt' IS NULL
  `;
}

async function getSentWhatsAppConversations() {
  return prisma.$queryRaw`
    SELECT id, email, metadata
    FROM lead_status
    WHERE channel = 'whatsapp'
      AND action = 'whatsapp_conversation'
      AND metadata -> 'replyFollowUp' ->> 'sentAt' IS NOT NULL
  `;
}

function getChatsFromRow(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return Array.isArray(metadata.Chat)
    ? metadata.Chat
    : (metadata.Chat && typeof metadata.Chat === 'object' ? [metadata.Chat] : []);
}

// Resolve the CONTACT's phone number from any chat message in the
// conversation, falling back to the row's stored contact metadata (a
// button-click-only conversation has no chat message to read from). This
// must be direction-aware: on an outbound chat, `from` is OUR OWN
// PHONE_NUMBER_ID and the contact's number is in `to`; on an inbound chat
// it's the reverse (`from` is the contact, no `to` is set). Picking
// `chat.from || chat.to` blindly returns our own business number whenever
// the first stored chat happens to be outbound.
function getRowPhone(row) {
  const chats = getChatsFromRow(row);
  for (const chat of chats) {
    const phone = chat?.direction === 'outbound' ? chat?.to : chat?.from;
    if (phone) return phone;
  }
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return metadata.company?.phone || metadata.lead?.phone || row.email || null;
}

/**
 * Sends the canned reply-follow-up message to every contact whose
 * `metadata.replyFollowUp.dueAt` has passed and who hasn't received it
 * before (`sentAt` still null). Recording the send via
 * recordWhatsAppOutboundChat (tagged templateName: 'followup_2', type:
 * 'text') routes back through upsertWhatsAppConversationEvent, which sets
 * `sentAt` and clears `dueAt` — so it can never fire twice for the same
 * number.
 */
async function runWhatsAppReplyFollowUpCheck() {
  if (!isWhatsAppEnabled()) {
    return { checked: 0, sent: 0, skipped: 'whatsapp_disabled' };
  }

  const message = getReplyFollowUpMessage();
  const dueConversations = await getDueWhatsAppConversations();

  let sent = 0;
  for (const row of dueConversations) {
    const phone = getRowPhone(row);
    if (!phone) continue;

    try {
      const result = await sendWhatsAppText(phone, message);
      if (result?.skipped) continue;
      const messageId = result?.messages?.[0]?.id || null;
      await recordWhatsAppOutboundChat(phone, message, messageId, {
        type: 'text',
        templateName: FOLLOW_UP_TEMPLATE_NAME,
      });
      sent++;
      console.log(`[WA Reply Follow-up] Sent delayed reply message to ${phone}`);
    } catch (error) {
      console.error(`[WA Reply Follow-up] Failed to send to ${phone}:`, error.response?.data || error.message);
    }
  }

  return { checked: dueConversations.length, sent };
}

/**
 * Returns a Map keyed by the last 10 digits of the contact's phone number,
 * for every conversation that is waiting on the delayed reply-follow-up
 * (replied, not yet answered, not yet sent). Used by the frontend to show
 * the "Reply message will send in ~Xm" banner before it actually goes out.
 */
async function getPendingWhatsAppReplyFollowUps() {
  const now = Date.now();
  const conversations = await getPendingWhatsAppConversations();

  const pendingByPhone = new Map();
  for (const row of conversations) {
    const phone = getRowPhone(row);
    const digits = String(phone || '').replace(/\D/g, '');
    const last10 = digits.slice(-10);
    if (!last10) continue;

    const dueAt = row.metadata?.replyFollowUp?.dueAt;
    if (!dueAt) continue;
    const dueAtMs = new Date(dueAt).getTime();
    if (!Number.isFinite(dueAtMs)) continue;

    pendingByPhone.set(last10, {
      dueAt: new Date(dueAtMs).toISOString(),
      overdue: now >= dueAtMs,
    });
  }

  return pendingByPhone;
}

/**
 * Returns a Map keyed by the last 10 digits of the contact's phone number,
 * for every contact who has actually received the reply-follow-up text
 * message. The per-templateName delivery-status map (whatsappTemplateStatuses
 * on the lead) can't represent this distinctly from the manually-sent
 * 'followup_2' template, since both share that templateName and the Map is
 * keyed by name only (last write wins) — so this reads the reply-text's own
 * chat entry directly to report its real status (sent/delivered/read/failed).
 */
async function getWhatsAppReplyMessageStatuses() {
  const conversations = await getSentWhatsAppConversations();

  const statusByPhone = new Map();
  for (const row of conversations) {
    const phone = getRowPhone(row);
    const digits = String(phone || '').replace(/\D/g, '');
    const last10 = digits.slice(-10);
    if (!last10) continue;

    const chats = getChatsFromRow(row);
    const replyChat = chats.find((chat) =>
      chat?.direction === 'outbound' &&
      chat?.templateName === FOLLOW_UP_TEMPLATE_NAME &&
      chat?.type === 'text'
    );
    if (!replyChat) continue;

    statusByPhone.set(last10, {
      status: replyChat.status || 'sent',
      failureReason: replyChat.error?.details || replyChat.error?.message || null,
      sentAt: row.metadata?.replyFollowUp?.sentAt || null,
    });
  }

  return statusByPhone;
}

module.exports = {
  runWhatsAppReplyFollowUpCheck,
  getPendingWhatsAppReplyFollowUps,
  getWhatsAppReplyMessageStatuses,
  FOLLOW_UP_TEMPLATE_NAME,
};
