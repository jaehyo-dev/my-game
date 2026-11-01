// CHANGELOG.md에서 버전별 내용을 꺼내는 도구.
// GitHub Actions 릴리스 워크플로와 자동 테스트가 함께 쓴다.
//   node scripts/changelog.js versions        → 기록된 버전 목록(최신순, 한 줄에 하나)
//   node scripts/changelog.js latest          → 가장 최신 버전 (게임·package.json과 다르면 실패)
//   node scripts/changelog.js notes 1.2.0     → 해당 버전의 릴리스 설명
'use strict';

const fs = require('fs');
const path = require('path');

// '## [1.2.0] - 2026-11-02' 형식의 버전 제목
const HEADING = /^## \[(\d+\.\d+\.\d+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/;

// 변경 기록 본문을 버전별 { version, date, body } 목록으로 나눈다(파일에 적힌 순서 그대로).
function parseChangelog(text) {
  const entries = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    const match = HEADING.exec(line);
    if (match) {
      current = { version: match[1], date: match[2] || null, lines: [] };
      entries.push(current);
    } else if (/^## /.test(line)) {
      current = null; // 버전이 아닌 다른 제목은 어느 버전에도 넣지 않는다
    } else if (current) {
      current.lines.push(line);
    }
  }
  return entries.map((e) => ({ version: e.version, date: e.date, body: e.lines.join('\n').trim() }));
}

// 특정 버전의 릴리스 설명. 없으면 null.
function releaseNotes(text, version) {
  const wanted = String(version).replace(/^v/, '');
  const entry = parseChangelog(text).find((e) => e.version === wanted);
  return entry ? entry.body : null;
}

// 변경 기록의 최신 버전이 게임(js/version.js)·package.json의 버전과 다른 점을 찾는다.
// 문제가 없으면 빈 배열. 자동 태그가 잘못된 버전으로 붙지 않게 막는 데 쓴다.
function versionMismatches(changelogText, gameVersion, packageVersion) {
  const latest = (parseChangelog(changelogText)[0] || {}).version;
  const problems = [];
  if (!latest) {
    problems.push('CHANGELOG.md에 버전 항목이 없습니다.');
    return problems;
  }
  if (gameVersion !== latest) problems.push(`js/version.js(${gameVersion})가 CHANGELOG 최신 버전(${latest})과 다릅니다.`);
  if (packageVersion !== latest) problems.push(`package.json(${packageVersion})이 CHANGELOG 최신 버전(${latest})과 다릅니다.`);
  return problems;
}

// 명령줄에서 실행했을 때의 동작.
function main(argv) {
  const root = path.join(__dirname, '..');
  const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const [command, version] = argv;
  if (command === 'versions') {
    process.stdout.write(parseChangelog(text).map((e) => e.version).join('\n') + '\n');
    return 0;
  }
  if (command === 'latest') {
    const gameVersion = require(path.join(root, 'js', 'version.js')).VERSION;
    const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    const problems = versionMismatches(text, gameVersion, packageVersion);
    if (problems.length) {
      process.stderr.write(problems.join('\n') + '\n');
      return 1;
    }
    process.stdout.write(parseChangelog(text)[0].version + '\n');
    return 0;
  }
  if (command === 'notes' && version) {
    const notes = releaseNotes(text, version);
    if (notes === null) {
      process.stderr.write(`CHANGELOG.md에 ${version} 항목이 없습니다.\n`);
      return 1;
    }
    process.stdout.write(notes + '\n');
    return 0;
  }
  process.stderr.write('사용법: node scripts/changelog.js versions | latest | notes <버전>\n');
  return 2;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseChangelog, releaseNotes, versionMismatches, main };
