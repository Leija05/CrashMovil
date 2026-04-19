import { Router } from 'express';
import { confirmOtp, registerUser, sendReport } from '../controllers/verificationController.js';
import { receiveWebhook, verifyWebhook } from '../controllers/webhookController.js';

export const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, service: 'whatsapp-bot' }));
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

router.post('/api/verification/register', registerUser);
router.post('/api/verification/confirm', confirmOtp);
router.post('/api/reports/send', sendReport);
