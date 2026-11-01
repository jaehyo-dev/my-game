// 게임 로직 자동 테스트: 충돌, 점수, 난이도, 이동 제한, 최고 점수, 게임 진행.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const { seededRng } = require('./helpers.js');

const { CONFIG } = L;

// 초기값을 넣을 수 있는 가짜 저장소.
function fakeStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    data,
  };
}

// ---------- 충돌 판정 ----------
const rect = { x: 100, y: 100, width: 20, height: 20 };

test('충돌: 운석이 사각형 안에 있으면 닿음', () => {
  assert.equal(L.circleHitsRect({ x: 110, y: 110, radius: 1 }, rect), true);
});

test('충돌: 왼쪽 변에 정확히 맞닿으면 닿음', () => {
  assert.equal(L.circleHitsRect({ x: 95, y: 110, radius: 5 }, rect), true);
});

test('충돌: 왼쪽 변에서 아슬아슬하게 떨어지면 안 닿음', () => {
  assert.equal(L.circleHitsRect({ x: 94.99, y: 110, radius: 5 }, rect), false);
});

test('충돌: 위쪽 변에서 아슬아슬하게 떨어지면 안 닿음', () => {
  assert.equal(L.circleHitsRect({ x: 110, y: 94.99, radius: 5 }, rect), false);
});

test('충돌: 모서리는 사각형 범위가 아니라 원 거리로 판정', () => {
  // 3-4-5 직각삼각형: 모서리(100,100)까지 거리가 정확히 5
  assert.equal(L.circleHitsRect({ x: 97, y: 96, radius: 5 }, rect), true);
  // 가로세로 범위로는 겹쳐 보여도 대각선 거리는 반지름보다 멀다
  assert.equal(L.circleHitsRect({ x: 96, y: 96, radius: 5 }, rect), false);
});

test('충돌: 우주선 판정은 그림보다 안쪽으로 줄어든다', () => {
  const box = L.shipHitbox(120);
  assert.equal(box.x, 120 - CONFIG.SHIP_WIDTH / 2 + CONFIG.SHIP_HITBOX_INSET);
  assert.equal(box.y, CONFIG.SHIP_Y + CONFIG.SHIP_HITBOX_INSET);
  assert.equal(box.width, CONFIG.SHIP_WIDTH - 2 * CONFIG.SHIP_HITBOX_INSET);
  assert.equal(box.height, CONFIG.SHIP_HEIGHT - 2 * CONFIG.SHIP_HITBOX_INSET);
});

// ---------- 점수 ----------
test('점수: 0.1초마다 1점', () => {
  assert.equal(L.scoreFromElapsed(0), 0);
  assert.equal(L.scoreFromElapsed(0.09), 0);
  assert.equal(L.scoreFromElapsed(0.1), 1);
  assert.equal(L.scoreFromElapsed(0.19), 1);
  assert.equal(L.scoreFromElapsed(12.34), 123);
});

test('점수: 부동소수점 오차로 어긋나지 않음', () => {
  for (let tenths = 0; tenths <= 1000; tenths++) {
    assert.equal(L.scoreFromElapsed(tenths / 10), tenths);
  }
});

test('점수: 음수·잘못된 값은 0', () => {
  assert.equal(L.scoreFromElapsed(-1), 0);
  assert.equal(L.scoreFromElapsed(NaN), 0);
  assert.equal(L.scoreFromElapsed(Infinity), 0);
});

// ---------- 난이도 ----------
test('난이도: 시작 값이 설정과 일치', () => {
  const d = L.difficultyAt(0);
  assert.equal(d.fallSpeed, CONFIG.BASE_FALL_SPEED);
  assert.equal(d.spawnInterval, CONFIG.BASE_SPAWN_INTERVAL);
});

test('난이도: 시간이 지날수록 속도는 증가, 생성 간격은 감소', () => {
  let previous = L.difficultyAt(0);
  for (let t = 1; t <= 120; t++) {
    const current = L.difficultyAt(t);
    assert.ok(current.fallSpeed >= previous.fallSpeed, `${t}초 속도`);
    assert.ok(current.spawnInterval <= previous.spawnInterval, `${t}초 간격`);
    previous = current;
  }
  assert.ok(L.difficultyAt(30).fallSpeed > L.difficultyAt(0).fallSpeed);
  assert.ok(L.difficultyAt(30).spawnInterval < L.difficultyAt(0).spawnInterval);
});

test('난이도: 상한과 하한을 넘지 않음', () => {
  const d = L.difficultyAt(100000);
  assert.equal(d.fallSpeed, CONFIG.MAX_FALL_SPEED);
  assert.equal(d.spawnInterval, CONFIG.MIN_SPAWN_INTERVAL);
});

test('난이도: 잘못된 시간은 시작 난이도로 처리', () => {
  assert.deepEqual(L.difficultyAt(-5), L.difficultyAt(0));
  assert.deepEqual(L.difficultyAt(NaN), L.difficultyAt(0));
});

// ---------- 이동 제한 ----------
const half = CONFIG.SHIP_WIDTH / 2;
const maxX = CONFIG.WORLD_WIDTH - half;

test('이동 제한: 화면 양 끝을 넘지 않음', () => {
  assert.equal(L.clampShipX(-100), half);
  assert.equal(L.clampShipX(10000), maxX);
  assert.equal(L.clampShipX(half), half);
  assert.equal(L.clampShipX(maxX), maxX);
  assert.equal(L.clampShipX(100), 100);
});

test('이동: 키보드 방향으로 속도만큼 이동', () => {
  assert.equal(L.nextShipX(100, { direction: 1 }, 0.1), 100 + CONFIG.SHIP_SPEED * 0.1);
  assert.equal(L.nextShipX(100, { direction: -1 }, 0.1), 100 - CONFIG.SHIP_SPEED * 0.1);
  assert.equal(L.nextShipX(100, { direction: 0 }, 0.1), 100);
  assert.equal(L.nextShipX(100, undefined, 0.1), 100);
});

test('이동: 키보드로 계속 눌러도 벽에서 멈춤', () => {
  let x = 120;
  for (let i = 0; i < 1000; i++) x = L.nextShipX(x, { direction: -1 }, 0.05);
  assert.equal(x, half);
  for (let i = 0; i < 1000; i++) x = L.nextShipX(x, { direction: 1 }, 0.05);
  assert.equal(x, maxX);
});

test('이동: 드래그는 가까운 손가락 위치에 바로 도착하고 지나치지 않음', () => {
  assert.equal(L.nextShipX(100, { targetX: 110 }, 1 / 60), 110);
  assert.equal(L.nextShipX(100, { targetX: 90 }, 1 / 60), 90);
});

test('이동: 드래그도 한 프레임에 DRAG_SPEED 이상 움직이지 못함(순간이동 방지)', () => {
  const limit = CONFIG.DRAG_SPEED * 0.01;
  assert.equal(L.nextShipX(100, { targetX: 230 }, 0.01), 100 + limit);
  assert.equal(L.nextShipX(100, { targetX: 10 }, 0.01), 100 - limit);
});

test('이동: 드래그로 화면 끝까지 0.25초 안에 도착하고 범위를 넘지 않음', () => {
  let x = 120;
  for (let t = 0; t < 15; t++) x = L.nextShipX(x, { targetX: 9999 }, 1 / 60);
  assert.equal(x, maxX);
  for (let t = 0; t < 15; t++) x = L.nextShipX(x, { targetX: -9999 }, 1 / 60);
  assert.equal(x, half);
});

test('이동: 드래그 값이 잘못되면 무시', () => {
  assert.equal(L.nextShipX(100, { targetX: NaN, direction: 0 }, 0.016), 100);
  assert.equal(L.nextShipX(100, { targetX: null, direction: 1 }, 0.1), 100 + CONFIG.SHIP_SPEED * 0.1);
});

// ---------- 최고 점수 ----------
test('최고 점수: 저장과 불러오기', () => {
  const storage = fakeStorage();
  const store = L.createHighScoreStore(storage);
  assert.equal(store.load(), 0);
  assert.deepEqual(store.submit(50), { best: 50, isNew: true });
  assert.equal(storage.data.get(CONFIG.HIGH_SCORE_KEY), '50');
  // 새로 만든 저장소(= 다시 접속)에서도 불러와진다
  assert.equal(L.createHighScoreStore(storage).load(), 50);
});

test('최고 점수: 낮거나 같은 점수는 새 기록이 아니고 덮어쓰지 않음', () => {
  const storage = fakeStorage({ [CONFIG.HIGH_SCORE_KEY]: '100' });
  const store = L.createHighScoreStore(storage);
  assert.deepEqual(store.submit(99), { best: 100, isNew: false });
  assert.deepEqual(store.submit(100), { best: 100, isNew: false });
  assert.equal(storage.data.get(CONFIG.HIGH_SCORE_KEY), '100');
});

test('최고 점수: 첫 판 0점은 새 기록이 아님', () => {
  assert.deepEqual(L.createHighScoreStore(fakeStorage()).submit(0), { best: 0, isNew: false });
});

test('최고 점수: 손상된 저장값은 0으로 처리', () => {
  for (const bad of ['abc', '-5', '1.5', 'Infinity', 'NaN', '', '{}']) {
    const store = L.createHighScoreStore(fakeStorage({ [CONFIG.HIGH_SCORE_KEY]: bad }));
    assert.equal(store.load(), 0, `저장값 ${bad}`);
  }
});

test('최고 점수: 저장소가 없어도 메모리로 동작', () => {
  const store = L.createHighScoreStore(null);
  assert.equal(store.load(), 0);
  assert.deepEqual(store.submit(30), { best: 30, isNew: true });
  assert.deepEqual(store.submit(20), { best: 30, isNew: false });
  assert.equal(store.load(), 30);
});

test('최고 점수: 읽기·쓰기가 예외를 던져도 메모리로 동작', () => {
  const broken = {
    getItem() { throw new Error('읽기 차단'); },
    setItem() { throw new Error('쓰기 차단'); },
  };
  const store = L.createHighScoreStore(broken);
  assert.equal(store.load(), 0);
  assert.deepEqual(store.submit(70), { best: 70, isNew: true });
  assert.equal(store.load(), 70);
});

test('최고 점수: 접근 자체가 예외면 저장소 없음으로 처리', () => {
  assert.equal(L.getSafeStorage(() => { throw new Error('SecurityError'); }), null);
  assert.equal(L.getSafeStorage(() => undefined), null);
  const storage = fakeStorage();
  assert.equal(L.getSafeStorage(() => storage), storage);
});

// ---------- 운석 생성 ----------
test('운석: 크기와 위치가 범위 안에서 무작위', () => {
  const rng = seededRng(1);
  const radii = new Set();
  for (let i = 0; i < 2000; i++) {
    const m = L.createMeteor(0, rng);
    radii.add(m.radius);
    assert.ok(m.radius >= CONFIG.METEOR_MIN_RADIUS && m.radius <= CONFIG.METEOR_MAX_RADIUS);
    assert.ok(m.x - m.radius >= 0 && m.x + m.radius <= CONFIG.WORLD_WIDTH);
    assert.equal(m.y, -m.radius);
    assert.ok(m.variant >= 0 && m.variant < CONFIG.METEOR_VARIANTS);
  }
  assert.equal(radii.size, CONFIG.METEOR_MAX_RADIUS - CONFIG.METEOR_MIN_RADIUS + 1);
});

test('운석: rng 양 끝값에서도 범위를 지킴', () => {
  for (const edge of [0, 0.999999]) {
    const m = L.createMeteor(0, () => edge);
    assert.ok(m.radius >= CONFIG.METEOR_MIN_RADIUS && m.radius <= CONFIG.METEOR_MAX_RADIUS);
    assert.ok(m.x - m.radius >= 0 && m.x + m.radius <= CONFIG.WORLD_WIDTH);
  }
});

// ---------- 게임 진행 ----------
test('진행: 시간이 흐르면 점수가 오르고 운석이 생겨 떨어짐', () => {
  const game = L.createGame(seededRng(2));
  assert.equal(game.score, 0);
  L.stepGame(game, 0.05, {});
  const before = game.elapsed;
  assert.equal(game.meteors.length, 0);
  while (game.meteors.length === 0) L.stepGame(game, 0.05, {});
  const meteor = game.meteors[0];
  const y = meteor.y;
  L.stepGame(game, 0.05, {});
  assert.ok(game.elapsed > before);
  assert.ok(meteor.y > y);
  assert.equal(game.score, L.scoreFromElapsed(game.elapsed));
});

test('진행: 운석에 부딪히면 즉시 게임오버하고 이후 멈춤', () => {
  const game = L.createGame(seededRng(3));
  game.spawnTimer = 999;
  game.meteors.push({ x: game.shipX, y: CONFIG.SHIP_Y - 10, radius: 8, speed: 100, variant: 0 });
  L.stepGame(game, 0.05, {});
  assert.equal(game.over, true);
  const frozen = { elapsed: game.elapsed, score: game.score };
  L.stepGame(game, 0.05, { direction: 1 });
  assert.equal(game.elapsed, frozen.elapsed);
  assert.equal(game.score, frozen.score);
});

test('진행: 운석이 아슬아슬하게 옆을 지나가면 게임오버가 아님', () => {
  const game = L.createGame(seededRng(4));
  game.spawnTimer = 999;
  const box = L.shipHitbox(game.shipX);
  game.meteors.push({ x: box.x - 8.01, y: box.y + 5, radius: 8, speed: 10, variant: 0 });
  L.stepGame(game, 0.05, {});
  assert.equal(game.over, false);
});

test('진행: 화면 아래로 나간 운석은 제거', () => {
  const game = L.createGame(seededRng(5));
  game.spawnTimer = 999;
  game.meteors.push({ x: 10, y: CONFIG.WORLD_HEIGHT + 100, radius: 5, speed: 100, variant: 0 });
  L.stepGame(game, 0.05, {});
  assert.equal(game.meteors.length, 0);
});

test('진행: 긴 프레임도 최대 시간만큼만 진행해 운석이 판정을 뚫지 못함', () => {
  const game = L.createGame(seededRng(6));
  game.spawnTimer = 999;
  // 큰 dt가 그대로 적용되면 운석이 우주선을 통과해 버리는 위치
  game.meteors.push({ x: game.shipX, y: CONFIG.SHIP_Y - 15, radius: 5, speed: 300, variant: 0 });
  L.stepGame(game, 10, {});
  assert.ok(game.elapsed <= CONFIG.MAX_STEP_SECONDS + 1e-9);
  assert.equal(game.over, true);
});

test('진행: 최고 속도에서도 한 프레임 이동량이 판정 크기보다 작음', () => {
  const maxSpeed = CONFIG.MAX_FALL_SPEED * (1 + CONFIG.METEOR_SPEED_JITTER);
  const perStep = maxSpeed * CONFIG.MAX_STEP_SECONDS;
  const hitboxHeight = CONFIG.SHIP_HEIGHT - CONFIG.SHIP_HITBOX_INSET * 2;
  assert.ok(perStep < hitboxHeight + CONFIG.METEOR_MIN_RADIUS * 2);
});

test('진행: 드래그 한 조각의 이동량이 가장 작은 운석을 건너뛸 수 없음', () => {
  const hitboxWidth = CONFIG.SHIP_WIDTH - CONFIG.SHIP_HITBOX_INSET * 2;
  const perStep = CONFIG.DRAG_SPEED * CONFIG.MAX_SUBSTEP_SECONDS;
  assert.ok(perStep < hitboxWidth + CONFIG.METEOR_MIN_RADIUS * 2);
});

test('진행: 긴 프레임에서 드래그로 운석을 가로질러도 충돌함', () => {
  const game = L.createGame(seededRng(9));
  game.spawnTimer = 999;
  const y = CONFIG.SHIP_Y + CONFIG.SHIP_HEIGHT / 2;
  game.meteors.push({ x: game.shipX + 30, y, radius: CONFIG.METEOR_MIN_RADIUS, speed: 0, variant: 0 });
  L.stepGame(game, CONFIG.MAX_STEP_SECONDS, { targetX: game.shipX + 60 });
  assert.equal(game.over, true);
});

test('진행: 잘못된 dt는 상태를 바꾸지 않음', () => {
  const game = L.createGame(seededRng(7));
  for (const dt of [0, -1, NaN, Infinity]) L.stepGame(game, dt, { direction: 1 });
  assert.equal(game.elapsed, 0);
  assert.equal(game.shipX, CONFIG.WORLD_WIDTH / 2);
});

test('진행: 후반에는 같은 시간 동안 운석이 더 많이 생성됨', () => {
  // 실제 stepGame으로 세되, 충돌은 나지 않도록 운석 위치를 생성 직후 비운다.
  function countSpawned(startTime, duration) {
    const game = L.createGame(seededRng(8));
    game.elapsed = startTime;
    game.spawnTimer = 0;
    let count = 0;
    while (game.elapsed < startTime + duration) {
      L.stepGame(game, 0.02, {});
      count += game.meteors.length;
      game.meteors = [];
    }
    return count;
  }
  assert.ok(countSpawned(30, 5) > countSpawned(0, 5) * 2);
});

// ---------- 자동 공격 ----------
// 운석 생성을 끈 게임을 만든다. 발사 타이머는 그대로 둔다.
function quietGame(seed) {
  const game = L.createGame(seededRng(seed));
  game.spawnTimer = 1e9;
  return game;
}

test('공격: 운석 크기별 체력은 작은 1, 중간 2, 큰 3', () => {
  assert.equal(L.meteorHp(CONFIG.METEOR_MIN_RADIUS), 1);
  assert.equal(L.meteorHp(CONFIG.METEOR_SMALL_MAX_RADIUS), 1);
  assert.equal(L.meteorHp(CONFIG.METEOR_SMALL_MAX_RADIUS + 1), 2);
  assert.equal(L.meteorHp(CONFIG.METEOR_MEDIUM_MAX_RADIUS), 2);
  assert.equal(L.meteorHp(CONFIG.METEOR_MEDIUM_MAX_RADIUS + 1), 3);
  assert.equal(L.meteorHp(CONFIG.METEOR_MAX_RADIUS), 3);
});

test('공격: 새 운석은 크기에 맞는 체력을 가짐', () => {
  const rng = seededRng(11);
  for (let i = 0; i < 500; i++) {
    const m = L.createMeteor(0, rng);
    assert.equal(m.hp, L.meteorHp(m.radius));
    assert.equal(m.maxHp, m.hp);
  }
});

test('공격: 일정 간격으로 우주선 위치에서 위로 자동 발사', () => {
  const game = quietGame(12);
  // stepGame은 한 번에 최대 MAX_STEP_SECONDS까지만 진행하므로 작게 나눠 진행한다.
  while (game.elapsed < CONFIG.FIRST_FIRE_DELAY - 0.01 - 1e-9) {
    L.stepGame(game, Math.min(0.01, CONFIG.FIRST_FIRE_DELAY - 0.01 - game.elapsed), {});
  }
  assert.equal(game.bullets.length, 0);
  L.stepGame(game, 0.02, {});
  assert.equal(game.bullets.length, 1);
  const bullet = game.bullets[0];
  assert.equal(bullet.x, game.shipX);
  assert.ok(bullet.y < CONFIG.SHIP_Y);
  const y = bullet.y;
  L.stepGame(game, 0.05, {});
  assert.ok(game.bullets[0].y < y, '탄은 위로 움직인다');
});

test('공격: 발사 수는 시간에만 비례하고 프레임 길이에 따라 늘지 않음', () => {
  const duration = 10;
  for (const frame of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
    const game = quietGame(13);
    let fired = 0;
    let lastCount = 0;
    while (game.elapsed < duration - 1e-9) {
      L.stepGame(game, Math.min(frame, duration - game.elapsed), {});
      // 화면 밖으로 나가 사라지는 탄이 있으므로 새로 생긴 탄만 센다.
      fired += Math.max(0, game.bullets.length - lastCount);
      lastCount = game.bullets.length;
    }
    const expected = Math.floor((duration - CONFIG.FIRST_FIRE_DELAY) / CONFIG.FIRE_INTERVAL) + 1;
    assert.ok(Math.abs(fired - expected) <= 1, `프레임 ${frame}: ${fired}발 (예상 ${expected})`);
  }
});

test('공격: 화면 위로 나간 탄은 제거', () => {
  const game = quietGame(14);
  game.fireTimer = 1e9;
  game.bullets.push({ x: 100, y: -CONFIG.BULLET_HEIGHT - 1 });
  L.stepGame(game, 0.02, {});
  assert.equal(game.bullets.length, 0);
});

test('공격: 작은 운석은 한 발에 부서지고 보너스와 파괴 이벤트가 생김', () => {
  const game = quietGame(15);
  game.fireTimer = 1e9;
  game.meteors.push({ x: 60, y: 100, radius: 6, speed: 0, variant: 1, hp: 1, maxHp: 1 });
  game.bullets.push({ x: 60, y: 110 });
  L.stepGame(game, 1 / 60, {});
  assert.equal(game.meteors.length, 0);
  assert.equal(game.bullets.length, 0, '맞은 탄은 사라진다');
  assert.equal(game.bonus, L.destroyBonus(1));
  assert.equal(game.destroyed, 1);
  assert.equal(game.score, L.scoreFromElapsed(game.elapsed) + game.bonus);
  assert.deepEqual(game.events.map((e) => e.type), ['destroy']);
  assert.equal(game.events[0].radius, 6);
});

test('공격: 큰 운석은 세 번 맞아야 부서지고 그전에는 보너스가 없음', () => {
  const game = quietGame(16);
  game.fireTimer = 1e9;
  const big = { x: 60, y: 100, radius: 15, speed: 0, variant: 0, hp: 3, maxHp: 3 };
  game.meteors.push(big);
  for (let shot = 1; shot <= 2; shot++) {
    game.bullets.push({ x: 60, y: 120 });
    L.stepGame(game, 1 / 60, {});
    assert.equal(big.hp, 3 - shot);
    assert.equal(game.meteors.length, 1);
    assert.equal(game.bonus, 0);
    assert.deepEqual(game.events.map((e) => e.type), ['hit']);
  }
  game.bullets.push({ x: 60, y: 120 });
  L.stepGame(game, 1 / 60, {});
  assert.equal(game.meteors.length, 0);
  assert.equal(game.bonus, L.destroyBonus(3));
  assert.ok(L.destroyBonus(3) > L.destroyBonus(1), '큰 운석 보너스가 더 큼');
});

test('공격: 탄은 겹친 운석 중 하나(가장 아래)에만 맞음', () => {
  const game = quietGame(17);
  game.fireTimer = 1e9;
  const upper = { x: 60, y: 96, radius: 8, speed: 0, variant: 0, hp: 1, maxHp: 1 };
  const lower = { x: 60, y: 104, radius: 8, speed: 0, variant: 0, hp: 1, maxHp: 1 };
  game.meteors.push(upper, lower);
  game.bullets.push({ x: 60, y: 100 });
  L.stepGame(game, 1 / 60, {});
  assert.deepEqual(game.meteors, [upper]);
  assert.equal(game.destroyed, 1);
});

test('공격: 탄이 운석 옆을 아슬아슬하게 지나가면 안 맞음', () => {
  const game = quietGame(18);
  game.fireTimer = 1e9;
  const r = 6;
  const meteor = { x: 60, y: 100, radius: r, speed: 0, variant: 0, hp: 1, maxHp: 1 };
  game.meteors.push(meteor);
  // 탄 오른쪽 변이 운석 왼쪽 끝보다 살짝 왼쪽에 있다.
  game.bullets.push({ x: 60 - r - CONFIG.BULLET_WIDTH / 2 - 0.01, y: 104 });
  L.stepGame(game, 1 / 60, {});
  assert.equal(game.meteors.length, 1);
  assert.equal(game.bonus, 0);
});

test('공격: 최고 속도에서도 탄과 가장 작은 운석이 서로를 건너뛰지 못함', () => {
  const maxMeteor = CONFIG.MAX_FALL_SPEED * (1 + CONFIG.METEOR_SPEED_JITTER);
  const perStep = (CONFIG.BULLET_SPEED + maxMeteor) * CONFIG.MAX_SUBSTEP_SECONDS;
  assert.ok(perStep < CONFIG.BULLET_HEIGHT + CONFIG.METEOR_MIN_RADIUS * 2);
});

test('공격: 빠르게 마주 오는 운석과 탄도 긴 프레임에서 명중', () => {
  const game = quietGame(19);
  game.fireTimer = 1e9;
  const meteor = { x: 60, y: 80, radius: CONFIG.METEOR_MIN_RADIUS, speed: 390, variant: 0, hp: 1, maxHp: 1 };
  game.meteors.push(meteor);
  game.bullets.push({ x: 60, y: 100 });
  L.stepGame(game, CONFIG.MAX_STEP_SECONDS, {});
  assert.equal(game.destroyed, 1);
});

test('공격: 우주선 바로 위에서 부서진 운석은 충돌을 일으키지 않음', () => {
  const game = quietGame(20);
  game.fireTimer = 1e9;
  const box = L.shipHitbox(game.shipX);
  // 다음 조각에서 우주선에 닿을 운석을 같은 조각에서 탄이 부순다.
  game.meteors.push({ x: game.shipX, y: box.y - 6.5, radius: 6, speed: 60, variant: 0, hp: 1, maxHp: 1 });
  game.bullets.push({ x: game.shipX, y: box.y - 8 });
  L.stepGame(game, 1 / 60, {});
  assert.equal(game.over, false);
  assert.equal(game.destroyed, 1);
});

test('공격: 이벤트는 stepGame 호출마다 새로 비워짐', () => {
  const game = quietGame(21);
  game.fireTimer = 1e9;
  game.meteors.push({ x: 60, y: 100, radius: 6, speed: 0, variant: 0, hp: 1, maxHp: 1 });
  game.bullets.push({ x: 60, y: 110 });
  L.stepGame(game, 1 / 60, {});
  assert.equal(game.events.length, 1);
  L.stepGame(game, 1 / 60, {});
  assert.equal(game.events.length, 0);
  // 게임오버 뒤 호출에서도 이전 이벤트가 다시 보이지 않는다.
  game.over = true;
  game.events.push({ type: 'destroy' });
  L.stepGame(game, 1 / 60, {});
  assert.equal(game.events.length, 0);
});

test('공격: 게임오버 뒤에는 탄도 멈춤', () => {
  const game = quietGame(22);
  game.over = true;
  game.bullets.push({ x: 60, y: 200 });
  L.stepGame(game, 0.05, {});
  assert.equal(game.bullets[0].y, 200);
});

// ---------- 점수 (보너스 포함) ----------
test('점수: 시간 점수에 보너스를 더함', () => {
  assert.equal(L.totalScore(12.34, 0), 123);
  assert.equal(L.totalScore(12.34, 15), 138);
  assert.equal(L.totalScore(0, 5), 5);
});

test('점수: 잘못된 보너스는 0으로 처리', () => {
  for (const bad of [NaN, -5, Infinity, undefined, null]) assert.equal(L.totalScore(1, bad), 10);
});

test('점수: 보너스는 체력 1당 BONUS_PER_HP', () => {
  assert.equal(L.destroyBonus(1), CONFIG.BONUS_PER_HP);
  assert.equal(L.destroyBonus(2), CONFIG.BONUS_PER_HP * 2);
  assert.equal(L.destroyBonus(3), CONFIG.BONUS_PER_HP * 3);
  assert.equal(L.destroyBonus(0), 0);
});

test('점수: 실제 게임에서 점수 = 시간 점수 + 누적 보너스', () => {
  const game = L.createGame(seededRng(23));
  while (!game.over && game.elapsed < 30) L.stepGame(game, 1 / 60, {});
  assert.ok(game.destroyed > 0, '가만히 있어도 위로 쏜 탄에 부서진 운석이 있다');
  assert.equal(game.score, L.scoreFromElapsed(game.elapsed) + game.bonus);
});

// ---------- 파편 ----------
test('파편: 부서진 위치 주변에 크기에 비례한 개수로 생김', () => {
  const small = L.createDebris(50, 60, 5, seededRng(24));
  const big = L.createDebris(50, 60, 16, seededRng(24));
  assert.ok(small.length >= 6);
  assert.ok(big.length > small.length);
  for (const p of big) {
    assert.ok(Math.hypot(p.x - 50, p.y - 60) <= 16);
    assert.ok(p.life > 0 && p.life <= CONFIG.DEBRIS_LIFE);
    assert.equal(p.maxLife, p.life);
  }
});

test('파편: 시간이 지나면 움직이고 수명이 다하면 모두 사라짐', () => {
  let pieces = L.createDebris(50, 60, 10, seededRng(25));
  const first = { x: pieces[0].x, y: pieces[0].y };
  pieces = L.stepDebris(pieces, 0.05);
  assert.ok(pieces[0].x !== first.x || pieces[0].y !== first.y);
  for (let i = 0; i < 20; i++) pieces = L.stepDebris(pieces, 0.05);
  assert.equal(pieces.length, 0);
});

test('파편: 잘못된 dt는 무시', () => {
  const pieces = L.createDebris(50, 60, 10, seededRng(26));
  const copy = JSON.stringify(pieces);
  for (const dt of [0, -1, NaN]) assert.equal(JSON.stringify(L.stepDebris(pieces, dt)), copy);
});

test('공격: 체력 정보가 없는 운석도 크기에 맞는 체력으로 맞아서 부서짐', () => {
  const game = quietGame(27);
  game.fireTimer = 1e9;
  const meteor = { x: 60, y: 100, radius: 6, speed: 0, variant: 0 };
  game.meteors.push(meteor);
  game.bullets.push({ x: 60, y: 110 });
  L.stepGame(game, 1 / 60, {});
  assert.equal(game.meteors.length, 0);
  assert.equal(game.bonus, L.destroyBonus(L.meteorHp(6)));
});
