(function () {
  'use strict';
  const logic = window.GameLogic, config = logic.CONFIG;
  const canvas = document.getElementById('game'), ctxRenderer = window.GameRenderer.create(canvas);
  const startScreen = document.getElementById('start-screen'), gameoverScreen = document.getElementById('gameover-screen'), hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score'), bestEl = document.getElementById('best'), finalScore = document.getElementById('final-score'), finalBest = document.getElementById('final-best'), newRecord = document.getElementById('new-record');
  const startBtn = document.getElementById('start-btn'), restartBtn = document.getElementById('restart-btn'), muteBtn = document.getElementById('mute-btn');
  const storage = logic.getSafeStorage(() => window.localStorage), highScores = logic.createHighScoreStore(storage);
  let best = highScores.load(), state = null, mode = 'start', keys = new Set(), targetX = null, pointerId = null, elapsedVisual = 0, previous = 0, gameoverAt = 0;
  bestEl.textContent = String(best);
  function updateMuteButton() { const muted = window.GameAudio.isMuted(); muteBtn.setAttribute('aria-pressed', String(muted)); muteBtn.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기'); muteBtn.textContent = muted ? '♪̸' : '♪'; }
  updateMuteButton();
  function startGame() {
    window.GameAudio.unlock(); state = logic.createGame(); mode = 'playing'; keys.clear(); targetX = null;
    startScreen.hidden = true; gameoverScreen.hidden = true; hud.hidden = false; scoreEl.textContent = '0'; bestEl.textContent = String(best); window.GameAudio.start();
  }
  function finishGame() {
    mode = 'over'; keys.clear(); targetX = null; gameoverAt = performance.now();
    const result = highScores.submit(state.score); best = result.best;
    finalScore.textContent = String(state.score); finalBest.textContent = String(best); bestEl.textContent = String(best); newRecord.hidden = !result.isNew;
    hud.hidden = true; gameoverScreen.hidden = false; window.GameAudio.collision(); if (result.isNew) window.GameAudio.record();
  }
  function pointerX(event) { const rect = canvas.getBoundingClientRect(); return (event.clientX - rect.left) * config.WORLD_WIDTH / rect.width; }
  function muteTarget(target) { return target === muteBtn || muteBtn.contains(target); }
  window.addEventListener('pointerdown', () => window.GameAudio.unlock(), { once: false });
  window.addEventListener('keydown', () => window.GameAudio.unlock(), { once: false });
  muteBtn.addEventListener('click', () => { window.GameAudio.setMuted(!window.GameAudio.isMuted()); updateMuteButton(); });
  startBtn.addEventListener('click', startGame); restartBtn.addEventListener('click', () => { if (performance.now() - gameoverAt >= 400) startGame(); });
  startScreen.addEventListener('pointerdown', event => { if (event.target !== startBtn && !muteTarget(event.target) && mode === 'start') startGame(); });
  canvas.addEventListener('pointerdown', event => {
    if (muteTarget(event.target)) return;
    if (mode === 'start') { startGame(); return; }
    if (mode !== 'playing') return;
    pointerId = event.pointerId; targetX = pointerX(event); try { canvas.setPointerCapture(pointerId); } catch (_) {}
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => { if (mode === 'playing' && pointerId === event.pointerId) { targetX = pointerX(event); event.preventDefault(); } });
  function releasePointer(event) { if (pointerId === event.pointerId) { try { if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); } catch (_) {} pointerId = null; targetX = null; } }
  canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer); canvas.addEventListener('lostpointercapture', releasePointer);
  window.addEventListener('keydown', event => {
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') { if (mode === 'playing') event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyA' || event.code === 'KeyD') keys.add(event.code);
    if (event.code === 'Enter' && !event.repeat) {
      if (event.target === muteBtn || event.target === startBtn || event.target === restartBtn) return;
      if (mode === 'start') startGame(); else if (mode === 'over' && performance.now() - gameoverAt >= 400) startGame();
    }
  });
  window.addEventListener('keyup', event => { keys.delete(event.code); });
  window.addEventListener('blur', () => { keys.clear(); pointerId = null; targetX = null; });
  document.addEventListener('visibilitychange', () => { previous = 0; keys.clear(); });
  document.addEventListener('gesturestart', event => event.preventDefault());
  document.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  function frame(now) {
    if (!previous) previous = now;
    const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now; elapsedVisual += dt;
    if (mode === 'playing') {
      const left = keys.has('ArrowLeft') || keys.has('KeyA'), right = keys.has('ArrowRight') || keys.has('KeyD');
      state = logic.stepGame(state, dt, { direction: left === right ? 0 : left ? -1 : 1, targetX });
      scoreEl.textContent = String(state.score); bestEl.textContent = String(Math.max(best, state.score));
      if (state.over) finishGame();
    }
    ctxRenderer.draw(state, elapsedVisual, mode === 'playing');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
