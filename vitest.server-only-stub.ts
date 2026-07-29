/**
 * `import "server-only"`용 테스트 전용 스텁 (I-121 확장, 25일차).
 *
 * `server-only` 패키지는 실제로 설치돼 있지 않다 — Next.js가 빌드 시점에만 이 지정자를
 * 자체 처리하는 가상 모듈이라(`node_modules/next/dist/docs/01-app/01-getting-started/
 * 05-server-and-client-components.md:577`, `CLAUDE.md`가 인용한 근거와 동일), Vite 기반
 * Vitest는 `node_modules/server-only`를 찾지 못해 그대로 두면 `import "server-only"`가 있는
 * 모든 `src/lib/data/supabase/**` 파일을 테스트에서 import할 수 없다.
 *
 * `vitest.config.ts`가 `resolve.alias`로 지정자 "server-only"를 이 빈 모듈에 매핑한다 —
 * 프로덕션 빌드 경로(Next.js/Turbopack)는 이 파일을 전혀 참조하지 않는다(별칭은 Vite/Vitest
 * 설정에만 있다). 부작용 없음 — Next의 실제 처리와 마찬가지로 아무것도 export하지 않는다.
 */
export {};
