// Follow-up reminder emails (daily 10:00 AM summary, 1-hour-before, Critical highlight).
// Reads follow-ups from the leads table, sends via Brevo and logs every reminder in
// followup_reminders (pending / sent / failed). Does not touch campaign emails or the
// automated follow-up sequences.
const prisma = require('../prismaClient');
const { SENDER_EMAIL } = require('../utils/config');
const { escapeHtml } = require('../utils/helpers');

const TZ_OFFSET = '+05:30'; // Asia/Kolkata (no DST)
const DAILY_HOUR = Number(process.env.REMINDER_DAILY_HOUR || 10);
const DAILY_CATCHUP_MIN = 60; // if the server was down at 10:00, still send until 11:00
const BEFORE_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const STALE_PENDING_MS = 10 * 60 * 1000;
const CRITICAL_ALSO_REGULAR = process.env.REMINDER_CRITICAL_ALSO_REGULAR === 'true';
const PRIORITY_ORDER = { Critical: 0, Active: 1, Nurture: 2 };

const istParts = (d = new Date()) => {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
  return { date: `${f.year}-${f.month}-${f.day}`, hour: Number(f.hour) % 24, minute: Number(f.minute) };
};
const addDays = (dateStr, n) => new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const scheduledAt = (dateStr, time) => new Date(`${dateStr}T${time}:00${TZ_OFFSET}`);
const dateStr = (d) => new Date(d).toISOString().slice(0, 10);
const prettyDate = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const prettyTime = (t) => {
  if (!t) return 'No time set';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'} IST`;
};

// Caller first, else owner (same rule as follow-up counts in reports).
function recipientOf(lead) {
  const u = (lead.called_by && lead.called_by.email ? lead.called_by : null) || lead.owner;
  if (!u || !u.email || !u.email.includes('@') || u.is_active === false) return null;
  const id = lead.called_by && lead.called_by.email ? lead.called_by_user_id : lead.user_id;
  return { id, email: u.email, name: u.employee_name || 'there' };
}

const LEAD_SELECT = {
  id: true, full_name: true, company_name: true, phone_number: true, whatsapp_number: true,
  followup_date: true, followup_time: true, followup_priority: true, followup_note: true, followup_note_clean: true,
  user_id: true, called_by_user_id: true,
  owner: { select: { employee_name: true, email: true, is_active: true } },
  called_by: { select: { employee_name: true, email: true, is_active: true } },
};
const NOT_CONVERTED = [{ lead_status: null }, { lead_status: { not: 'converted' } }];

// ---- email sending (Resend) ----
let lastResendAt = 0;
async function sendHtmlEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  // Resend allows about 2 requests per second: keep a small gap between mails
  const wait = 600 - (Date.now() - lastResendAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastResendAt = Date.now();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || `VRM Team <${SENDER_EMAIL}>`,
      to: [to],
      reply_to: SENDER_EMAIL,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

// ---- duplicate protection + logging ----
async function claim(key, base) {
  try {
    await prisma.followup_reminders.create({ data: { dedupe_key: key, status: 'pending', attempts: 1, ...base } });
    return true;
  } catch (e) {
    if (e.code !== 'P2002') throw e;
  }
  const existing = await prisma.followup_reminders.findUnique({ where: { dedupe_key: key } });
  if (!existing || existing.status === 'sent' || existing.attempts >= MAX_ATTEMPTS) return false;
  const recentPending = existing.status === 'pending' && Date.now() - new Date(existing.updated_at).getTime() < STALE_PENDING_MS;
  if (recentPending) return false; // another run is sending it right now
  const res = await prisma.followup_reminders.updateMany({
    where: { id: existing.id, attempts: existing.attempts, status: existing.status },
    data: { status: 'pending', attempts: existing.attempts + 1, updated_at: new Date() },
  });
  return res.count === 1;
}
async function deliver(key, base, mail) {
  if (!(await claim(key, base))) return false;
  try {
    await sendHtmlEmail(mail);
    await prisma.followup_reminders.update({ where: { dedupe_key: key }, data: { status: 'sent', sent_at: new Date(), error: null, updated_at: new Date() } });
    return true;
  } catch (err) {
    console.error(`Reminder ${key} failed:`, err.message);
    await prisma.followup_reminders.update({ where: { dedupe_key: key }, data: { status: 'failed', error: String(err.message).slice(0, 500), updated_at: new Date() } });
    return false;
  }
}

// ---- email bodies ----
const shell = (banner, inner) => `<html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;margin:0;padding:20px;">${banner}${inner}<p style="color:#888;font-size:12px;margin-top:24px;">Sent automatically by VRM Sales Agent. Times are in IST.</p></body></html>`;
const chip = (p) => {
  const c = p === 'Critical' ? '#b91c1c' : p === 'Nurture' ? '#0f766e' : '#1d4ed8';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:10px;background:${c};color:#fff;font-size:12px;font-weight:bold;">${escapeHtml(p || 'Active')}</span>`;
};
const noteOf = (l) => escapeHtml(l.followup_note_clean || l.followup_note || '—');
const phoneOf = (l) => escapeHtml(l.phone_number || l.whatsapp_number || '—');

function leadCard(l, critical) {
  const pr = l.followup_priority || 'Active';
  return `<table style="border-collapse:collapse;width:100%;max-width:560px;border:${critical ? '2px solid #b91c1c' : '1px solid #ddd'};">
  <tr><td style="padding:8px;color:#666;width:130px;">Lead</td><td style="padding:8px;"><b>${escapeHtml(l.full_name)}</b></td></tr>
  <tr><td style="padding:8px;color:#666;">Company</td><td style="padding:8px;">${escapeHtml(l.company_name || '—')}</td></tr>
  <tr><td style="padding:8px;color:#666;">Phone</td><td style="padding:8px;">${phoneOf(l)}</td></tr>
  <tr><td style="padding:8px;color:#666;">Scheduled</td><td style="padding:8px;"><b>${prettyDate(dateStr(l.followup_date))}, ${prettyTime(l.followup_time)}</b></td></tr>
  <tr><td style="padding:8px;color:#666;">Priority</td><td style="padding:8px;">${chip(pr)}</td></tr>
  <tr><td style="padding:8px;color:#666;vertical-align:top;">Notes</td><td style="padding:8px;">${noteOf(l)}</td></tr></table>`;
}

function dailyMail(rcpt, leads, date) {
  const rows = leads.map((l) => `<tr>
    <td style="padding:8px;border:1px solid #ddd;white-space:nowrap;">${prettyTime(l.followup_time)}</td>
    <td style="padding:8px;border:1px solid #ddd;"><b>${escapeHtml(l.full_name)}</b><br>${escapeHtml(l.company_name || '')}<br>${phoneOf(l)}</td>
    <td style="padding:8px;border:1px solid #ddd;">${chip(l.followup_priority || 'Active')}</td>
    <td style="padding:8px;border:1px solid #ddd;">${noteOf(l)}</td></tr>`).join('');
  return {
    subject: `Your follow-ups for today (${leads.length}) – ${prettyDate(date)}`,
    html: shell('', `<p>Hi ${escapeHtml(rcpt.name)},</p><p>You have <b>${leads.length}</b> follow-up${leads.length > 1 ? 's' : ''} scheduled for today, ${prettyDate(date)}:</p>
    <table style="border-collapse:collapse;width:100%;"><tr style="background:#f1f5f9;"><th style="padding:8px;border:1px solid #ddd;text-align:left;">Time</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">Lead</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">Priority</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">Notes</th></tr>${rows}</table>`),
  };
}
function oneHourMail(rcpt, l) {
  return { subject: `Reminder: follow-up with ${l.full_name} at ${prettyTime(l.followup_time)}`,
    html: shell('', `<p>Hi ${escapeHtml(rcpt.name)},</p><p>Your follow-up starts in about 1 hour.</p>${leadCard(l, false)}`) };
}
function criticalMail(rcpt, l) {
  const banner = `<div style="background:#b91c1c;color:#fff;padding:12px 16px;border-radius:6px;font-size:16px;font-weight:bold;margin-bottom:16px;">🔴 CRITICAL FOLLOW-UP IN 1 HOUR</div>`;
  return { subject: `🔴 CRITICAL: ${l.full_name} (${l.company_name || 'no company'}) at ${prettyTime(l.followup_time)}`,
    html: shell(banner, `<p>Hi ${escapeHtml(rcpt.name)},</p><p>This follow-up is marked <b style="color:#b91c1c;">Critical</b> (client meeting / important callback). Please be ready.</p>${leadCard(l, true)}`) };
}

// ---- jobs ----
async function sendDailySummaries(now = new Date()) {
  const { date, hour, minute } = istParts(now);
  const minutesSince = (hour - DAILY_HOUR) * 60 + minute;
  if (minutesSince < 0 || minutesSince >= DAILY_CATCHUP_MIN) return { skipped: true, sent: 0 };

  const leads = await prisma.leads.findMany({
    where: { followup_date: new Date(`${date}T00:00:00.000Z`), OR: NOT_CONVERTED },
    select: LEAD_SELECT,
  });
  const byUser = new Map();
  for (const l of leads) {
    // skip follow-ups whose date/time has already passed
    if (dateStr(l.followup_date) < date) continue;
    if (l.followup_time && scheduledAt(dateStr(l.followup_date), l.followup_time) < now) continue;
    const r = recipientOf(l);
    if (!r) continue;
    if (!byUser.has(r.id)) byUser.set(r.id, { r, leads: [] });
    byUser.get(r.id).leads.push(l);
  }
  let sent = 0;
  for (const { r, leads: list } of byUser.values()) {
    list.sort((a, b) => (a.followup_time || '99:99').localeCompare(b.followup_time || '99:99') ||
      (PRIORITY_ORDER[a.followup_priority] ?? 1) - (PRIORITY_ORDER[b.followup_priority] ?? 1));
    const mail = dailyMail(r, list, date);
    const ok = await deliver(`daily:${r.id}:${date}`,
      { reminder_type: 'daily', user_id: r.id, recipient_email: r.email, followup_date: new Date(`${date}T00:00:00.000Z`), scheduled_for: now },
      { to: r.email, toName: r.name, ...mail });
    if (ok) sent++;
  }
  return { skipped: false, users: byUser.size, sent };
}

async function sendBeforeReminders(now = new Date()) {
  const { date } = istParts(now);
  const leads = await prisma.leads.findMany({
    where: {
      followup_date: { in: [new Date(`${date}T00:00:00.000Z`), new Date(`${addDays(date, 1)}T00:00:00.000Z`)] },
      followup_time: { not: null }, OR: NOT_CONVERTED,
    },
    select: LEAD_SELECT,
  });
  let sent = 0;
  for (const l of leads) {
    if (!l.followup_time) continue;
    const at = scheduledAt(dateStr(l.followup_date), l.followup_time);
    const t = now.getTime();
    // due once we are within 1 hour of the start, until the follow-up time has passed
    if (t < at.getTime() - BEFORE_MS || t >= at.getTime()) continue;
    const r = recipientOf(l);
    if (!r) continue;
    const critical = l.followup_priority === 'Critical';
    const base = { user_id: r.id, lead_id: l.id, recipient_email: r.email, followup_date: l.followup_date, followup_time: l.followup_time, priority: l.followup_priority || 'Active', scheduled_for: at };
    const keySuffix = `${l.id}:${dateStr(l.followup_date)}:${l.followup_time}`;
    if (!critical || CRITICAL_ALSO_REGULAR) {
      if (await deliver(`1h:${keySuffix}`, { ...base, reminder_type: 'one_hour' }, { to: r.email, toName: r.name, ...oneHourMail(r, l) })) sent++;
    }
    if (critical) {
      if (await deliver(`critical:${keySuffix}`, { ...base, reminder_type: 'critical' }, { to: r.email, toName: r.name, ...criticalMail(r, l) })) sent++;
    }
  }
  return { checked: leads.length, sent };
}

// Manual trigger (Users page): send today's follow-up summary now to one user or to everyone.
async function sendManualSummaries(target, now = new Date()) {
  const { date } = istParts(now);
  const wanted = target === 'all' ? null : Number(target);
  if (wanted !== null && !Number.isInteger(wanted)) throw new Error('Invalid user.');

  const leads = await prisma.leads.findMany({
    where: { followup_date: new Date(`${date}T00:00:00.000Z`), OR: NOT_CONVERTED },
    select: LEAD_SELECT,
  });
  const byUser = new Map();
  let noEmail = 0;
  for (const l of leads) {
    if (l.followup_time && scheduledAt(dateStr(l.followup_date), l.followup_time) < now) continue; // already passed
    const r = recipientOf(l);
    if (!r) { noEmail++; continue; }
    if (wanted !== null && r.id !== wanted) continue;
    if (!byUser.has(r.id)) byUser.set(r.id, { r, leads: [] });
    byUser.get(r.id).leads.push(l);
  }
  let sent = 0;
  let failed = 0;
  for (const { r, leads: list } of byUser.values()) {
    list.sort((a, b) => (a.followup_time || '99:99').localeCompare(b.followup_time || '99:99') ||
      (PRIORITY_ORDER[a.followup_priority] ?? 1) - (PRIORITY_ORDER[b.followup_priority] ?? 1));
    const ok = await deliver(`manual:${r.id}:${date}:${now.getTime()}`,
      { reminder_type: 'manual', user_id: r.id, recipient_email: r.email, followup_date: new Date(`${date}T00:00:00.000Z`), scheduled_for: now },
      { to: r.email, toName: r.name, ...dailyMail(r, list, date) });
    if (ok) sent++; else failed++;
  }
  let message;
  if (wanted !== null && byUser.size === 0) {
    const u = await prisma.users.findUnique({ where: { id: wanted }, select: { email: true, employee_name: true } });
    message = !u ? 'User not found.' : !u.email ? `${u.employee_name} has no email saved, so no mail was sent.` : `${u.employee_name} has no pending follow-ups for today. No mail sent.`;
  } else if (byUser.size === 0) {
    message = 'No pending follow-ups for today. No mail sent.';
  } else {
    message = `Follow-up mail sent to ${sent} user${sent === 1 ? '' : 's'}${failed ? `, ${failed} failed (see followup_reminders log)` : ''}.`;
    if (wanted === null && noEmail) message += ` ${noEmail} follow-up${noEmail === 1 ? '' : 's'} skipped: assigned user has no email.`;
  }
  return { sent, failed, noEmail, message };
}

let running = false;
async function runFollowUpReminders(now = new Date()) {
  if (running) return { skipped: true };
  running = true;
  try {
    const daily = await sendDailySummaries(now);
    const before = await sendBeforeReminders(now);
    return { daily, before };
  } finally { running = false; }
}

module.exports = { runFollowUpReminders, sendDailySummaries, sendBeforeReminders, sendManualSummaries };