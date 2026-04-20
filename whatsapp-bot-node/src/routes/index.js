const express = require('express');
const { registerUser, verifyOtp } = require('../controllers/verificationController');
const { sendAutomatedReport } = require('../controllers/reportController');
const { verifyWebhook, receiveWebhook } = require('../controllers/webhookController');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'whatsapp-bot-node' });
});

router.post('/users/register', registerUser);
router.post('/users/verify-otp', verifyOtp);
router.post('/reports/send', sendAutomatedReport);

router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

module.exports = router;
