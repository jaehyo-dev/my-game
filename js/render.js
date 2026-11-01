(function (root) {
  'use strict';
  const config = root.GameLogic.CONFIG;
  function hash(n) { let x = n | 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return (x ^ (x >>> 16)) >>> 0; }
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const stars = Array.from({ length: 48 }, (_, i) => ({ x: hash(i * 71) % 240, y: hash(i * 137 + 9) % 400, size: i % 7 === 0 ? 2 : 1, speed: 8 + (i % 4) * 7 }));
    function meteor(m) {
      const r = m.radius, cx = Math.round(m.x), cy = Math.round(m.y), unit = Math.max(2, Math.floor(r / 5));
      const seed = Math.round(r * 31 + m.variant * 997);
      ctx.fillStyle = '#69465a';
      for (let y = -r; y <= r; y += unit) for (let x = -r; x <= r; x += unit) {
        const d = Math.hypot(x + unit / 2, y + unit / 2), wobble = ((hash(seed + (x + r) * 19 + (y + r) * 37) % 100) / 100 - .5) * unit * .8;
        if (d <= r + wobble) ctx.fillRect(cx + x, cy + y, unit, unit);
      }
      ctx.fillStyle = '#a86a65';
      const craters = [[-.34, -.28, .18], [.28, -.12, .14], [-.05, .32, .2]][m.variant % 3];
      ctx.fillRect(cx + Math.round(craters[0] * r), cy + Math.round(craters[1] * r), Math.max(unit, Math.round(r * craters[2])), unit);
      ctx.fillStyle = '#d18a70';
      ctx.fillRect(cx - Math.floor(r * .42), cy - Math.floor(r * .28), unit, unit);
      ctx.fillStyle = '#45354d';
      ctx.fillRect(cx + Math.floor(r * .16), cy + Math.floor(r * .25), unit, unit);
    }
    function ship(x, t) {
      const left = Math.round(x - config.SHIP_WIDTH / 2), top = config.SHIP_Y;
      ctx.fillStyle = '#6cf2dd'; ctx.fillRect(left + 8, top, 4, 3); ctx.fillRect(left + 6, top + 3, 8, 5);
      ctx.fillStyle = '#c4fff4'; ctx.fillRect(left + 8, top + 3, 4, 4);
      ctx.fillStyle = '#7c8cff'; ctx.fillRect(left + 3, top + 8, 14, 4); ctx.fillRect(left + 1, top + 12, 18, 4);
      ctx.fillStyle = '#e9f1ff'; ctx.fillRect(left + 5, top + 12, 10, 5);
      ctx.fillStyle = '#62f0d1'; ctx.fillRect(left + 4, top + 16, 3, 3); ctx.fillRect(left + 13, top + 16, 3, 3);
      if ((Math.floor(t * 12) % 2) === 0) { ctx.fillStyle = '#ffb64d'; ctx.fillRect(left + 7, top + 18, 6, 2); ctx.fillStyle = '#fff19b'; ctx.fillRect(left + 9, top + 19, 2, 1); }
    }
    function draw(state, elapsed, running) {
      ctx.fillStyle = '#080d20'; ctx.fillRect(0, 0, 240, 400);
      for (const s of stars) { const y = (s.y + elapsed * s.speed) % 400; ctx.fillStyle = s.size === 2 ? '#7281b5' : '#34446f'; ctx.fillRect(s.x, Math.floor(y), s.size, s.size); }
      if (state) { for (const m of state.meteors) meteor(m); if (running) ship(state.shipX, elapsed); }
    }
    return { draw };
  }
  root.GameRenderer = { create };
})(window);
