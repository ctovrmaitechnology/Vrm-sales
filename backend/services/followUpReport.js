// Follow-up numbers come from email_history (real follow-up emails sent), never from manual counts.
// A follow-up is credited to the person who called the lead (called_by); if nobody is marked as caller,
// it falls back to the assigned user (owner).
const prisma = require('../prismaClient');

const FOLLOW_UP_EVENTS = ['follow_up_1', 'follow_up_2', 'follow_up_3'];

// userIds: array of employee ids. Returns Maps keyed by user id.
async function getFollowUpCounts(userIds, dayStart, dayEnd) {
  const today = new Map();
  const total = new Map();
  if (!userIds.length) return { today, total };

  const rows = await prisma.email_history.findMany({
    where: { event_type: { in: FOLLOW_UP_EVENTS }, status: 'sent', sent_at: { lte: dayEnd }, lead_id: { not: null } },
    select: { lead_id: true, user_id: true, sent_at: true },
  });
  const leadIds = [...new Set(rows.map((r) => r.lead_id))];
  const leads = leadIds.length
    ? await prisma.leads.findMany({ where: { id: { in: leadIds } }, select: { id: true, user_id: true, called_by_user_id: true } })
    : [];
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const wanted = new Set(userIds);

  for (const r of rows) {
    const lead = leadMap.get(r.lead_id);
    const who = lead?.called_by_user_id || lead?.user_id || r.user_id;
    if (!wanted.has(who)) continue;
    total.set(who, (total.get(who) || 0) + 1);
    if (r.sent_at && new Date(r.sent_at) >= dayStart) today.set(who, (today.get(who) || 0) + 1);
  }
  return { today, total };
}

// Follow-up notes saved between start and end, as Map(userId -> [cleaned note, ...]).
async function getFollowUpNotes(userIds, start, end) {
  const out = new Map();
  if (!userIds.length) return out;
  const rows = await prisma.leads.findMany({
    where: {
      followup_note: { not: null },
      followup_set_at: { gte: start, lte: end },
      OR: [{ called_by_user_id: { in: userIds } }, { called_by_user_id: null, user_id: { in: userIds } }],
    },
    select: { user_id: true, called_by_user_id: true, followup_note: true, followup_note_clean: true },
  });
  for (const r of rows) {
    const text = (r.followup_note_clean || r.followup_note || '').trim();
    if (!text) continue;
    const who = r.called_by_user_id || r.user_id;
    if (!out.has(who)) out.set(who, []);
    out.get(who).push(text);
  }
  return out;
}

const normalize = (s) => s.toLowerCase().replace(/[.\s]+$/g, '').replace(/\s+/g, ' ');
const tidy = (s) => {
  const t = s.replace(/\s+/g, ' ').trim();
  const withCap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(withCap) ? withCap : withCap + '.';
};

// ["Asked for a meeting.", "asked for a meeting", "Callback at 5:30 PM."] ->
// "2 leads: Asked for a meeting." + sep + "1 lead: Callback at 5:30 PM."
// sep is ' | ' on screen and a line break in Excel.
function summarizeNotes(notes = [], sep = ' | ') {
  const groups = new Map();
  for (const n of notes) {
    const k = normalize(n);
    if (!groups.has(k)) groups.set(k, { text: tidy(n), count: 0 });
    groups.get(k).count++;
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .map((g) => `${g.count} ${g.count === 1 ? 'lead' : 'leads'}: ${g.text}`)
    .join(sep);
}

module.exports = { FOLLOW_UP_EVENTS, getFollowUpCounts, getFollowUpNotes, summarizeNotes };