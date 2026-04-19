export function notFound(_req, res) {
  res.status(404).json({ ok: false, message: 'Route not found' });
}
