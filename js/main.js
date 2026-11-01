(function () {
  'use strict';

  // 게임 설정과 화면 요소를 한 번만 읽어 입력 및 프레임 처리에서 재사용한다.
  const logic = window.GameLogic;
  const config = logic.CONFIG;
  const canvas = document.getElementById('game');
  const ctxRenderer = window.GameRenderer.create(canvas);
  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const finalScore = document.getElementById('final-score');
  const finalBest = document.getElementById('final-best');
  const newRecord = document.getElementById('new-record');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');
  const muteBtn = document.getElementById('mute-btn');
  const captureTarget = document.documentElement;
  const storage = logic.getSafeStorage(() => window.localStorage);
  const highScores = logic.createHighScoreStore(storage);

  // 입력 상태를 분리해 키보드와 화면 어디서든 시작한 드래그를 함께 처리한다.
  let best = highScores.load();
  let state = null;
  let mode = 'start';
  let keys = new Set();
  let targetX = null;
  let pointerId = null;
  let elapsedVisual = 0;
  let previous = 0;
  let gameoverAt = 0;

  bestEl.textContent = String(best);

  // 음소거 상태와 설명을 한곳에서 갱신해 보조 기술에도 상태를 전달한다.
  function updateMuteButton() {
    const muted = window.GameAudio.isMuted();
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
    muteBtn.textContent = muted ? '🔇' : '♪';
  }

  updateMuteButton();

  // 오디오를 먼저 깨운 뒤 새 상태와 화면을 초기화한다.
  function startGame() {
    window.GameAudio.unlock();
    state = logic.createGame();
    mode = 'playing';
    keys.clear();
    targetX = null;
    pointerId = null;
    startScreen.hidden = true;
    gameoverScreen.hidden = true;
    hud.hidden = false;
    scoreEl.textContent = '0';
    bestEl.textContent = String(best);
    window.GameAudio.start();
  }

  // 결과를 저장하고 충돌 위치의 상태를 유지한 채 결과 화면을 표시한다.
  function finishGame() {
    mode = 'over';
    keys.clear();
    targetX = null;
    pointerId = null;
    gameoverAt = performance.now();
    const result = highScores.submit(state.score);
    best = result.best;
    finalScore.textContent = String(state.score);
    finalBest.textContent = String(best);
    bestEl.textContent = String(best);
    newRecord.hidden = !result.isNew;
    hud.hidden = true;
    gameoverScreen.hidden = false;
    window.GameAudio.collision();
    if (result.isNew) {
      window.GameAudio.record();
    }
  }

  // 포인터의 화면 좌표를 캔버스 기준 논리 좌표로 변환한다.
  function pointerX(event) {
    const rect = canvas.getBoundingClientRect();
    return (event.clientX - rect.left) * config.WORLD_WIDTH / rect.width;
  }

  // 음소거 버튼에서 시작한 포인터를 게임 조작에서 제외한다.
  function muteTarget(target) {
    return target === muteBtn || muteBtn.contains(target);
  }

  // 브라우저가 실제 사용자 입력으로 인정하는 여러 이벤트에서 오디오를 깨운다.
  window.addEventListener('pointerup', () => window.GameAudio.unlock());
  window.addEventListener('touchend', () => window.GameAudio.unlock());
  window.addEventListener('click', () => window.GameAudio.unlock());
  window.addEventListener('keydown', () => window.GameAudio.unlock());

  // 마우스나 터치 클릭 후 포커스가 남지 않게 하되 키보드 포커스는 보존한다.
  muteBtn.addEventListener('click', event => {
    window.GameAudio.setMuted(!window.GameAudio.isMuted());
    updateMuteButton();
    if (event.detail > 0) {
      muteBtn.blur();
    }
  });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', () => {
    if (performance.now() - gameoverAt >= 400) {
      startGame();
    }
  });

  // 시작 화면 어디든 클릭으로 게임을 시작하되 음소거 조작은 제외한다.
  startScreen.addEventListener('click', event => {
    if (event.target !== startBtn && !muteTarget(event.target) && mode === 'start') {
      startGame();
    }
  });

  // 전체 화면에서 드래그를 시작하고 루트 요소에 포인터 캡처를 설정한다.
  document.addEventListener('pointerdown', event => {
    if (muteTarget(event.target) || mode !== 'playing') {
      return;
    }
    pointerId = event.pointerId;
    targetX = pointerX(event);
    try {
      captureTarget.setPointerCapture(pointerId);
    } catch (_) {}
    event.preventDefault();
  });

  // 캡처된 포인터 이동을 캔버스 좌표로 바꿔 우주선 목표를 갱신한다.
  document.addEventListener('pointermove', event => {
    if (mode === 'playing' && pointerId === event.pointerId) {
      targetX = pointerX(event);
      event.preventDefault();
    }
  });

  // 포인터 종료와 취소에서 캡처 및 추적 상태를 모두 정리한다.
  function releasePointer(event) {
    if (pointerId === event.pointerId) {
      try {
        if (captureTarget.hasPointerCapture(pointerId)) {
          captureTarget.releasePointerCapture(pointerId);
        }
      } catch (_) {}
      pointerId = null;
      targetX = null;
    }
  }

  document.addEventListener('pointerup', releasePointer);
  document.addEventListener('pointercancel', releasePointer);

  // 키보드 조작과 Enter 재시작을 처리하고 버튼 Enter 동작과 충돌하지 않게 한다.
  window.addEventListener('keydown', event => {
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      if (mode === 'playing') {
        event.preventDefault();
      }
      keys.add(event.code);
    }
    if (event.code === 'KeyA' || event.code === 'KeyD') {
      keys.add(event.code);
    }
    if (event.code === 'Enter' && !event.repeat) {
      if (event.target === muteBtn || event.target === startBtn || event.target === restartBtn) {
        return;
      }
      if (mode === 'start') {
        startGame();
      } else if (mode === 'over' && performance.now() - gameoverAt >= 400) {
        startGame();
      }
    }
  });

  window.addEventListener('keyup', event => {
    keys.delete(event.code);
  });

  // 창 포커스를 잃거나 탭을 숨기면 눌린 입력이 남지 않도록 초기화한다.
  window.addEventListener('blur', () => {
    keys.clear();
    pointerId = null;
    targetX = null;
  });
  document.addEventListener('visibilitychange', () => {
    previous = 0;
    keys.clear();
  });

  // 모바일 브라우저의 확대 제스처와 스크롤이 조작을 가로채지 않게 막는다.
  document.addEventListener('gesturestart', event => event.preventDefault());
  document.addEventListener('touchmove', event => event.preventDefault(), { passive: false });

  // 프레임마다 게임을 진행하고 현재 모드에 맞춰 장면을 그린다.
  function frame(now) {
    if (!previous) {
      previous = now;
    }
    const dt = Math.min(.05, Math.max(0, (now - previous) / 1000));
    previous = now;
    elapsedVisual += dt;

    if (mode === 'playing') {
      const left = keys.has('ArrowLeft') || keys.has('KeyA');
      const right = keys.has('ArrowRight') || keys.has('KeyD');
      const direction = left === right ? 0 : left ? -1 : 1;
      state = logic.stepGame(state, dt, { direction, targetX });
      scoreEl.textContent = String(state.score);
      bestEl.textContent = String(Math.max(best, state.score));
      if (state.over) {
        finishGame();
      }
    }

    ctxRenderer.draw(state, elapsedVisual, mode === 'playing');
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
