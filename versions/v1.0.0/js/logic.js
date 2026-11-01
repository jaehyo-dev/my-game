// 운석 피하기의 순수 게임 로직.
// DOM·캔버스·오디오에 의존하지 않아 Node 자동 테스트에서 그대로 실행할 수 있다.
// file:// 로 열어도 동작하도록 ES 모듈 대신 전역 객체(GameLogic)로 노출한다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 게임에서 쓰는 모든 수치. 좌표 단위는 논리 픽셀이다.
  const CONFIG = Object.freeze({
    WORLD_WIDTH: 240,
    WORLD_HEIGHT: 400,
    SHIP_WIDTH: 20,
    SHIP_HEIGHT: 20,
    SHIP_Y: 364, // 우주선 위쪽 변의 y 좌표
    SHIP_HITBOX_INSET: 3, // 판정을 그림보다 조금 작게 잡아 억울한 충돌을 줄인다
    SHIP_SPEED: 200, // 키보드 이동 속도 (픽셀/초)
    DRAG_SPEED: 1200, // 드래그 최대 속도. 손가락을 바로 따라가 보이되 순간이동으로 운석을 건너뛰지 못하게 한다
    METEOR_MIN_RADIUS: 5,
    METEOR_MAX_RADIUS: 16,
    METEOR_SPEED_JITTER: 0.15, // 운석별 속도 편차 (±15%)
    METEOR_VARIANTS: 4, // 렌더러가 고를 수 있는 운석 무늬 개수
    FIRST_SPAWN_DELAY: 0.3, // 시작 직후 첫 운석까지의 대기 시간 (초)
    BASE_FALL_SPEED: 80,
    FALL_SPEED_PER_SEC: 4,
    MAX_FALL_SPEED: 340,
    BASE_SPAWN_INTERVAL: 0.6,
    SPAWN_INTERVAL_DECAY: 0.97, // 1초마다 생성 간격에 곱하는 값
    MIN_SPAWN_INTERVAL: 0.08,
    MAX_STEP_SECONDS: 0.05, // 탭 전환 등으로 프레임이 길어져도 운석이 순간이동하지 않게 제한
    MAX_SUBSTEP_SECONDS: 1 / 60, // 느린 기기에서도 판정을 건너뛰지 않도록 긴 프레임을 나눠 계산
    SCORE_PER_SECOND: 10,
    HIGH_SCORE_KEY: 'meteor-dodge.highScore',
  });

  // 값을 [min, max] 범위로 제한한다.
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // 우주선 중심 x 좌표를 화면 안으로 제한한다.
  function clampShipX(x) {
    const half = CONFIG.SHIP_WIDTH / 2;
    return clamp(x, half, CONFIG.WORLD_WIDTH - half);
  }

  // 입력을 반영한 다음 우주선 위치를 계산한다.
  // 드래그(targetX)가 있으면 손가락 위치를 DRAG_SPEED 한도 안에서 따라가고, 없으면 방향(-1, 0, 1)으로 움직인다.
  function nextShipX(x, input, dt) {
    const targetX = input && input.targetX;
    if (typeof targetX === 'number' && Number.isFinite(targetX)) {
      const limit = CONFIG.DRAG_SPEED * dt;
      return clamp(clampShipX(targetX), x - limit, x + limit);
    }
    const direction = (input && input.direction) || 0;
    return clampShipX(x + Math.sign(direction) * CONFIG.SHIP_SPEED * dt);
  }

  // 우주선 중심 x 좌표로부터 실제 충돌 판정 사각형을 구한다.
  function shipHitbox(shipX) {
    const inset = CONFIG.SHIP_HITBOX_INSET;
    return {
      x: shipX - CONFIG.SHIP_WIDTH / 2 + inset,
      y: CONFIG.SHIP_Y + inset,
      width: CONFIG.SHIP_WIDTH - inset * 2,
      height: CONFIG.SHIP_HEIGHT - inset * 2,
    };
  }

  // 원(운석)과 사각형(우주선)의 충돌 판정. 경계가 정확히 맞닿아도 충돌로 본다.
  function circleHitsRect(circle, rect) {
    const nearestX = clamp(circle.x, rect.x, rect.x + rect.width);
    const nearestY = clamp(circle.y, rect.y, rect.y + rect.height);
    const dx = circle.x - nearestX;
    const dy = circle.y - nearestY;
    return dx * dx + dy * dy <= circle.radius * circle.radius;
  }

  // 버틴 시간(초)을 점수로 바꾼다. 0.1초마다 1점.
  function scoreFromElapsed(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    // 0.3 * 10 = 3.0000000000000004 같은 부동소수점 오차로 점수가 어긋나지 않게 보정한다.
    return Math.floor(seconds * CONFIG.SCORE_PER_SECOND + 1e-9);
  }

  // 경과 시간에 따른 난이도. 낙하 속도는 빨라지고 생성 간격은 짧아진다(= 운석 수 증가).
  function difficultyAt(seconds) {
    const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    return {
      fallSpeed: Math.min(CONFIG.MAX_FALL_SPEED, CONFIG.BASE_FALL_SPEED + CONFIG.FALL_SPEED_PER_SEC * t),
      spawnInterval: Math.max(
        CONFIG.MIN_SPAWN_INTERVAL,
        CONFIG.BASE_SPAWN_INTERVAL * Math.pow(CONFIG.SPAWN_INTERVAL_DECAY, t)
      ),
    };
  }

  // rng()는 Math.random처럼 [0, 1) 값을 돌려주는 함수다.
  function createMeteor(seconds, rng) {
    const minR = CONFIG.METEOR_MIN_RADIUS;
    const maxR = CONFIG.METEOR_MAX_RADIUS;
    const radius = minR + Math.floor(rng() * (maxR - minR + 1));
    const jitter = 1 + (rng() * 2 - 1) * CONFIG.METEOR_SPEED_JITTER;
    return {
      x: radius + rng() * (CONFIG.WORLD_WIDTH - radius * 2), // 항상 화면 안에서 떨어진다
      y: -radius,
      radius: radius,
      speed: difficultyAt(seconds).fallSpeed * jitter,
      variant: Math.floor(rng() * CONFIG.METEOR_VARIANTS),
    };
  }

  // 새 판의 상태를 만든다.
  function createGame(rng) {
    return {
      rng: rng || Math.random,
      elapsed: 0,
      score: 0,
      shipX: CONFIG.WORLD_WIDTH / 2,
      meteors: [],
      spawnTimer: CONFIG.FIRST_SPAWN_DELAY,
      over: false,
    };
  }

  // 게임을 dt초만큼 진행한다. state를 직접 바꾸고 그대로 돌려준다.
  function stepGame(state, dt, input) {
    if (state.over || !Number.isFinite(dt) || dt <= 0) return state;
    const total = Math.min(dt, CONFIG.MAX_STEP_SECONDS);
    const count = Math.ceil(total / CONFIG.MAX_SUBSTEP_SECONDS - 1e-9);
    for (let i = 0; i < count && !state.over; i++) {
      advance(state, total / count, input);
    }
    return state;
  }

  // 작은 시간 조각 하나만큼 이동, 점수, 운석 생성, 충돌을 처리한다.
  function advance(state, step, input) {
    state.shipX = nextShipX(state.shipX, input, step);
    state.elapsed += step;
    state.score = scoreFromElapsed(state.elapsed);

    // 생성 간격이 프레임보다 짧아져도 놓치지 않도록 while로 생성한다.
    state.spawnTimer -= step;
    while (state.spawnTimer <= 0) {
      state.meteors.push(createMeteor(state.elapsed, state.rng));
      state.spawnTimer += difficultyAt(state.elapsed).spawnInterval;
    }

    const hitbox = shipHitbox(state.shipX);
    const remaining = [];
    for (const meteor of state.meteors) {
      meteor.y += meteor.speed * step;
      if (circleHitsRect(meteor, hitbox)) state.over = true;
      // 화면 아래로 완전히 벗어난 운석은 버린다.
      if (meteor.y - meteor.radius <= CONFIG.WORLD_HEIGHT) remaining.push(meteor);
    }
    state.meteors = remaining;
  }

  // localStorage 접근 자체가 예외를 던지는 환경(차단된 쿠키 등)에서도 안전하게 가져온다.
  function getSafeStorage(getStorage) {
    try {
      return getStorage() || null;
    } catch (error) {
      return null;
    }
  }

  // 저장된 문자열을 점수로 해석한다. 잘못된 값은 0으로 취급한다.
  function parseHighScore(raw) {
    if (raw === null || raw === undefined || raw === '') return 0;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) return 0;
    return value;
  }

  // 최고 점수 저장소. 저장에 실패해도 이번 실행 동안은 메모리 값으로 계속 동작한다.
  function createHighScoreStore(storage, key) {
    const storageKey = key || CONFIG.HIGH_SCORE_KEY;
    let best = 0;

    function load() {
      if (storage) {
        try {
          best = Math.max(best, parseHighScore(storage.getItem(storageKey)));
        } catch (error) {
          // 읽기에 실패하면 메모리에 있는 값을 그대로 쓴다.
        }
      }
      return best;
    }

    // 이번 점수를 반영하고 최고 점수와 새 기록 여부를 돌려준다.
    function submit(score) {
      load(); // 다른 탭에서 갱신된 기록을 덮어쓰지 않도록 먼저 다시 읽는다.
      const isNew = score > best;
      if (isNew) {
        best = score;
        if (storage) {
          try {
            storage.setItem(storageKey, String(best));
          } catch (error) {
            // 저장 공간 부족·시크릿 모드 등. 게임 진행에는 영향을 주지 않는다.
          }
        }
      }
      return { best: best, isNew: isNew };
    }

    return { load: load, submit: submit };
  }

  return {
    CONFIG,
    clamp,
    clampShipX,
    nextShipX,
    shipHitbox,
    circleHitsRect,
    scoreFromElapsed,
    difficultyAt,
    createMeteor,
    createGame,
    stepGame,
    getSafeStorage,
    parseHighScore,
    createHighScoreStore,
  };
});
