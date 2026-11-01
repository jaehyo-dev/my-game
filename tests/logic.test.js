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
