// 버전 관리 자동 테스트: 버전 번호 일치, 변경 기록 형식, 이전 버전 보관 폴더를 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseChangelog, releaseNotes, versionMismatches, main } = require('../scripts/changelog.js');
const { VERSION } = require('../js/version.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const SEMVER = /^\d+\.\d+\.\d+$/;

// 'a.b.c' 두 개를 비교한다. a가 크면 양수.
function compareVersions(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

test('버전: 게임 버전은 메이저.마이너.패치 형식', () => {
  assert.match(VERSION, SEMVER);
});

test('버전: 게임, package.json, 변경 기록 최신 항목의 버전이 같음', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, VERSION);
  assert.equal(parseChangelog(read('CHANGELOG.md'))[0].version, VERSION);
});

test('버전: 시작 화면의 버전 문구도 같은 버전', () => {
  const html = read('index.html');
  assert.match(html, new RegExp(`<span id="version">v${VERSION.replace(/\./g, '\\.')}</span>`));
  assert.match(html, /<script src="js\/version\.js"><\/script>/);
  assert.match(html, /<a id="old-versions" href="versions\/">이전 버전<\/a>/);
});

test('변경 기록: 모든 항목이 형식에 맞고 최신순이며 내용이 있음', () => {
  const entries = parseChangelog(read('CHANGELOG.md'));
  assert.ok(entries.length >= 3);
  const seen = new Set();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    assert.match(e.version, SEMVER);
    assert.match(e.date || '', /^\d{4}-\d{2}-\d{2}$/, `${e.version} 날짜`);
    assert.ok(e.body.length > 20, `${e.version} 내용`);
    assert.ok(!seen.has(e.version), `${e.version} 중복`);
    seen.add(e.version);
    if (i > 0) assert.ok(compareVersions(entries[i - 1].version, e.version) > 0, `${e.version} 순서`);
  }
  for (const v of ['1.0.0', '1.1.0', '1.2.0']) assert.ok(seen.has(v), `${v} 항목`);
});

test('변경 기록: 버전별 릴리스 설명을 정확히 잘라냄', () => {
  const text = [
    '# 기록', '', '머리말', '',
    '## [2.0.0] - 2026-01-02', '', '### 추가', '- 새 것', '',
    '## [1.0.0] - 2026-01-01', '- 첫 것', '',
    '## 링크', '- 버전이 아닌 부분',
  ].join('\n');
  assert.equal(releaseNotes(text, '2.0.0'), '### 추가\n- 새 것');
  assert.equal(releaseNotes(text, 'v1.0.0'), '- 첫 것', '앞의 v는 무시하고, 버전이 아닌 제목 아래는 넣지 않음');
  assert.equal(releaseNotes(text, '3.0.0'), null);
  assert.deepEqual(parseChangelog(text).map((e) => e.date), ['2026-01-02', '2026-01-01']);
});

test('변경 기록: Windows 줄바꿈도 처리', () => {
  assert.equal(releaseNotes('## [1.0.0] - 2026-01-01\r\n- 첫 것\r\n', '1.0.0'), '- 첫 것');
});

test('이전 버전: 현재보다 낮은 모든 기록 버전이 versions 폴더에 보관되어 있음', () => {
  const kept = fs.readdirSync(path.join(ROOT, 'versions'), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  const older = parseChangelog(read('CHANGELOG.md')).map((e) => e.version).filter((v) => compareVersions(v, VERSION) < 0);
  for (const v of older) assert.ok(kept.includes(`v${v}`), `versions/v${v} 없음`);
  assert.ok(!kept.includes(`v${VERSION}`), '현재 버전은 보관 폴더가 아니라 루트에 있어야 함');
});

test('이전 버전: 보관된 각 버전의 index.html이 쓰는 파일이 모두 있음', () => {
  const dirs = fs.readdirSync(path.join(ROOT, 'versions'), { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(dirs.length > 0);
  for (const dir of dirs) {
    const base = path.join(ROOT, 'versions', dir.name);
    const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((r) => !/^(https?:|#|\/)/.test(r));
    assert.ok(refs.length >= 2, `${dir.name} 참조 파일`);
    for (const ref of refs) assert.ok(fs.existsSync(path.join(base, ref)), `${dir.name}/${ref} 없음`);
  }
});

test('이전 버전: 목록 페이지가 보관된 모든 버전과 최신 버전으로 연결됨', () => {
  const html = read('versions/index.html');
  const dirs = fs.readdirSync(path.join(ROOT, 'versions'), { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const dir of dirs) assert.ok(html.includes(`href="${dir.name}/"`), `${dir.name} 링크 없음`);
  assert.ok(html.includes('href="../"'));
});

test('자동 태그: 최신 버전이 게임·package.json과 같으면 문제 없음', () => {
  const text = '## [1.3.0] - 2026-01-03\n- 새 것\n\n## [1.2.0] - 2026-01-02\n- 예전 것\n';
  assert.deepEqual(versionMismatches(text, '1.3.0', '1.3.0'), []);
});

test('자동 태그: 버전이 하나라도 다르면 이유와 함께 알려 줌', () => {
  const text = '## [1.3.0] - 2026-01-03\n- 새 것\n';
  const game = versionMismatches(text, '1.2.0', '1.3.0');
  assert.equal(game.length, 1);
  assert.match(game[0], /js\/version\.js\(1\.2\.0\)/);
  const pkg = versionMismatches(text, '1.3.0', '1.2.0');
  assert.equal(pkg.length, 1);
  assert.match(pkg[0], /package\.json\(1\.2\.0\)/);
  assert.equal(versionMismatches('# 기록만 있고 버전 없음', '1.0.0', '1.0.0').length, 1);
});

test('자동 태그: latest 명령은 현재 저장소의 최신 버전을 출력하고 성공', () => {
  const written = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  let code;
  try {
    code = main(['latest']);
  } finally {
    process.stdout.write = original;
  }
  assert.equal(code, 0);
  assert.equal(written.join('').trim(), VERSION);
});

test('자동 태그: 워크플로가 master 푸시 때 최신 버전 태그와 릴리스를 만들도록 설정됨', () => {
  const yml = read('.github/workflows/release.yml');
  assert.match(yml, /branches: \[master\]/);
  assert.match(yml, /contents: write/);
  assert.match(yml, /node scripts\/changelog\.js latest/);
  assert.match(yml, /git tag -a "\$tag"/);
  assert.match(yml, /gh release create "\$tag"/);
  // 경로 필터가 있으면 CHANGELOG를 안 바꾼 푸시에서 실행되지 않으므로 두지 않는다.
  assert.doesNotMatch(yml, /paths:/);
});
