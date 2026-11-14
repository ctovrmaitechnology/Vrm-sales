const { PrismaClient } = require('@prisma/client');
const prisma = require('../prismaClient');
const { getFollowUpLeads, getLeadByEmail, updateEmailLeadStatus, updateUnifiedLeadStatus, updateUnifiedLeadEmailStatus, recordEmailHistory } = require('../unifiedDb');
const { sendFollowUp1, sendFollowUp2, sendFollowUp3 } = require('./emailService');

let lastFollowUpDbWarningAt = 0;

const DAY_MS = 1000 * 60 * 60 * 24;
const FOLLOW_UP_DAYS = [7, 15, 30]; // same delays as the original follow-up logic
const RETRY_AFTER_FAILURE_MS = 12 * 60 * 60 * 1000;

// Follow-up emails for leads whose status was set to Interested in the Leads page.
// Day 7 / 15 / 30 are counted from interested_at. Email only.
async function runInterestedLeadFollowUps() {
  const now = new Date();
  const result = { success: true, checked: 0, sent: 0, failed: 0 };

  const leads = await prisma.leads.findMany({
    where: { lead_status: 'interested', interested_at: { not: null }, email: { not: null } },
    select: { id: true, full_name: true, email: true, interested_at: true }
  });

  for (const lead of leads) {
    result.checked++;
    if (!lead.email || !lead.email.includes('@')) continue;

    const history = await prisma.email_history.findMany({
      where: { lead_id: lead.id, event_type: { in: ['follow_up_1', 'follow_up_2', 'follow_up_3'] } },
      select: { event_type: true, status: true, attempted_at: true }
    });
    const sentCount = history.filter((h) => h.status === 'sent').length;
    if (sentCount >= FOLLOW_UP_DAYS.length) continue;

    const nextNumber = sentCount + 1;
    const dueAt = new Date(lead.interested_at).getTime() + FOLLOW_UP_DAYS[sentCount] * DAY_MS;
    if (now.getTime() < dueAt) continue;

    const eventType = `follow_up_${nextNumber}`;
    const lastFailure = history
      .filter((h) => h.event_type === eventType && h.status === 'failed' && h.attempted_at)
      .map((h) => new Date(h.attempted_at).getTime())
      .sort((a, b) => b - a)[0];
    if (lastFailure && now.getTime() - lastFailure < RETRY_AFTER_FAILURE_MS) continue;

    const target = { name: lead.full_name || '', email: lead.email, product_type: null };
    try {
      const sender = [sendFollowUp1, sendFollowUp2, sendFollowUp3][nextNumber - 1];
      const brevoResult = await sender(target);
      await recordEmailHistory({ email: lead.email, status: 'sent', eventType, attemptNumber: nextNumber, providerMessageId: brevoResult?.messageId || null });
      result.sent++;
    } catch (error) {
      result.failed++;
      console.error(`Interested follow-up ${nextNumber} failed for lead ${lead.id}:`, error.message);
      try {
        await recordEmailHistory({ email: lead.email, status: 'failed', eventType, attemptNumber: nextNumber, errorMessage: error.message });
      } catch (historyError) {
        console.error('Failed to record follow-up failure:', historyError.message);
      }
    }
  }

  console.log(`Interested follow-ups: checked=${result.checked} sent=${result.sent} failed=${result.failed}`);
  return result;
}

async function runFollowUpEmailCheck() {
  return runInterestedLeadFollowUps();

  try {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (dbError) {
      const nowMs = Date.now();
      if (nowMs - lastFollowUpDbWarningAt > 5 * 60 * 1000) {
        console.log(
          "Follow-up check skipped: database unavailable"
        );
        lastFollowUpDbWarningAt = nowMs;
      }
      return {
        success: false,
        skipped: true,
        reason: "database_unavailable"
      };
    }

    const now = new Date();
    let checked = 0;
    let eligible = 0;
    let sent = 0;
    let failed = 0;

    // Find users who received initial email but haven't clicked
    const followUpUsers = await getFollowUpLeads();

    for (let user of followUpUsers) {
      checked++;
      user = await getLeadByEmail(user.email);

      if (
        !user ||
        user.unsubscribeStatus ||
        user.isDeleted ||
        !['sent', 'clicked'].includes(user.Status) ||
        !user.initialEmailSentAt ||
        user.Status === 'converted_to_lead' ||
        user.Status === 'follow_up_sent'
      ) {
        continue;
      }

      const timeSinceInitial = now - new Date(user.initialEmailSentAt);
      const dayMs = 1000 * 60 * 60 * 24;

      let sendFollowUp = null;

      // Day 7 Follow-up
      if (!user.followUp1Sent && timeSinceInitial >= (7 * dayMs)) {
        sendFollowUp = "1";
      }
      // Day 15 Follow-up
      else if (user.followUp1Sent && !user.followUp2Sent && timeSinceInitial >= (15 * dayMs)) {
        sendFollowUp = "2";
      }
      // Day 30 Follow-up
      else if (user.followUp1Sent && user.followUp2Sent && !user.followUp3Sent && timeSinceInitial >= (30 * dayMs)) {
        sendFollowUp = "3";
      }

      if (!sendFollowUp) {
        continue;
      }

      eligible++;

      let brevoResult;
      const eventType = `follow_up_${sendFollowUp}`;
      try {
        user = await getLeadByEmail(user.email);

        if (
          !user ||
          user.unsubscribeStatus ||
          user.isDeleted ||
          !['sent', 'clicked'].includes(user.Status) ||
          user.Status === 'converted_to_lead' ||
          user.Status === 'follow_up_sent'
        ) {
          console.log(`Follow-up ${sendFollowUp} skipped for ${user?.email || 'unknown'} - lead no longer eligible`);
          continue;
        }

        if (
          (sendFollowUp === "1" && user.followUp1Sent) ||
          (sendFollowUp === "2" && user.followUp2Sent) ||
          (sendFollowUp === "3" && user.followUp3Sent)
        ) {
          console.log(`Follow-up ${sendFollowUp} skipped for ${user.email} - already sent`);
          continue;
        }

        if (sendFollowUp === "1") {
          brevoResult = await sendFollowUp1(user);
          try {
            await recordEmailHistory({ email: user.email, status: 'sent', eventType, providerMessageId: brevoResult?.messageId || null });
          } catch (historyError) {
            console.error(`Failed to record follow-up history for ${user.email}:`, historyError.message);
          }
          await updateUnifiedLeadEmailStatus(user.email, "sent");
          if (!user.isEmailLead) {
             await updateUnifiedLeadStatus(user, "email", "sent", "follow_up_1_sent", { followUp1Sent: true, lastEmailSentAt: new Date() });
          }
        } else if (sendFollowUp === "2") {
          brevoResult = await sendFollowUp2(user);
          try {
            await recordEmailHistory({ email: user.email, status: 'sent', eventType, providerMessageId: brevoResult?.messageId || null });
          } catch (historyError) {
            console.error(`Failed to record follow-up history for ${user.email}:`, historyError.message);
          }
          await updateUnifiedLeadEmailStatus(user.email, "sent");
          if (!user.isEmailLead) {
             await updateUnifiedLeadStatus(user, "email", "sent", "follow_up_2_sent", { followUp2Sent: true, lastEmailSentAt: new Date() });
          }
        } else if (sendFollowUp === "3") {
          brevoResult = await sendFollowUp3(user);
          try {
            await recordEmailHistory({ email: user.email, status: 'sent', eventType, providerMessageId: brevoResult?.messageId || null });
          } catch (historyError) {
            console.error(`Failed to record follow-up history for ${user.email}:`, historyError.message);
          }
          await updateUnifiedLeadEmailStatus(user.email, "sent");
          if (!user.isEmailLead) {
             await updateUnifiedLeadStatus(user, "email", "sent", "follow_up_3_sent", { followUp3Sent: true, lastEmailSentAt: new Date() });
          }

          const latestLead = await getLeadByEmail(user.email);
          if (latestLead && ['sent', 'clicked'].includes(latestLead.Status)) {
            await updateUnifiedLeadEmailStatus(user.email, "follow_up_sent");
            if (!user.isEmailLead) {
               await updateUnifiedLeadStatus(latestLead, "email", "follow_up_sent", "follow_up_completed", { followUpCompleted: true });
            }
          }
        }

        console.log(
          `Follow-up ${sendFollowUp} sent to ${user.email} (Message ID: ${brevoResult?.messageId || "accepted"})`
        );

        sent++;

      } catch (error) {
        failed++;
        if (!brevoResult) {
          try {
            await recordEmailHistory({
              email: user.email,
              status: 'failed',
              eventType,
              errorMessage: error.message
            });
          } catch (historyError) {
            console.error(`Failed to record follow-up failure for ${user.email}:`, historyError.message);
          }
        }
        console.log(
          `Follow-up ${sendFollowUp} failed for ${user.email}: ${error.message}`
        );
      }
    }

    console.log(
      `Follow-up check finished. Checked: ${checked}, Eligible: ${eligible}, Sent: ${sent}, Failed: ${failed}`
    );

    return {
      success: true,
      checked,
      eligible,
      sent,
      failed
    };

  } catch (error) {
    console.log(
      "Follow-up check error:",
      error.message
    );
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  runFollowUpEmailCheck
};
