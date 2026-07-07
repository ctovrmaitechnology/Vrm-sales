const express = require('express');
const router = express.Router();

const emailRoutes = require('./emailRoutes');
const leadRoutes = require('./leadRoutes');
const trackingRoutes = require('./trackingRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const systemRoutes = require('./systemRoutes');

router.use('/', emailRoutes);
router.use('/', leadRoutes);
router.use('/', trackingRoutes);
router.use('/', dashboardRoutes);
router.use('/', systemRoutes);

module.exports = router;
