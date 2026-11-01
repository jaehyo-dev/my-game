// 배경음 악보 자동 테스트: 악보가 올바른지와 반복 재생에 문제가 없는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/music.js');

test('음악: 음 이름을 주파수로 바꿈', () => {
  assert.equal(M.noteFrequency('A4'), 440);
  assert.ok(Math.abs(M.noteFrequency('C4') - 261.6256) < 0.001);
  assert.ok(Math.abs(M.noteFrequency('A5') - 880) < 1e-9);
  assert.ok(Math.abs(M.noteFrequency('C#4') - M.noteFrequency('Db4')) < 1e-9);
  for (const bad of ['H4', 'A', 'A10', '', null, '-', '.']) assert.equal(M.noteFrequency(bad), null, String(bad));
});

test('음악: 모든 마디가 16칸이고 음 이름이 올바름', () => {
  assert.equal(M.SONG.lead.length, M.SONG.bassRoots.length);
  const notes = M.parseMelody(M.SONG.lead, M.SONG.stepsPerBar);
  assert.ok(notes.length > 50);
  for (const n of notes) {
    // 사각파 선율이 너무 낮거나 귀가 아플 만큼 높지 않게 한다.
    assert.ok(n.freq >= 180 && n.freq <= 1300, `${n.step}칸 ${n.freq}Hz`);
    assert.ok(n.steps >= 1);
  }
});

test('음악: 잘못된 악보는 예외로 알려 줌', () => {
  assert.throws(() => M.parseMelody(['C5 . .'], 16), /칸 수/);
  assert.throws(() => M.parseMelody(['- . . . . . . . . . . . . . . .'], 16), /늘일 음/);
  assert.throws(() => M.parseMelody(['X9 . . . . . . . . . . . . . . .'], 16), /잘못된 음/);
  assert.throws(() => M.buildDrums('K . Z . . . . . . . . . . . . .', 1, 16), /잘못된 드럼/);
});

test('음악: 곡 전체가 마디 수 × 16칸이고 모든 칸 이벤트가 범위 안', () => {
  const song = M.buildSong();
  assert.equal(song.stepCount, M.SONG.lead.length * 16);
  assert.equal(song.steps.length, song.stepCount);
  // 150BPM의 16분음표 = 0.1초
  assert.ok(Math.abs(song.stepSeconds - 0.1) < 1e-9);
  const voices = new Set();
  for (const events of song.steps) for (const e of events) voices.add(e.voice);
  assert.deepEqual([...voices].sort(), ['bass', 'hat', 'kick', 'lead', 'snare']);
});

test('음악: 늘인 음이 곡 끝을 넘어 처음과 겹치지 않음(루프 이음새)', () => {
  const song = M.buildSong();
  song.steps.forEach((events, step) => {
    for (const e of events) {
      if (e.steps) assert.ok(step + e.steps <= song.stepCount, `${step}칸 음이 루프를 넘음`);
    }
  });
});

test('음악: 베이스는 반 마디마다 근음과 옥타브를 번갈아 침', () => {
  const bass = M.buildBass([['C3', 'G2']], 16);
  assert.equal(bass.length, 8);
  assert.equal(bass[0].freq, M.noteFrequency('C3'));
  assert.equal(bass[1].freq, M.noteFrequency('C3') * 2);
  assert.equal(bass[4].step, 8);
  assert.equal(bass[4].freq, M.noteFrequency('G2'));
});
