const express = require('express');
const router = express.Router();

const emailRoutes = require('./emailRoutes');
const leadRoutes = require('./leadRoutes');
const trackingRoutes = require('./trackingRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const systemRoutes = require('./systemRoutes');
const companyRoutes = require('./companyRoutes');
const usersRoutes = require('./usersRoutes');
const whatsappRoutes = require('./whatsappRoutes');
const categoryRoutes = require('./categoryRoutes');
const insightsRoutes = require('./insightsRoutes');
const callRoutes = require('./callRoutes');
const RocketReachroutes = require('./RocketReachroutes');
const teamRoutes = require('./teamRoutes');
const authRoutes = require('./authRoutes');
const { authGate } = require('../middleware/auth');

// Every /api request needs a valid login except the public addresses listed in middleware/auth.js
router.use(authGate);
router.use('/auth', authRoutes);
router.use('/', emailRoutes);
router.use('/', leadRoutes);
router.use('/', trackingRoutes);
router.use('/', dashboardRoutes);
router.use('/', systemRoutes);
router.use('/', categoryRoutes);
router.use('/companies', companyRoutes);
router.use('/users', usersRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/insights', insightsRoutes);
router.use('/calls', callRoutes);
router.use('/rocketreach', RocketReachroutes);
router.use('/teams', teamRoutes);
router.use('/auth', authRoutes);
module.exports = router;
