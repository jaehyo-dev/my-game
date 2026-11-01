(function (root) {
  'use strict';

  // 오디오 문맥과 음소거 상태를 모듈 내부에 보관한다.
  let context = null;
  let muted = false;
  let noiseBuffer = null;
  const storeKey = 'meteor-dodge.muted';
  const storage = root.GameLogic.getSafeStorage(() => root.localStorage);

  // 배경음 재생 상태. 효과음보다 작게 깔리도록 전체 음량을 낮게 둔다.
  const MUSIC_VOLUME = 0.55; // 배경음 버스 음량 (각 악기 음량에 곱해진다)
  const LOOKAHEAD = 0.12; // 미리 예약해 둘 시간 (초)
  const SCHEDULE_MS = 25; // 예약 확인 주기 (밀리초)
  const song = root.GameMusic.buildSong();
  let musicWanted = false; // 게임이 배경음을 원하는 상태인지 (음소거와 별개)
  let musicTimer = null;
  let musicBus = null;
  let nextStepTime = 0;
  let stepIndex = 0;

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
    // 배경음을 기다리던 중에 문맥이 처음 생겼다면 바로 시작한다.
    syncMusic();
  }

  // 단일 발진기 음을 예약해 효과음 조합을 간결하게 유지한다.
  // destination을 주면 그쪽(배경음 버스)으로, 없으면 스피커로 바로 보낸다.
  function tone(freq, duration, type, volume, delay, endFreq, destination, startAt) {
    if (muted || !context) {
      return;
    }
    try {
      const now = typeof startAt === 'number' ? startAt : context.currentTime + (delay || 0);
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
      gain.connect(destination || context.destination);
      osc.start(now);
      osc.stop(now + duration + .02);
    } catch (_) {}
  }

  // 드럼과 파괴음에 쓸 백색 잡음 버퍼를 한 번만 만든다.
  function getNoise() {
    if (!noiseBuffer && context) {
      const length = Math.floor(context.sampleRate * .3);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return noiseBuffer;
  }

  // 필터를 거친 짧은 잡음. filterType으로 하이햇(고음)과 스네어·파괴음(중음)을 만든다.
  function noise(duration, volume, filterType, filterFreq, destination, startAt) {
    if (muted || !context) {
      return;
    }
    try {
      const now = typeof startAt === 'number' ? startAt : context.currentTime;
      const source = context.createBufferSource();
      source.buffer = getNoise();
      const filter = context.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, now);
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination || context.destination);
      source.start(now);
      source.stop(now + duration + .02);
    } catch (_) {}
  }

  // 한 칸(16분음표)에 들어 있는 음과 드럼을 정확한 시각에 예약한다.
  function playStep(events, time) {
    const length = song.stepSeconds;
    for (const e of events) {
      if (e.voice === 'lead') {
        // 사각파 선율. 효과음(.06~.1)보다 훨씬 작다.
        tone(e.freq, e.steps * length * .9, 'square', .03, 0, 0, musicBus, time);
      } else if (e.voice === 'bass') {
        tone(e.freq, length * .9, 'triangle', .08, 0, 0, musicBus, time);
      } else if (e.voice === 'kick') {
        tone(150, .09, 'sine', .09, 0, 50, musicBus, time);
      } else if (e.voice === 'snare') {
        noise(.07, .05, 'bandpass', 1800, musicBus, time);
      } else if (e.voice === 'hat') {
        noise(.03, .025, 'highpass', 7000, musicBus, time);
      }
    }
  }

  // 미리보기 시간 안에 들어오는 칸들을 예약한다.
  function scheduleMusic() {
    if (!context || !musicBus) {
      return;
    }
    const now = context.currentTime;
    // 탭 전환 등으로 많이 밀렸으면 몰아서 재생하지 않고 지금부터 다시 맞춘다.
    if (nextStepTime < now - .2) {
      nextStepTime = now + .05;
    }
    while (nextStepTime < now + LOOKAHEAD) {
      playStep(song.steps[stepIndex], nextStepTime);
      nextStepTime += song.stepSeconds;
      stepIndex = (stepIndex + 1) % song.stepCount;
    }
  }

  // 배경음 예약을 멈추고, 이미 예약된 음은 버스를 짧게 줄여 끊김 없이 지운다.
  function silenceMusic() {
    if (musicTimer !== null) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    if (musicBus && context) {
      const bus = musicBus;
      try {
        const now = context.currentTime;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0, now + .05);
        setTimeout(() => {
          try {
            bus.disconnect();
          } catch (_) {}
        }, 200);
      } catch (_) {}
    }
    musicBus = null;
  }

  // 원하는 상태(musicWanted)와 음소거, 오디오 문맥 여부에 맞춰 배경음을 켜거나 끈다.
  function syncMusic() {
    const shouldPlay = musicWanted && !muted && !!context;
    if (!shouldPlay) {
      silenceMusic();
      return;
    }
    if (musicTimer !== null) {
      return;
    }
    try {
      musicBus = context.createGain();
      musicBus.gain.setValueAtTime(MUSIC_VOLUME, context.currentTime);
      musicBus.connect(context.destination);
    } catch (_) {
      musicBus = null;
      return;
    }
    // 시작 효과음과 겹치지 않게 살짝 늦게 다음 박을 시작한다. 위치(stepIndex)는 이어 간다.
    nextStepTime = context.currentTime + .3;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, SCHEDULE_MS);
  }

  // 음소거 선택을 저장소에 기록하고 저장 실패는 게임 진행에 영향을 주지 않게 한다.
  // 음소거하면 배경음도 함께 멈추고, 해제하면 게임 중일 때 다시 재생한다.
  function setMuted(value) {
    muted = !!value;
    try {
      if (storage) {
        storage.setItem(storeKey, String(muted));
      }
    } catch (_) {}
    syncMusic();
  }

  // 게임 장면이 호출할 공개 소리 인터페이스를 제공한다.
  root.GameAudio = {
    unlock,
    setMuted,
    isMuted: () => muted,
    // 새 판마다 배경음을 처음부터 다시 시작한다.
    startMusic: () => {
      musicWanted = true;
      silenceMusic();
      stepIndex = 0;
      syncMusic();
    },
    stopMusic: () => {
      musicWanted = false;
      silenceMusic();
    },
    // 탭이 숨겨졌을 때 잠시 멈추고, 돌아오면 이어서 재생한다.
    pauseMusic: () => silenceMusic(),
    resumeMusic: () => syncMusic(),
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
    },
    // 운석이 부서질 때 짧게 '퍽' 하는 소리. 큰 운석일수록 낮게 울린다.
    destroy: (radius) => {
      const big = radius > 12;
      noise(.12, .07, 'bandpass', big ? 900 : 1500);
      tone(big ? 260 : 400, .08, 'square', .045, 0, big ? 90 : 140);
    }
  };
})(window);
