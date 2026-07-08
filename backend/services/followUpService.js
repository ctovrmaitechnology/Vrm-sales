const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getFollowUpLeads, getLeadByEmail, updateEmailLeadStatus, updateUnifiedLeadStatus } = require('../unifiedDb');
const { sendFollowUp1, sendFollowUp2, sendFollowUp3 } = require('./emailService');

let lastFollowUpDbWarningAt = 0;

async function runFollowUpEmailCheck() {
  console.log("Checking follow-up emails...");

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

        let brevoResult;

        if (sendFollowUp === "1") {
          brevoResult = await sendFollowUp1(user);
          if (user.isEmailLead) {
             await updateEmailLeadStatus(user.email, "sent", "follow_up_1_sent");
          } else {
             await updateUnifiedLeadStatus(user, "email", "sent", "follow_up_1_sent", { followUp1Sent: true, lastEmailSentAt: new Date() });
          }
        } else if (sendFollowUp === "2") {
          brevoResult = await sendFollowUp2(user);
          if (user.isEmailLead) {
             await updateEmailLeadStatus(user.email, "sent", "follow_up_2_sent");
          } else {
             await updateUnifiedLeadStatus(user, "email", "sent", "follow_up_2_sent", { followUp2Sent: true, lastEmailSentAt: new Date() });
          }
        } else if (sendFollowUp === "3") {
          brevoResult = await sendFollowUp3(user);
          if (user.isEmailLead) {
             await updateEmailLeadStatus(user.email, "sent", "follow_up_3_sent");
          } else {
             await updateUnifiedLeadStatus(user, "email", "sent", "follow_up_3_sent", { followUp3Sent: true, lastEmailSentAt: new Date() });
          }

          const latestLead = await getLeadByEmail(user.email);
          if (latestLead && ['sent', 'clicked'].includes(latestLead.Status)) {
            if (user.isEmailLead) {
               await updateEmailLeadStatus(user.email, "follow_up_sent", "follow_up_completed");
            } else {
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
