/**
 * 새 한자의 획순 데이터를 KanjiVG 에서 받아 public/kanji/ 에 넣습니다.
 *
 *   node scripts/add-kanji.mjs 傘 靴 眼鏡
 *
 * 이미 있는 글자는 건너뜁니다. 결과 파일은 커밋해서 함께 올리세요.
 * (빌드할 때마다 내려받지 않으므로 배포가 빨라집니다.)
 *
 * 출처: KanjiVG — CC BY-SA 3.0 · https://kanjivg.tagaini.net/
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/kanji');
const RAW = (hex) =>
  `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`;

const chars = process.argv.slice(2).flatMap((arg) => [...arg]);
if (chars.length === 0) {
  console.log('사용법: node scripts/add-kanji.mjs 注 文 配');
  process.exit(0);
}

await mkdir(OUT, { recursive: true });

const indexPath = path.join(OUT, 'index.json');
const index = existsSync(indexPath)
  ? JSON.parse(await readFile(indexPath, 'utf8'))
  : {};

for (const ch of chars) {
  if (!/[\u4E00-\u9FFF]/.test(ch)) {
    console.log(`건너뜀 (한자 아님): ${ch}`);
    continue;
  }
  const hex = ch.codePointAt(0).toString(16).padStart(5, '0');
  const name = ch.codePointAt(0).toString(16).padStart(4, '0');
  const file = path.join(OUT, `${name}.json`);

  if (existsSync(file)) {
    console.log(`이미 있음: ${ch}`);
    index[ch] = name;
    continue;
  }

  const res = await fetch(RAW(hex));
  if (!res.ok) {
    console.error(`실패: ${ch} (KanjiVG 에 ${hex}.svg 없음)`);
    continue;
  }
  const svg = await res.text();

  // <path ... d="..."> 를 파일에 적힌 순서대로 = 획순대로 뽑습니다.
  const strokes = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (strokes.length === 0) {
    console.error(`실패: ${ch} — 획 데이터를 찾지 못했습니다`);
    continue;
  }

  await writeFile(file, JSON.stringify(strokes));
  index[ch] = name;
  console.log(`추가: ${ch} (${strokes.length}획) → public/kanji/${name}.json`);
}

await writeFile(indexPath, JSON.stringify(index, null, 1));
console.log(`\n총 ${Object.keys(index).length}자 보유`);
