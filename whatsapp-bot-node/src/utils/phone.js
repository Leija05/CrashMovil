function normalizePhone(phone) {
  if (!phone) return '';
  const onlyDigits = String(phone).replace(/[^\d+]/g, '');
  if (onlyDigits.startsWith('+')) return onlyDigits;
  return `+${onlyDigits}`;
}

function isLikelyE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

module.exports = { normalizePhone, isLikelyE164 };
