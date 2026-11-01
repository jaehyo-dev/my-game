(function (root) {
  'use strict';
  let context = null, muted = false;
  const storeKey = 'meteor-dodge.muted';
  const storage = root.GameLogic.getSafeStorage(() => root.localStorage);
  try { muted = storage ? storage.getItem(storeKey) === 'true' : false; } catch (_) { muted = false; }
  function unlock() {
    if (context) { if (context.state === 'suspended') context.resume().catch(() => {}); return; }
    const Audio = root.AudioContext || root.webkitAudioContext;
    if (!Audio) return;
    try { context = new Audio(); if (context.state === 'suspended') context.resume().catch(() => {}); } catch (_) { context = null; }
  }
  function tone(freq, duration, type, volume, delay, endFreq) {
    if (muted || !context) return;
    try {
      const now = context.currentTime + (delay || 0), osc = context.createOscillator(), gain = context.createGain();
      osc.type = type || 'square'; osc.frequency.setValueAtTime(freq, now);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume || .08, now + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain); gain.connect(context.destination); osc.start(now); osc.stop(now + duration + .02);
    } catch (_) {}
  }
  function setMuted(value) { muted = !!value; try { if (storage) storage.setItem(storeKey, String(muted)); } catch (_) {} }
  root.GameAudio = { unlock, setMuted, isMuted: () => muted, start: () => { tone(660, .09, 'square', .06); tone(880, .12, 'square', .06, .1); }, collision: () => { tone(220, .12, 'sawtooth', .1); tone(90, .28, 'square', .1, .11, 45); }, record: () => { tone(523, .1, 'square', .07); tone(659, .1, 'square', .07, .11); tone(784, .1, 'square', .07, .22); tone(1047, .2, 'square', .08, .33); } };
})(window);
