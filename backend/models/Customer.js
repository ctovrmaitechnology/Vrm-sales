const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  phoneNumber: { type: String },
  whatsappNumber: { type: String },
  company: { type: String },
  jobTitle: { type: String },
  industry: { type: String },
  region: { type: String },
  source: { type: String, default: 'Excel Import' },
  consentStatus: { type: Boolean, default: false },
  unsubscribeStatus: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Customer', CustomerSchema);
