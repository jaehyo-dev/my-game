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
    FALL_SPEED_PER_SEC: 5,
    MAX_FALL_SPEED: 340,
    BASE_SPAWN_INTERVAL: 0.6,
    SPAWN_INTERVAL_DECAY: 0.955, // 1초마다 생성 간격에 곱하는 값 (자동 공격이 있어 예전 0.97보다 빠르게 늘린다)
    MIN_SPAWN_INTERVAL: 0.08,
    MAX_STEP_SECONDS: 0.05, // 탭 전환 등으로 프레임이 길어져도 운석이 순간이동하지 않게 제한
    MAX_SUBSTEP_SECONDS: 1 / 60, // 느린 기기에서도 판정을 건너뛰지 않도록 긴 프레임을 나눠 계산
    SCORE_PER_SECOND: 10,
    // 자동 공격. 발사 간격은 고정이라 후반에는 늘어나는 운석을 다 막을 수 없다.
    FIRE_INTERVAL: 0.45, // 자동 발사 간격 (초)
    FIRST_FIRE_DELAY: 0.25, // 시작 직후 첫 발사까지의 대기 시간 (초)
    BULLET_SPEED: 360, // 탄 속도 (픽셀/초, 위쪽)
    BULLET_WIDTH: 2,
    BULLET_HEIGHT: 6,
    METEOR_SMALL_MAX_RADIUS: 8, // 이 반지름 이하는 1발
    METEOR_MEDIUM_MAX_RADIUS: 12, // 이 반지름 이하는 2발, 더 크면 3발
    BONUS_PER_HP: 5, // 운석을 부쉈을 때 체력 1당 보너스 점수
    // 파편 연출. 게임 판정에는 영향이 없다.
    DEBRIS_LIFE: 0.5, // 파편이 사라지기까지의 최대 시간 (초)
    DEBRIS_GRAVITY: 140,
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

  // 운석 크기에 따라 부수는 데 필요한 명중 횟수를 정한다.
  function meteorHp(radius) {
    if (radius <= CONFIG.METEOR_SMALL_MAX_RADIUS) return 1;
    if (radius <= CONFIG.METEOR_MEDIUM_MAX_RADIUS) return 2;
    return 3;
  }

  // 운석을 부쉈을 때 받는 보너스 점수. 단단한(큰) 운석일수록 크다.
  function destroyBonus(maxHp) {
    return Math.max(0, maxHp | 0) * CONFIG.BONUS_PER_HP;
  }

  // 탄의 충돌 사각형. 탄의 x는 가운데, y는 위쪽 변이다.
  function bulletRect(bullet) {
    return {
      x: bullet.x - CONFIG.BULLET_WIDTH / 2,
      y: bullet.y,
      width: CONFIG.BULLET_WIDTH,
      height: CONFIG.BULLET_HEIGHT,
    };
  }

  // 우주선 앞코에서 새 탄을 만든다.
  function createBullet(shipX) {
    return { x: shipX, y: CONFIG.SHIP_Y - CONFIG.BULLET_HEIGHT };
  }

  // rng()는 Math.random처럼 [0, 1) 값을 돌려주는 함수다.
  function createMeteor(seconds, rng) {
    const minR = CONFIG.METEOR_MIN_RADIUS;
    const maxR = CONFIG.METEOR_MAX_RADIUS;
    const radius = minR + Math.floor(rng() * (maxR - minR + 1));
    const jitter = 1 + (rng() * 2 - 1) * CONFIG.METEOR_SPEED_JITTER;
    const hp = meteorHp(radius);
    return {
      x: radius + rng() * (CONFIG.WORLD_WIDTH - radius * 2), // 항상 화면 안에서 떨어진다
      y: -radius,
      radius: radius,
      speed: difficultyAt(seconds).fallSpeed * jitter,
      variant: Math.floor(rng() * CONFIG.METEOR_VARIANTS),
      hp: hp,
      maxHp: hp,
    };
  }

  // 새 판의 상태를 만든다.
  function createGame(rng) {
    return {
      rng: rng || Math.random,
      elapsed: 0,
      score: 0,
      bonus: 0, // 운석 파괴로 얻은 보너스 점수 합계
      destroyed: 0, // 부순 운석 수
      shipX: CONFIG.WORLD_WIDTH / 2,
      meteors: [],
      bullets: [],
      spawnTimer: CONFIG.FIRST_SPAWN_DELAY,
      fireTimer: CONFIG.FIRST_FIRE_DELAY,
      events: [], // 마지막 stepGame 호출 동안 일어난 일(화면·소리 연출용)
      over: false,
    };
  }

  // 시간 점수와 보너스를 합친 최종 점수.
  function totalScore(elapsed, bonus) {
    const extra = Number.isFinite(bonus) && bonus > 0 ? Math.floor(bonus) : 0;
    return scoreFromElapsed(elapsed) + extra;
  }

  // 게임을 dt초만큼 진행한다. state를 직접 바꾸고 그대로 돌려준다.
  // state.events는 호출마다 새로 비워지므로 호출한 쪽이 바로 읽어 연출에 써야 한다.
  function stepGame(state, dt, input) {
    if (!state.events) state.events = [];
    state.events.length = 0;
    if (state.over || !Number.isFinite(dt) || dt <= 0) return state;
    const total = Math.min(dt, CONFIG.MAX_STEP_SECONDS);
    const count = Math.ceil(total / CONFIG.MAX_SUBSTEP_SECONDS - 1e-9);
    for (let i = 0; i < count && !state.over; i++) {
      advance(state, total / count, input);
    }
    return state;
  }

  // 작은 시간 조각 하나만큼 이동, 발사, 운석 생성, 명중, 충돌, 점수를 처리한다.
  function advance(state, step, input) {
    if (!state.bullets) state.bullets = [];
    state.shipX = nextShipX(state.shipX, input, step);
    state.elapsed += step;

    // 생성 간격이 프레임보다 짧아져도 놓치지 않도록 while로 생성한다.
    state.spawnTimer -= step;
    while (state.spawnTimer <= 0) {
      state.meteors.push(createMeteor(state.elapsed, state.rng));
      state.spawnTimer += difficultyAt(state.elapsed).spawnInterval;
    }

    // 자동 발사. 간격이 고정이라 아무리 긴 프레임이어도 정해진 수 이상 쏘지 못한다.
    state.fireTimer -= step;
    while (state.fireTimer <= 0) {
      state.bullets.push(createBullet(state.shipX));
      state.fireTimer += CONFIG.FIRE_INTERVAL;
    }

    for (const bullet of state.bullets) bullet.y -= CONFIG.BULLET_SPEED * step;
    for (const meteor of state.meteors) {
      // 체력 정보가 없는 운석(예전 형식 데이터 등)은 크기에 맞는 체력을 채워 무적이 되지 않게 한다.
      if (typeof meteor.hp !== 'number') {
        meteor.hp = meteorHp(meteor.radius);
        meteor.maxHp = meteor.hp;
      }
      meteor.y += meteor.speed * step;
    }

    // 탄은 겹친 운석 중 가장 아래(먼저 만나는) 운석 하나에만 맞고 사라진다.
    const liveBullets = [];
    for (const bullet of state.bullets) {
      const rect = bulletRect(bullet);
      let target = null;
      for (const meteor of state.meteors) {
        if (meteor.hp > 0 && circleHitsRect(meteor, rect) && (!target || meteor.y > target.y)) {
          target = meteor;
        }
      }
      if (target) {
        target.hp -= 1;
        if (target.hp <= 0) {
          const maxHp = target.maxHp || 1;
          state.bonus += destroyBonus(maxHp);
          state.destroyed += 1;
          state.events.push({ type: 'destroy', x: target.x, y: target.y, radius: target.radius, variant: target.variant });
        } else {
          state.events.push({ type: 'hit', x: target.x, y: target.y, radius: target.radius });
        }
        continue;
      }
      // 화면 위로 완전히 벗어난 탄은 버린다.
      if (bullet.y + CONFIG.BULLET_HEIGHT >= 0) liveBullets.push(bullet);
    }
    state.bullets = liveBullets;

    // 부서진 운석은 우주선과 부딪히기 전에 사라진다.
    const hitbox = shipHitbox(state.shipX);
    const remaining = [];
    for (const meteor of state.meteors) {
      if (meteor.hp <= 0) continue;
      if (circleHitsRect(meteor, hitbox)) state.over = true;
      // 화면 아래로 완전히 벗어난 운석은 버린다.
      if (meteor.y - meteor.radius <= CONFIG.WORLD_HEIGHT) remaining.push(meteor);
    }
    state.meteors = remaining;
    state.score = totalScore(state.elapsed, state.bonus);
  }

  // 운석이 부서질 때 흩어지는 픽셀 파편을 만든다. 순수 연출용이며 판정에 쓰지 않는다.
  function createDebris(x, y, radius, rng) {
    const random = rng || Math.random;
    const count = 6 + Math.round(radius / 2);
    const pieces = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + random() * 0.6;
      const speed = 40 + random() * 70;
      const life = CONFIG.DEBRIS_LIFE * (0.6 + random() * 0.4);
      pieces.push({
        x: x + Math.cos(angle) * radius * 0.5,
        y: y + Math.sin(angle) * radius * 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30, // 살짝 위로 튀었다가 떨어진다
        size: radius > CONFIG.METEOR_MEDIUM_MAX_RADIUS ? 3 : 2,
        life: life,
        maxLife: life,
        shade: i % 3, // 렌더러가 고를 색 번호
      });
    }
    return pieces;
  }

  // 파편을 dt초만큼 움직이고 수명이 다한 파편을 뺀 새 배열을 돌려준다.
  function stepDebris(pieces, dt) {
    if (!Number.isFinite(dt) || dt <= 0) return pieces;
    const alive = [];
    for (const p of pieces) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += CONFIG.DEBRIS_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      alive.push(p);
    }
    return alive;
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
    totalScore,
    difficultyAt,
    meteorHp,
    destroyBonus,
    bulletRect,
    createBullet,
    createMeteor,
    createDebris,
    stepDebris,
    createGame,
    stepGame,
    getSafeStorage,
    parseHighScore,
    createHighScoreStore,
  };
});
