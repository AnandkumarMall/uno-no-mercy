// src/sounds.js
// Procedural sound effects using Web Audio API — no audio files needed.
// All sounds are synthesized in real-time.
//
// ⚠️  iOS Safari: AudioContext must be created (or resumed) inside a
// user-gesture handler. We lazy-init here — the first sound call always
// originates from a tap/click, so the context is created in that context.

let _ctx = null;

function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// ── Utility ───────────────────────────────────────────────

function playTone({ frequency = 440, type = 'sine', gain = 0.3, duration = 0.15, delay = 0, fadeOut = true }) {
  const ctx = getCtx();
  const osc      = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);

  gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
  gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.01);
  if (fadeOut) {
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
  }

  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.05);
}

// ── Sound Effects ─────────────────────────────────────────

export const sounds = {

  /** Card placed on discard pile */
  cardPlay() {
    playTone({ frequency: 800, type: 'triangle', gain: 0.25, duration: 0.08 });
    playTone({ frequency: 600, type: 'triangle', gain: 0.15, duration: 0.06, delay: 0.07 });
  },

  /** Card drawn from draw pile */
  cardDraw() {
    const ctx = getCtx();
    // Whoosh-like noise burst
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer     = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data       = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const source   = ctx.createBufferSource();
    source.buffer  = buffer;
    const gainNode = ctx.createGain();
    const filter   = ctx.createBiquadFilter();
    filter.type            = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value         = 0.5;
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    source.start();
    source.stop(ctx.currentTime + 0.15);
  },

  /** Cards being shuffled / dealt */
  shuffle() {
    for (let i = 0; i < 7; i++) {
      const delay = i * 0.06;
      playTone({ frequency: 500 + Math.random() * 300, type: 'triangle', gain: 0.15, duration: 0.05, delay });
    }
  },

  /** Player shouts UNO */
  uno() {
    // Rising dramatic chord
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      playTone({ frequency: freq, type: 'triangle', gain: 0.3, duration: 0.4, delay: i * 0.08 });
    });
  },

  /** Invalid move / error */
  invalid() {
    playTone({ frequency: 220, type: 'sawtooth', gain: 0.2, duration: 0.2 });
    playTone({ frequency: 180, type: 'sawtooth', gain: 0.2, duration: 0.15, delay: 0.1 });
  },

  /** Win fanfare */
  win() {
    const melody = [
      { f: 523,  d: 0.12, t: 0    },
      { f: 659,  d: 0.12, t: 0.13 },
      { f: 784,  d: 0.12, t: 0.26 },
      { f: 1047, d: 0.4,  t: 0.4  },
      { f: 784,  d: 0.12, t: 0.45 },
      { f: 1047, d: 0.6,  t: 0.6  },
    ];
    melody.forEach(({ f, d, t }) => {
      playTone({ frequency: f, type: 'triangle', gain: 0.35, duration: d, delay: t });
    });
  },

  /** Opponent plays a special card (reverse/skip/draw) */
  specialCard() {
    playTone({ frequency: 440, type: 'sine', gain: 0.2, duration: 0.1 });
    playTone({ frequency: 660, type: 'sine', gain: 0.25, duration: 0.15, delay: 0.08 });
  },

  /** Your turn starts */
  yourTurn() {
    playTone({ frequency: 880,  type: 'sine', gain: 0.2,  duration: 0.12 });
    playTone({ frequency: 1100, type: 'sine', gain: 0.15, duration: 0.1, delay: 0.14 });
  },

  /** New player joins lobby */
  playerJoin() {
    playTone({ frequency: 600, type: 'sine', gain: 0.15, duration: 0.1 });
    playTone({ frequency: 800, type: 'sine', gain: 0.15, duration: 0.12, delay: 0.12 });
  },

  /** Chat message received */
  chat() {
    playTone({ frequency: 1200, type: 'sine', gain: 0.1, duration: 0.08 });
  },
};
