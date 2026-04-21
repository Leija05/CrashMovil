const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    userPhone: { type: String, required: true, unique: true, index: true },
    emergencyPhone: { type: String, required: true },
    verified: { type: Boolean, default: false, index: true },
    verifiedAt: { type: Date },
    verificationRetries: { type: Number, default: 0 },
    blockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
