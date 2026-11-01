// 배경음 악보와 악보 해석기.
// 이 게임을 위해 새로 작곡한 경쾌한 8비트 루프다(다장조, 150BPM, 16마디).
// 소리를 내는 부분(audio.js)과 분리해 Node 자동 테스트에서 악보를 검증할 수 있게 한다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameMusic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 악보 표기: 한 마디 = 16칸(16분음표). 음 이름은 새 음, '-'는 앞 음 늘이기, '.'는 쉼표.
  // 드럼: K = 킥, S = 스네어, H = 하이햇.
  const SONG = Object.freeze({
    bpm: 150,
    stepsPerBar: 16,
    // 주 선율 (사각파)
    lead: Object.freeze([
      // A: 통통 튀는 분산화음으로 시작
      'C5 . E5 G5 . C6 . G5 E5 . G5 . A5 G5 E5 .', // C
      'A4 . C5 E5 . A5 . E5 C5 . E5 . G5 E5 C5 .', // Am
      'F4 . A4 C5 . F5 . C5 A4 . C5 D5 . C5 A4 .', // F
      'G4 . B4 D5 . G5 - - F5 . E5 . D5 . B4 .', // G
      // A': 같은 시작에서 위로 올라가며 마무리
      'C5 . E5 G5 . C6 . G5 E5 . G5 . A5 G5 E5 .', // C
      'A4 . C5 E5 . A5 . E5 G5 . A5 . B5 . C6 .', // Am
      'A5 . G5 F5 . C5 . F5 G5 . F5 . D5 . B4 .', // F G
      'C5 - - . G4 . C5 . E5 . G5 . C6 - . .', // C
      // B: 높은 음에서 당김음으로 분위기 전환
      'A5 - . A5 G5 . F5 . G5 - . A5 . C6 . .', // F
      'B5 - . B5 A5 . G5 . A5 - . B5 . D6 . .', // G
      'G5 . E5 . B4 . E5 . G5 . B5 . A5 G5 E5 .', // Em
      'A5 - - . E5 . C5 . A4 . C5 . E5 . G5 .', // Am
      // B': 끝을 들어 올려 처음으로 자연스럽게 돌아간다
      'A5 - . A5 G5 . F5 . G5 - . A5 . C6 . .', // F
      'D6 - . C6 B5 . A5 . B5 - . G5 . D5 . .', // G
      'F5 . A5 . C6 . A5 . G5 . B5 . D6 . B5 .', // F G
      'C6 - - - G5 . E5 . C5 - - - . . . .', // C
    ]),
    // 마디마다 앞·뒤 반 마디의 베이스 근음 (삼각파, 옥타브를 오가며 통통 튄다)
    bassRoots: Object.freeze([
      ['C3', 'C3'], ['A2', 'A2'], ['F2', 'F2'], ['G2', 'G2'],
      ['C3', 'C3'], ['A2', 'A2'], ['F2', 'G2'], ['C3', 'C3'],
      ['F2', 'F2'], ['G2', 'G2'], ['E2', 'E2'], ['A2', 'A2'],
      ['F2', 'F2'], ['G2', 'G2'], ['F2', 'G2'], ['C3', 'C3'],
    ]),
    // 모든 마디에 반복되는 드럼 패턴
    drums: 'K . H . S . H . K . K H S . H .',
  });

  const NOTE_OFFSETS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

  // 'A4', 'C#5', 'Bb3' 같은 음 이름을 주파수(Hz)로 바꾼다. 잘못된 이름은 null.
  function noteFrequency(name) {
    const match = /^([A-G])(#|b)?(\d)$/.exec(String(name));
    if (!match) return null;
    let semitones = NOTE_OFFSETS[match[1]] + (Number(match[3]) - 4) * 12;
    if (match[2] === '#') semitones += 1;
    if (match[2] === 'b') semitones -= 1;
    return 440 * Math.pow(2, semitones / 12);
  }

  // 공백으로 나눈 마디 문자열을 칸 배열로 바꾼다.
  function barTokens(bar) {
    return String(bar).trim().split(/\s+/);
  }

  // 선율 마디들을 {step, steps, freq} 음 목록으로 바꾼다. 잘못된 칸이 있으면 예외.
  function parseMelody(bars, stepsPerBar) {
    const notes = [];
    let current = null;
    bars.forEach((bar, barIndex) => {
      const tokens = barTokens(bar);
      if (tokens.length !== stepsPerBar) {
        throw new Error(`${barIndex + 1}마디 칸 수 ${tokens.length}`);
      }
      tokens.forEach((token, i) => {
        const step = barIndex * stepsPerBar + i;
        if (token === '-') {
          if (!current) throw new Error(`${barIndex + 1}마디: 늘일 음이 없음`);
          current.steps += 1;
        } else if (token === '.') {
          current = null;
        } else {
          const freq = noteFrequency(token);
          if (!freq) throw new Error(`${barIndex + 1}마디: 잘못된 음 ${token}`);
          current = { step: step, steps: 1, freq: freq };
          notes.push(current);
        }
      });
    });
    return notes;
  }

  // 근음 목록으로 '근음 . 옥타브위 .' 를 반복하는 베이스 음 목록을 만든다.
  function buildBass(roots, stepsPerBar) {
    const notes = [];
    const half = stepsPerBar / 2;
    roots.forEach((pair, barIndex) => {
      pair.forEach((root, side) => {
        const freq = noteFrequency(root);
        if (!freq) throw new Error(`${barIndex + 1}마디: 잘못된 베이스 ${root}`);
        for (let i = 0; i < half; i += 2) {
          const step = barIndex * stepsPerBar + side * half + i;
          notes.push({ step: step, steps: 1, freq: i % 4 === 0 ? freq : freq * 2 });
        }
      });
    });
    return notes;
  }

  // 드럼 한 마디 패턴을 곡 전체 길이만큼 반복한다.
  function buildDrums(pattern, bars, stepsPerBar) {
    const tokens = barTokens(pattern);
    if (tokens.length !== stepsPerBar) throw new Error(`드럼 칸 수 ${tokens.length}`);
    const kinds = { K: 'kick', S: 'snare', H: 'hat' };
    const hits = [];
    for (let bar = 0; bar < bars; bar++) {
      tokens.forEach((token, i) => {
        if (token === '.') return;
        if (!kinds[token]) throw new Error(`잘못된 드럼 ${token}`);
        hits.push({ step: bar * stepsPerBar + i, kind: kinds[token] });
      });
    }
    return hits;
  }

  // 악보를 재생기가 바로 쓸 수 있게 칸별 이벤트 목록으로 정리한다.
  function buildSong(song) {
    const source = song || SONG;
    const stepsPerBar = source.stepsPerBar;
    const bars = source.lead.length;
    if (source.bassRoots.length !== bars) throw new Error('선율과 베이스 마디 수가 다름');
    const stepCount = bars * stepsPerBar;
    const steps = Array.from({ length: stepCount }, () => []);
    for (const note of parseMelody(source.lead, stepsPerBar)) steps[note.step].push({ voice: 'lead', steps: note.steps, freq: note.freq });
    for (const note of buildBass(source.bassRoots, stepsPerBar)) steps[note.step].push({ voice: 'bass', steps: note.steps, freq: note.freq });
    for (const hit of buildDrums(source.drums, bars, stepsPerBar)) steps[hit.step].push({ voice: hit.kind });
    return {
      stepCount: stepCount,
      stepSeconds: 60 / source.bpm / 4, // 16분음표 한 칸의 길이
      steps: steps,
    };
  }

  return { SONG, noteFrequency, parseMelody, buildBass, buildDrums, buildSong };
});
