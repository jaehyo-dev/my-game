// 테스트 공용 도구.

// 시드를 고정할 수 있는 난수 생성기(mulberry32). 테스트 결과를 재현 가능하게 만든다.
function seededRng(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { seededRng };
