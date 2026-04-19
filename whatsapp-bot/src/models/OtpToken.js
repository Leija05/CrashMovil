import mongoose from 'mongoose';

const otpTokenSchema = new mongoose.Schema(
  {
    userPhone: { type: String, required: true, index: true },
    emergencyPhone: { type: String, required: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    consumedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

otpTokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const OtpToken = mongoose.model('OtpToken', otpTokenSchema);
