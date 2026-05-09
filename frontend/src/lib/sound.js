// Web Audio API alert sound — synthesized, no external assets.

let _ctx = null;
function ctx() {
  if (!_ctx) {
    const Klass = window.AudioContext || window.webkitAudioContext;
    if (!Klass) return null;
    _ctx = new Klass();
  }
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

/** Two-tone klaxon: alternating 880Hz / 660Hz square waves with envelope. */
export function playCriticalAlert({ duration = 1.6 } = {}) {
  const ac = ctx();
  if (!ac) return;
  const now = ac.currentTime;

  const master = ac.createGain();
  master.gain.value = 0.001;
  master.connect(ac.destination);
  master.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const beep = (freq, start, len) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    g.gain.value = 0.001;
    osc.connect(g);
    g.connect(master);
    g.gain.exponentialRampToValueAtTime(0.7, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + len);
    osc.start(start);
    osc.stop(start + len + 0.05);
  };

  let t = now;
  for (let i = 0; i < 3; i++) {
    beep(880, t, 0.18);
    beep(660, t + 0.2, 0.18);
    t += 0.45;
  }
}

/** Soft confirm chime when acknowledging. */
export function playAck() {
  const ac = ctx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.exponentialRampToValueAtTime(990, now + 0.18);
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.35);
}
