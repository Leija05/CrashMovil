const mongoose = require('mongoose');

const EventLogSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true },
    userPhone: { type: String, index: true },
    emergencyPhone: { type: String, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, default: 'ok' },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EventLog', EventLogSchema);
