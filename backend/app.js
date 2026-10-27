
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const routes = require('./routes/index');
const linkedinRoutes = require('./routes/linkedinRoutes');
const companyRoutes = require('./routes/companyRoutes');

const { runFollowUpEmailCheck } = require('./services/followUpService');
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
