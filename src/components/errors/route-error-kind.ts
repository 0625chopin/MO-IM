import type { DataErrorCode } from "@/lib/data/contracts";

/**
 * 전역 오류·경계 화면(Task 014)이 구분하는 오류 종류. `DataErrorCode`(`lib/data/contracts.ts`)를
 * 그대로 확장한다 — `"network"`는 세션 조회 실패(`components/shell/auth-session.ts`의
 * `AuthSession` `error.reason`)와, `"full"`은 정원 마감(`lib/types/meetup.types.ts`의
 * `AttendanceJoinResult.reason`)과 같은 값이다. D-030 ③이 요구하는 "네트워크 실패뿐 아니라
 * RLS 403·정원 마감·동시 수정 충돌을 구분 가능한 오류 종류로 다룬다"를 새 어휘를 만들지 않고
 * 기존 도메인 오류 타입을 재사용해 만족한다.
 *
 * 이 파일은 `.ts`(비-`.tsx`)라 `eslint.config.mjs` zone 6으로 떨어진다 — `@/lib/data/contracts`
 * type-only import가 허용된다(zone 4가 막는 것은 `src/components/**\/*.tsx` 표현 컴포넌트다).
 * `RouteErrorBoundary.tsx`(표현 컴포넌트, zone 4)는 `@/lib/data`를 직접 참조할 수 없으므로
 * 이 타입을 여기서 한 번 감싸 재노출한다(D-030 ①).
 *
 * **`"unknown"`(19일차, I-069 완화)** — `"network"`와 별개 값이다. `"network"`는
 * `global-error.tsx`(루트 레이아웃 오류 경계)가 여전히 의도적으로 쓴다(실제로 그 지점은
 * 인프라·연결 실패일 가능성이 높다는 판단은 바뀌지 않았다). `"unknown"`은 `error.tsx`(세그먼트
 * 오류 경계)의 `classifyError`가 `cause.code`로 분류하지 못했을 때만 쓴다 — 프로덕션에서는
 * Next.js가 서버 컴포넌트 예외의 `cause`를 클라이언트로 넘기지 않아(NFR-014와 같은 보안
 * 동작) 이 분류가 **항상** 이 경로로 떨어진다(I-069). "네트워크 문제"라고 원인을 단정하는
 * 대신 원인을 모른다고 정직하게 말하는 중립 문구를 쓴다 — 상세 근거는
 * `docs/ISSUES.md` I-069 참고.
 */
export type RouteErrorKind = DataErrorCode | "network" | "full" | "unknown";
