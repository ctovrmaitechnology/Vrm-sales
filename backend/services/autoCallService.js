const prisma = require('../prismaClient');
const vapiService = require('./vapiService');

const DELAY_MINUTES = Number(process.env.AUTO_CALL_DELAY_MINUTES) || 30;
const GAP_SECONDS = Number(process.env.AUTO_CALL_GAP_SECONDS) || 120;
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

async function runAutoCallCheck() {
  if (process.env.ENABLE_AUTO_CALL_ON_CLICK !== 'true') {
    return { checked: 0, called: 0, skipped: 'disabled' };
  }
  if (running) return { checked: 0, called: 0, skipped: 'already_running' };
  running = true;
  try {
    const cutoff = new Date(Date.now() - DELAY_MINUTES * 60 * 1000);
    const due = await prisma.whatsAppLeads.findMany({
      where: {
        clicked_at: { not: null, lte: cutoff },
        OR: [{ video_click_count: { gt: 0 } }, { demo_click_count: { gt: 0 } }],
        auto_call_status: null,
        whatsapp_number: { not: null },
      },
      orderBy: { clicked_at: 'asc' },
    });

    let called = 0;
    for (const wa of due) {
      const key = last10(wa.whatsapp_number);
      if (!key) continue;

      const [lead, history] = await Promise.all([
        prisma.leads.findFirst({
          where: { OR: [{ phone_number: { endsWith: key } }, { whatsapp_number: { endsWith: key } }] },
          select: { id: true, full_name: true, is_called: true, status: true },
        }),
        prisma.call_history.findFirst({
          where: { phone_number: { endsWith: key } },
          select: { id: true },
        }),
      ]);

      // Already called: do not call again, just mark them as called
      if (lead?.is_called || history) {
        if (lead && !lead.is_called) {
          await prisma.leads.update({
            where: { id: lead.id },
            data: { is_called: true, called_at: new Date(), updated_at: new Date() },
          });
        }
        await prisma.whatsAppLeads.update({
          where: { id: wa.id },
          data: { auto_call_status: 'already_called', auto_call_at: new Date() },
        });
        continue;
      }

      // Already converted: no call needed
      if (lead?.status === 'converted_to_lead') {
        await prisma.whatsAppLeads.update({
          where: { id: wa.id },
          data: { auto_call_status: 'skipped', auto_call_at: new Date() },
        });
        continue;
      }

      const digits = String(wa.whatsapp_number).replace(/\D/g, '');
      const e164 = digits.length === 10 ? `+91${digits}` : `+${digits}`;
      const name = wa.name || lead?.full_name || null;
      let vapiCallId = null;
      let ok = true;
      try {
        const result = await vapiService.startCall({ phone: e164, name });
        vapiCallId = result?.id || result?.callId || null;
      } catch (err) {
        ok = false;
        console.error(`[AutoCall] VAPI error for ${e164}:`, err?.message);
      }

      await prisma.call_history.create({
        data: {
          vapi_call_id: vapiCallId,
          lead_id: lead?.id || null,
          phone_number: e164,
          contact_name: name,
          contact_type: lead ? 'lead' : 'whatsapp_lead',
          status: ok ? 'ringing' : 'failed',
          trigger_source: 'auto_click',
        },
      });
      await prisma.whatsAppLeads.update({
        where: { id: wa.id },
        data: { auto_call_status: ok ? 'called' : 'failed', auto_call_at: new Date() },
      });
      if (ok && lead) {
        await prisma.leads.update({
          where: { id: lead.id },
          data: { is_called: true, called_at: new Date(), updated_at: new Date() },
        });
      }
      if (ok) called++;

      await sleep(GAP_SECONDS * 1000); // gap between calls
    }
    return { checked: due.length, called };
  } finally {
    running = false;
  }
}

module.exports = { runAutoCallCheck };