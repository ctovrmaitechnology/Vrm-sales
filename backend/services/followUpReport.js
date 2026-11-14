// Follow-up numbers come from email_history (real follow-up emails sent), never from manual counts.
const prisma = require('../prismaClient');

const FOLLOW_UP_EVENTS = ['follow_up_1', 'follow_up_2', 'follow_up_3'];

// userIds: array of employee ids. Returns Maps keyed by user id.
async function getFollowUpCounts(userIds, dayStart, dayEnd) {
  if (!userIds.length) return { today: new Map(), total: new Map() };
  const base = { user_id: { in: userIds }, event_type: { in: FOLLOW_UP_EVENTS }, status: 'sent' };
  const [todayRows, totalRows] = await Promise.all([
    prisma.email_history.groupBy({
      by: ['user_id'],
      where: { ...base, sent_at: { gte: dayStart, lte: dayEnd } },
      _count: { _all: true },
    }),
    prisma.email_history.groupBy({
      by: ['user_id'],
      where: { ...base, sent_at: { lte: dayEnd } },
      _count: { _all: true },
    }),
  ]);
  return {
    today: new Map(todayRows.map((r) => [r.user_id, r._count._all])),
    total: new Map(totalRows.map((r) => [r.user_id, r._count._all])),
  };
}

// Follow-up notes saved between start and end, as Map(userId -> [cleaned note, ...]).
async function getFollowUpNotes(userIds, start, end) {
  const out = new Map();
  if (!userIds.length) return out;
  const rows = await prisma.leads.findMany({
    where: {
      user_id: { in: userIds },
      followup_note: { not: null },
      followup_set_at: { gte: start, lte: end },
    },
    select: { user_id: true, followup_note: true, followup_note_clean: true },
  });
  for (const r of rows) {
    const text = (r.followup_note_clean || r.followup_note || '').trim();
    if (!text) continue;
    if (!out.has(r.user_id)) out.set(r.user_id, []);
    out.get(r.user_id).push(text);
  }
  return out;
}

const normalize = (s) => s.toLowerCase().replace(/[.\s]+$/g, '').replace(/\s+/g, ' ');

// ["Asked for a meeting.", "asked for a meeting", "Callback at 5:30 PM."] ->
// "2 leads: Asked for a meeting. | 1 lead: Callback at 5:30 PM."
function summarizeNotes(notes = []) {
  const groups = new Map();
  for (const n of notes) {
    const k = normalize(n);
    if (!groups.has(k)) groups.set(k, { text: n.replace(/\s+$/, ''), count: 0 });
    groups.get(k).count++;
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .map((g) => `${g.count} ${g.count === 1 ? 'lead' : 'leads'}: ${/[.!?]$/.test(g.text) ? g.text : g.text + '.'}`)
    .join(' | ');
}

module.exports = { FOLLOW_UP_EVENTS, getFollowUpCounts, getFollowUpNotes, summarizeNotes };
