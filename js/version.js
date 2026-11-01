// 현재 게임 버전. 버전을 올릴 때는 이 값, package.json, CHANGELOG.md를 함께 바꾼다.
// (tests/version.test.js가 세 값이 같은지 확인한다.)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameVersion = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return Object.freeze({ VERSION: '1.2.0' });
});
