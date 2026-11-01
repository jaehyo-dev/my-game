(function (root) {
  'use strict';

  // 렌더러는 로직의 논리 크기를 사용해 캔버스 크기 변경에도 맞춘다.
  const config = root.GameLogic.CONFIG;

  // 정수 해시로 장식 위치를 고정해 프레임마다 무늬가 흔들리지 않게 한다.
  function hash(n) {
    let x = n | 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  // 캔버스 그리기 함수를 구성하고 장면 장식 데이터를 한 번 생성한다.
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const stars = Array.from({ length: 48 }, (_, i) => ({
      x: hash(i * 71) % config.WORLD_WIDTH,
      y: hash(i * 137 + 9) % config.WORLD_HEIGHT,
      size: i % 7 === 0 ? 2 : 1,
      speed: 8 + (i % 4) * 7
    }));

    // 점 단위 운석 조각과 음영을 그려 픽셀 아트 느낌을 유지한다.
    function meteor(m) {
      const r = m.radius;
      const cx = Math.round(m.x);
      const cy = Math.round(m.y);
      const unit = Math.max(2, Math.floor(r / 5));
      const seed = Math.round(r * 31 + m.variant * 997);
      ctx.fillStyle = '#b982a2';
      for (let y = -r; y <= r; y += unit) {
        for (let x = -r; x <= r; x += unit) {
          const d = Math.hypot(x + unit / 2, y + unit / 2);
          const wobble = ((hash(seed + (x + r) * 19 + (y + r) * 37) % 100) / 100 - .5) * unit * .8;
          if (d <= r + wobble) {
            ctx.fillRect(cx + x, cy + y, unit, unit);
          }
        }
      }
      ctx.fillStyle = '#d7a0b9';
      const craters = [[-.34, -.28, .18], [.28, -.12, .14], [-.05, .32, .2]][m.variant % 3];
      ctx.fillRect(cx + Math.round(craters[0] * r), cy + Math.round(craters[1] * r), Math.max(unit, Math.round(r * craters[2])), unit);
      ctx.fillStyle = '#f1c4a1';
      ctx.fillRect(cx - Math.floor(r * .42), cy - Math.floor(r * .28), unit, unit);
      ctx.fillStyle = '#694d70';
      ctx.fillRect(cx + Math.floor(r * .16), cy + Math.floor(r * .25), unit, unit);
    }

    // 우주선을 그리고 진행 중일 때만 불꽃을 깜박이게 한다.
    function ship(x, t, running) {
      const left = Math.round(x - config.SHIP_WIDTH / 2);
      const top = config.SHIP_Y;
      ctx.fillStyle = '#6cf2dd';
      ctx.fillRect(left + 8, top, 4, 3);
      ctx.fillRect(left + 6, top + 3, 8, 5);
      ctx.fillStyle = '#c4fff4';
      ctx.fillRect(left + 8, top + 3, 4, 4);
      ctx.fillStyle = '#7c8cff';
      ctx.fillRect(left + 3, top + 8, 14, 4);
      ctx.fillRect(left + 1, top + 12, 18, 4);
      ctx.fillStyle = '#e9f1ff';
      ctx.fillRect(left + 5, top + 12, 10, 5);
      ctx.fillStyle = '#62f0d1';
      ctx.fillRect(left + 4, top + 16, 3, 3);
      ctx.fillRect(left + 13, top + 16, 3, 3);
      if (running && Math.floor(t * 12) % 2 === 0) {
        ctx.fillStyle = '#ffb64d';
        ctx.fillRect(left + 7, top + 18, 6, 2);
        ctx.fillStyle = '#fff19b';
        ctx.fillRect(left + 9, top + 19, 2, 1);
      }
    }

    // 배경, 별, 운석, 우주선을 논리 해상도에 맞춰 그린다.
    function draw(state, elapsed, running) {
      ctx.fillStyle = '#080d20';
      ctx.fillRect(0, 0, config.WORLD_WIDTH, config.WORLD_HEIGHT);
      for (const star of stars) {
        const y = (star.y + elapsed * star.speed) % config.WORLD_HEIGHT;
        ctx.fillStyle = star.size === 2 ? '#7281b5' : '#34446f';
        ctx.fillRect(star.x, Math.floor(y), star.size, star.size);
      }
      if (state) {
        for (const item of state.meteors) {
          meteor(item);
        }
        ship(state.shipX, elapsed, running);
      }
    }

    return { draw };
  }

  root.GameRenderer = { create };
})(window);
