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

router.use('/', emailRoutes);
router.use('/', leadRoutes);
router.use('/', trackingRoutes);
router.use('/', dashboardRoutes);
router.use('/', systemRoutes);
router.use('/', categoryRoutes);
router.use('/companies', companyRoutes);
router.use('/users', usersRoutes);
router.use('/whatsapp', whatsappRoutes);

module.exports = router;
