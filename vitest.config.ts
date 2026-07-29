import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 테스트 러너 최소 도입(D-052, 24일차 — 21일차에 "다음 판단 시점은 043B"로 남겨 둔 결정을
 * 사용자 승인으로 확정).
 *
 * **범위는 최소 스펙 그대로다** — `src/lib/rules/quorum.ts`·`poll-decision.ts`·
 * `poll-eligibility.ts` 3개 순수 함수 모듈만 대상이다(D-052 "대신 남기는 것" 절). 이
 * `include` 글롭은 `src/lib/rules/**`를 넓게 잡아 두지만, 이번 회차에 실제로 테스트를 쓴
 * 파일은 위 3개뿐이다 — 다른 `lib/rules/*.ts`에 테스트가 없다고 이 설정의 결함은 아니다.
 *
 * **왜 이 계층만 먼저인가(I-071)**: `computeQuorum`·`decidePollOutcome`이 SQL
 * (`run_poll_auto_close_job`)로 이중 구현돼 있고(I-071), 이 이중화는 정적 분석(예:
 * I-074식 ESLint import 검사)으로 잡을 수 없는 **의미(semantics) 문제**라 반드시 실행·비교가
 * 필요하다는 것이 21일차 CORE 판단이었다(D-052 "근거② 정정" 참고). 이번 도입은 그 판단을
 * 실행 가능하게 만드는 최소 조치다 — 다만 **TS 함수와 SQL 함수의 출력을 실제로 대조하는
 * 계약 테스트는 이번 범위가 아니다**(사용자가 최소 스펙을 골랐다, 아래 "남는 것" 참고).
 *
 * **Next.js 16 + Turbopack + React Compiler와 독립적이다** — Vitest는 Vite 기반이라 `next.config.ts`
 * (Turbopack 설정)를 전혀 참조하지 않는다. `src/lib/rules/**`는 React·Next를 import하지
 * 않는 순수 함수 계층(zone 1, `eslint.config.mjs`)이라 애초에 이 구분이 문제가 되지 않는다
 * — jsdom 같은 DOM 환경도 필요 없어 `environment: "node"`(기본값)를 그대로 둔다.
 *
 * **CI 연동은 별개 결정으로 분리한다(이번에 하지 않는다)** — 이 저장소에는 아직 CI 자체가
 * 없다(`CLAUDE.md`). `npm test`(`vitest run`, watch 없이 1회 실행)만 로컬에서 통과하면 된다.
 *
 * **남는 것**: I-071이 요구하는 "TS 판정 함수와 SQL 판정 함수가 같은 입력에 같은 출력을
 * 내는가" 계약 테스트는 이 도입만으로는 자동화되지 않는다 — SQL 쪽(`run_poll_auto_close_job`)을
 * 실행하려면 Supabase 프로젝트가 필요해 이 Vitest 설정(순수 Node 프로세스) 밖의 별도 조사가
 * 필요하다. 다음 회차 후보로 남긴다(`docs/ISSUES.md` I-071 갱신 참고).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  test: {
    include: ["src/lib/rules/**/*.test.ts"],
  },
});
