// 난이도 밸런스 시뮬레이션: "1분 안에 대부분 게임오버"를 봇으로 검증한다.
// 실제 사람 대신 실력이 다른 봇을 여러 판 돌려 생존 시간 분포를 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const { seededRng } = require('./helpers.js');

const { CONFIG } = L;
const FRAME = 1 / 60;
const TIME_LIMIT = 120; // 시뮬레이션을 끊는 시간(초)
const MOVE_PER_FRAME = CONFIG.SHIP_SPEED * FRAME;

// 경로 탐색 격자. 한 칸 시간 동안 키보드로 정확히 한 칸 움직일 수 있게 맞춘다.
const PLAN_DT = 0.05;
const PLAN_CELL = CONFIG.SHIP_SPEED * PLAN_DT;
const KEYBOARD_CELLS = 1; // 키보드는 탐색 한 칸 시간에 한 칸 이동
const DRAG_CELLS = Math.floor((CONFIG.DRAG_SPEED * PLAN_DT) / PLAN_CELL); // 드래그는 훨씬 멀리 이동
const PLAN_STEPS = 30; // 1.5초 앞까지 내다본다
const MAX_OFFSET = Math.ceil(CONFIG.WORLD_WIDTH / PLAN_CELL);

// 여유 거리 margin을 두고 위치 x, k칸 뒤 시점에 안전한지 확인한다.
function safeAt(x, k, meteors, margin) {
  const time = k * PLAN_DT;
  const box = L.shipHitbox(x);
  box.x -= margin;
  box.width += margin * 2;
  for (const m of meteors) {
    if (L.circleHitsRect({ x: m.x, y: m.y + m.speed * time, radius: m.radius }, box)) return false;
  }
  return true;
}

// 화면에 보이는 운석을 모두 아는 상태에서 PLAN_STEPS 뒤까지 살아남는 경로를 찾아
// holdSteps칸 뒤에 있어야 할 위치(경유 지점)를 돌려준다. 앞으로 생길 운석은 모른다.
// 오래 살아남는 경로 중에서는 화면 가운데에 가까운 쪽을 고른다(벽에 몰리면 불리하므로).
function planWaypoint(game, margin, holdSteps, maxCells) {
  const originX = game.shipX;
  const centerX = CONFIG.WORLD_WIDTH / 2;
  // 키: 현재 위치에서 떨어진 칸 수, 값: 그 칸에 이르는 경로의 경유 지점
  let frontier = new Map([[0, originX]]);
  // 제자리부터 가까운 이동 순으로 시도한다.
  const moves = [0];
  for (let c = 1; c <= maxCells; c++) moves.push(-c, c);
  for (let k = 1; k <= PLAN_STEPS; k++) {
    const next = new Map();
    const checked = new Set(); // 같은 시점의 같은 칸은 한 번만 검사한다
    for (const [offset, waypoint] of frontier) {
      for (const move of moves) {
        const to = offset + move;
        if (Math.abs(to) > MAX_OFFSET || checked.has(to)) continue;
        checked.add(to);
        const x = originX + to * PLAN_CELL;
        if (x !== L.clampShipX(x)) continue;
        if (!safeAt(x, k, game.meteors, margin)) continue;
        next.set(to, k <= holdSteps ? x : waypoint);
      }
    }
    if (next.size === 0) break; // 더 버틸 경로가 없으면 지금까지 살아남은 경로에서 고른다
    frontier = next;
  }
  let bestWaypoint = originX;
  let bestDistance = Infinity;
  for (const [offset, waypoint] of frontier) {
    const distance = Math.abs(originX + offset * PLAN_CELL - centerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestWaypoint = waypoint;
    }
  }
  return bestWaypoint;
}

// 한 판을 끝까지 돌리고 생존 시간을 돌려준다.
// reaction: 다시 판단하기까지의 시간(초), margin: 운석과 두는 여유 거리(사람의 부정확함을 흉내 낸다).
// drag: true면 휴대폰처럼 드래그로, false면 키보드 속도로 움직인다.
function playGame(seed, reaction, margin, drag) {
  const game = L.createGame(seededRng(seed));
  const holdSteps = Math.max(1, Math.round(reaction / PLAN_DT));
  let target = game.shipX;
  let sinceDecision = reaction;
  while (!game.over && game.elapsed < TIME_LIMIT) {
    sinceDecision += FRAME;
    if (sinceDecision >= reaction) {
      sinceDecision = 0;
      target = planWaypoint(game, margin, holdSteps, drag ? DRAG_CELLS : KEYBOARD_CELLS);
    }
    if (drag) {
      // 드래그 속도 제한은 실제 게임 로직이 적용한다.
      L.stepGame(game, FRAME, { targetX: target });
    } else {
      // 키보드 봇은 키보드 속도 이상으로 움직이지 못한다.
      const move = L.clamp(target - game.shipX, -MOVE_PER_FRAME, MOVE_PER_FRAME);
      L.stepGame(game, FRAME, { targetX: game.shipX + move });
    }
  }
  return game.elapsed;
}

function surviveStats(games, reaction, margin, drag) {
  const times = [];
  for (let seed = 1; seed <= games; seed++) times.push(playGame(seed, reaction, margin, drag));
  times.sort((a, b) => a - b);
  return {
    min: times[0],
    median: times[Math.floor(times.length / 2)],
    max: times[times.length - 1],
    under60: times.filter((t) => t < 60).length / times.length,
  };
}

test('밸런스: 사람에 가까운 봇(판단 0.25초)은 대부분 1분 안에 게임오버', () => {
  const stats = surviveStats(100, 0.25, 4, false);
  console.log('사람형 봇', stats);
  assert.ok(stats.under60 >= 0.9, `1분 안 게임오버 비율 ${stats.under60}`);
  // 너무 어려워서 바로 끝나는 게임도 아니어야 한다.
  assert.ok(stats.median >= 15, `생존 시간 중앙값 ${stats.median}`);
});

test('밸런스: 실력 상한 봇(판단 0.05초)도 대부분 1분 안에 게임오버', () => {
  const stats = surviveStats(100, 0.05, 1, false);
  console.log('상한 봇', stats);
  assert.ok(stats.under60 >= 0.7, `1분 안 게임오버 비율 ${stats.under60}`);
});

test('밸런스: 드래그로 움직이는 사람형 봇도 대부분 1분 안에 게임오버', () => {
  const stats = surviveStats(50, 0.25, 4, true);
  console.log('드래그 사람형 봇', stats);
  assert.ok(stats.under60 >= 0.9, `1분 안 게임오버 비율 ${stats.under60}`);
  assert.ok(stats.median >= 15, `생존 시간 중앙값 ${stats.median}`);
});

test('밸런스: 가만히 있으면 금방 맞지만 시작 직후 바로 죽지는 않음', () => {
  const times = [];
  for (let seed = 1; seed <= 200; seed++) {
    const game = L.createGame(seededRng(seed));
    while (!game.over && game.elapsed < TIME_LIMIT) L.stepGame(game, FRAME, {});
    times.push(game.elapsed);
  }
  times.sort((a, b) => a - b);
  console.log('정지 봇', { min: times[0], median: times[100], max: times[199] });
  assert.ok(times[199] < 60, '가만히 있으면 반드시 1분 안에 맞아야 함');
  // 첫 운석이 우주선까지 떨어지는 시간보다 빨리 끝나면 안 된다.
  assert.ok(times[0] > 2, `최단 생존 ${times[0]}`);
});
