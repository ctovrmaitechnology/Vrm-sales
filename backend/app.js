const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const routes = require('./routes/index');
const linkedinRoutes = require('./routes/linkedinRoutes');
const companyRoutes = require('./routes/companyRoutes');

const { runFollowUpEmailCheck } = require('./services/followUpService');
const { runWhatsAppReplyFollowUpCheck } = require('./services/whatsappReplyFollowUpService');
const { runAutoCallCheck } = require('./services/autoCallService');
const {
  isFollowUpCheckRunning,
  setFollowUpCheckRunning,
} = require('./controllers/emailController');

const app = express();
const prisma = require('./prismaClient');
const PORT = process.env.PORT || 5002;

// Reverse proxy support
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Company routes
app.use('/api/companies', companyRoutes);

// Master API routes
app.use('/api', routes);

// LinkedIn routes
app.use('/linkedin-api', linkedinRoutes);

// Follow-up cron configuration
const DEFAULT_FOLLOW_UP_CRON_SCHEDULE = '0 10,18 * * *';

const FOLLOW_UP_CRON_SCHEDULE = cron.validate(
  process.env.FOLLOW_UP_CRON_SCHEDULE || ''
)
  ? process.env.FOLLOW_UP_CRON_SCHEDULE
  : DEFAULT_FOLLOW_UP_CRON_SCHEDULE;

const FOLLOW_UP_CRON_TIMEZONE =
  process.env.FOLLOW_UP_CRON_TIMEZONE || 'Asia/Kolkata';

let lastFollowUpCronRunKey = '';




if (process.env.ENABLE_FOLLOW_UP_CRON === 'true') {
  cron.schedule(
    FOLLOW_UP_CRON_SCHEDULE,
    async () => {
      const now = new Date();
      const runKey = now.toISOString().slice(0, 16);

      if (lastFollowUpCronRunKey === runKey) {
        console.log(
          'Follow-up cron skipped: already ran this minute'
        );
        return;
      }

      if (isFollowUpCheckRunning()) {
        console.log(
          'Follow-up cron skipped: check already running'
        );
        return;
      }

      lastFollowUpCronRunKey = runKey;
      setFollowUpCheckRunning(true);

      try {
        await runFollowUpEmailCheck();
      } catch (error) {
        console.error('Follow-up cron error:', error);
      } finally {
        setFollowUpCheckRunning(false);
      }
    },
    {
      timezone: FOLLOW_UP_CRON_TIMEZONE,
    }
  );
} else {
  console.log(
    'Automatic follow-up cron disabled. Use /api/follow-ups/check to run follow-ups manually.'
  );
}

// WhatsApp reply follow-up: the webhook/button-click routes already trigger
// this immediately when a reply comes in, but that depends on Meta's webhook
// actually reaching this server. As a continuous safety net (not just a
// periodic cron tick), also run it on a tight interval so any reply that
// slipped through still gets caught within seconds, not minutes.
const WHATSAPP_REPLY_FOLLOWUP_INTERVAL_SECONDS = Number(
  process.env.WHATSAPP_REPLY_FOLLOWUP_INTERVAL_SECONDS
) || 10;

let whatsappReplyFollowUpRunning = false;

async function checkWhatsAppReplyFollowUps() {
  if (whatsappReplyFollowUpRunning) return;
  whatsappReplyFollowUpRunning = true;
  try {
    const result = await runWhatsAppReplyFollowUpCheck();
    if (result.sent) {
      console.log(`[WA Reply Follow-up] Checked ${result.checked} conversation(s), sent ${result.sent}.`);
    }
  } catch (error) {
    console.error('[WA Reply Follow-up] Continuous check error:', error.message);
  } finally {
    whatsappReplyFollowUpRunning = false;
  }
}

if (process.env.ENABLE_WHATSAPP === 'true') {
  setInterval(checkWhatsAppReplyFollowUps, WHATSAPP_REPLY_FOLLOWUP_INTERVAL_SECONDS * 1000);
}
// Automatic AI calls for WhatsApp clickers: 9, 11, 1, 3, 5 and 7 (India time)
cron.schedule('0 9,11,13,15,17,19 * * *', async () => {    try {
      const result = await runAutoCallCheck();
      console.log('[AutoCall] Check finished:', result);
    } catch (err) {
      console.error('[AutoCall] Check failed:', err.message);
    }
  },
  { timezone: 'Asia/Kolkata' }
);
// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`${signal} received. Closing server...`);

  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('Database connection closed.');
      process.exit(0);
    } catch (error) {
      console.error('Shutdown error:', error.message);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
