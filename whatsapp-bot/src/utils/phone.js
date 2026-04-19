export function normalizePhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/[^\d]/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Phone number must be between 10 and 15 digits');
  }
  return digits;
}
