import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * I-028(`docs/ISSUES.md`) 해소 — 31일차, DESIGN.
 *
 * `src/app/globals.css`는 다크 토큰 값을 **두 곳**에 중복 정의한다 — 명시 토글용 `.dark`
 * 클래스와, ThemeProvider가 아직 안 돈 no-JS 구간을 위한 `@media (prefers-color-scheme: dark)`
 * 폴백(`:root:not(.light):not(.dark)`). 두 블록은 값이 완전히 같아야 하는데(파일 자체 주석이
 * "값을 고칠 때 두 곳을 함께 고친다"고 요구한다) 그걸 강제하는 자동 검증이 없었다 — 사람이
 * 한쪽만 고쳐도 아무것도 실패하지 않았다. 이 테스트가 그 자동 검증이다.
 *
 * **왜 `src/lib/rules/`인가**: 여기 CSS 파싱 로직은 이 파일 전용 어서션 헬퍼일 뿐 다른 곳에서
 * 재사용할 "판정" 함수가 아니라서 별도 `.ts` 소스 모듈로 승격하지 않고 테스트 파일에 그대로
 * 둔다. `readFileSync`·정규식만 쓰고 React·Next·데이터 접근 레이어를 import하지 않아
 * `eslint.config.mjs` zone 1 제약과 충돌하지 않고, `vitest.config.ts`의 include 글롭이 이미
 * `src/lib/rules/**\/*.test.ts`를 넓게 잡아 둬(그 문서 자신이 "이번 회차에 실제로 테스트를 쓴
 * 파일은 3개뿐이고 다른 lib/rules/*.ts에 테스트가 없다고 이 설정의 결함은 아니다"라고 명시)
 * 새 include 설정 없이 그대로 돌아간다 — D-052 최소 스펙 결정과 충돌하지 않는다.
 *
 * **D-026 경계**: `--crew-1`..`--crew-12`는 라이트·다크 단일값이라 두 다크 블록 어디에도
 * 재정의되지 않는다(`@theme inline`의 주석 참고) — 이 테스트는 그 사실도 함께 고정해, 누군가
 * 실수로 크루 토큰을 다크 블록에 추가해도(D-026 위반) 잡아낸다.
 */

const GLOBALS_CSS_PATH = path.resolve(__dirname, "../../app/globals.css");

/** `openBraceIndex`에서 시작하는 `{`와 짝이 맞는 `}`까지의 내용을 중첩 포함해 추출한다. */
function extractBraceBlock(css: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        return css.slice(openBraceIndex + 1, i);
      }
    }
  }
  throw new Error("매칭되는 닫는 중괄호를 찾지 못했다 — globals.css 구조가 바뀌었을 수 있다.");
}

/** `selectorPattern`이 매치되는 첫 규칙 블록(중첩 포함)의 내용을 돌려준다. */
function findRuleBlock(css: string, selectorPattern: RegExp): string {
  const match = selectorPattern.exec(css);
  if (!match) {
    throw new Error(`셀렉터를 찾지 못했다: ${selectorPattern} — globals.css 구조가 바뀌었을 수 있다.`);
  }
  const openBraceIndex = css.indexOf("{", match.index);
  return extractBraceBlock(css, openBraceIndex);
}

/** 블록 내용에서 커스텀 프로퍼티(`--xxx: value;`) 선언만 추출한다. */
function parseCustomProperties(blockContent: string): Map<string, string> {
  const declarations = new Map<string, string>();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockContent))) {
    declarations.set(m[1], m[2].trim());
  }
  return declarations;
}

describe("I-028 · 다크 토큰 두 블록(.dark / prefers-color-scheme 폴백) 동기화", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf-8");

  // `.dark {` 자체(`:not(.dark)`처럼 뒤에 `)`가 오는 경우와는 `\s*\{`로 구분된다).
  const darkClassBlock = findRuleBlock(css, /\.dark\s*\{/);
  const mediaOuterBlock = findRuleBlock(css, /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{/);
  const mediaInnerBlock = findRuleBlock(mediaOuterBlock, /:root:not\(\.light\):not\(\.dark\)\s*\{/);

  const darkDecls = parseCustomProperties(darkClassBlock);
  const mediaDecls = parseCustomProperties(mediaInnerBlock);

  it("두 블록 다 비어 있지 않다 (파싱 실패로 인한 거짓 양성 방지)", () => {
    expect(darkDecls.size).toBeGreaterThan(10);
    expect(mediaDecls.size).toBeGreaterThan(10);
  });

  it("두 블록이 정확히 같은 커스텀 프로퍼티 집합을 정의한다", () => {
    expect([...mediaDecls.keys()].sort()).toEqual([...darkDecls.keys()].sort());
  });

  it("두 블록의 모든 값이 정확히 일치한다", () => {
    const mismatches: string[] = [];
    for (const [key, value] of darkDecls) {
      const mediaValue = mediaDecls.get(key);
      if (mediaValue !== value) {
        mismatches.push(`${key}: .dark="${value}" vs media 폴백="${mediaValue}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("D-026 — 크루 팔레트(--crew-*)는 라이트·다크 단일값이라 두 블록 어디에도 재정의하지 않는다", () => {
    expect([...darkDecls.keys()].filter((k) => k.startsWith("--crew-"))).toEqual([]);
    expect([...mediaDecls.keys()].filter((k) => k.startsWith("--crew-"))).toEqual([]);
  });
});
