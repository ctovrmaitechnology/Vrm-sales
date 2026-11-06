// Shared between unifiedDb.js (which maintains the scheduling state as
// conversation events arrive) and the services/controllers that read or act
// on it, so both sides agree on the same template tag and delay without a
// circular require.
const FOLLOW_UP_TEMPLATE_NAME = 'followup_2';

// 30 minutes by default. Override with WHATSAPP_REPLY_FOLLOWUP_DELAY_MINUTES
// in .env (e.g. set to 0 for immediate sending).
function getReplyFollowUpDelayMs() {
  const minutes = Number(process.env.WHATSAPP_REPLY_FOLLOWUP_DELAY_MINUTES);
  return (Number.isFinite(minutes) && minutes >= 0 ? minutes : 30) * 60 * 1000;
}

module.exports = { FOLLOW_UP_TEMPLATE_NAME, getReplyFollowUpDelayMs };
