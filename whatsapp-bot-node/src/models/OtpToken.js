const mongoose = require('mongoose');

const OtpTokenSchema = new mongoose.Schema(
  {
    userPhone: { type: String, required: true, index: true },
    emergencyPhone: { type: String, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    consumedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

OtpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OtpToken', OtpTokenSchema);
