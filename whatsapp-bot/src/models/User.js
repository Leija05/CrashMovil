import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    userPhone: { type: String, required: true, unique: true, index: true },
    emergencyPhone: { type: String, required: true },
    verified: { type: Boolean, default: false, index: true },
    verifiedAt: { type: Date },
    verificationAttempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
