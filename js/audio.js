(function (root) {
  'use strict';

  // 오디오 문맥과 음소거 상태를 모듈 내부에 보관한다.
  let context = null;
  let muted = false;
  const storeKey = 'meteor-dodge.muted';
  const storage = root.GameLogic.getSafeStorage(() => root.localStorage);

  // 저장된 설정을 읽되 저장소 접근이 막힌 환경에서는 기본값을 쓴다.
  try {
    muted = storage ? storage.getItem(storeKey) === 'true' : false;
  } catch (_) {
    muted = false;
  }

  // 사용자 입력에 반응해 오디오 문맥을 만들고 실행 상태로 복귀시킨다.
  function unlock() {
    if (context) {
      if (context.state !== 'running') {
        context.resume().catch(() => {});
      }
      return;
    }
    const AudioContextClass = root.AudioContext || root.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    try {
      context = new AudioContextClass();
      if (context.state !== 'running') {
        context.resume().catch(() => {});
      }
    } catch (_) {
      context = null;
    }
  }

  // 단일 발진기 음을 예약해 효과음 조합을 간결하게 유지한다.
  function tone(freq, duration, type, volume, delay, endFreq) {
    if (muted || !context) {
      return;
    }
    try {
      const now = context.currentTime + (delay || 0);
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
      }
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume || .08, now + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(now);
      osc.stop(now + duration + .02);
    } catch (_) {}
  }

  // 음소거 선택을 저장소에 기록하고 저장 실패는 게임 진행에 영향을 주지 않게 한다.
  function setMuted(value) {
    muted = !!value;
    try {
      if (storage) {
        storage.setItem(storeKey, String(muted));
      }
    } catch (_) {}
  }

  // 게임 장면이 호출할 공개 효과음 인터페이스를 제공한다.
  root.GameAudio = {
    unlock,
    setMuted,
    isMuted: () => muted,
    start: () => {
      tone(660, .09, 'square', .06);
      tone(880, .12, 'square', .06, .1);
    },
    collision: () => {
      tone(220, .12, 'sawtooth', .1);
      tone(90, .28, 'square', .1, .11, 45);
    },
    record: () => {
      tone(523, .1, 'square', .07);
      tone(659, .1, 'square', .07, .11);
      tone(784, .1, 'square', .07, .22);
      tone(1047, .2, 'square', .08, .33);
    }
  };
})(window);
