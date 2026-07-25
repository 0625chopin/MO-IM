# `src/lib/audit/`

운영 기반(Task 038, 18일차 BOARD) — 감사 로그·레이트 리밋 카운터·오류 추적. `src/lib/auth/`와
대칭인 독립 계층이다 — 데이터 배럴(`lib/data`)에 섞을 수 없는 이유도 같다(`lib/data/contracts.ts`의
CON-05·CON-06, "이 레이어의 어떤 함수도 쿠키·세션·요청 객체를 직접 읽지 않는다"). `eslint.config.mjs`
zone 8이 이 디렉터리에 Supabase 클라이언트 팩터리(`server`·`client`·`env`)만 재사용을 허용하고
도메인 구현 딥 임포트는 막는다(zone 7과 동일 패턴).

## 무엇이 여기 오는가

- **`audit-log.ts`** — `recordAuditLog`. NFR-015 대상 행위(권한 변경·투표 종료·게시물 강제 삭제)를
  `public.audit_logs`에 기록한다. 테이블 자체는 Task 028이 이미 만들었고 `anon`/`authenticated`
  완전 거부 RLS라(`docs/decisions/rls-policies-029b.md`) service-role 클라이언트가 필요하다
  (`src/lib/auth/lockout.ts`와 같은 패턴). 강퇴·해산은 아직 그 기능 자체가 구현되지 않아
  (`leave-crew.ts` docstring 참고) 호출부가 없다 — 후속 Task가 그 기능을 만들 때 이 함수를
  재사용하면 된다.
- **`rate-limit-store.ts`** — `getRecentHandleSearchAttempts`/`recordHandleSearchAttempt`.
  D-005·NFR-016(핸들 검색 계정당 분당 20회) 카운터. `public.handle_search_attempts` 읽기·쓰기만
  하고 **판정하지 않는다** — 판정은 `lib/rules/rate-limit.ts`의 `evaluateFixedWindowRateLimit`
  (순수 함수)에 맡긴다. `src/lib/auth/resend-attempts.ts`와 완전히 같은 3단계 계약이다.
- **`error-tracking.ts`** — `captureError`. NFR-028 오류 수집의 임시 구현(구조화 로그). Sentry
  도입 결정·미결 사유는 `docs/decisions/ops-foundation-038.md` §3, 미결 등재는 `docs/ISSUES.md`
  참고. DSN이 채워지면 이 파일 안쪽만 교체하면 된다 — 호출부는 손대지 않는다.

## 무엇이 여기 오지 않는가

- 판정 로직(무엇이 리밋을 넘었는가, 감사 로그로 남길 행위인가)은 여기 두지 않는다 — 순수
  함수는 `lib/rules/`에 있다(NFR-036). 이 디렉터리는 **Supabase I/O만** 한다.
- 강퇴·해산 감사 로그 호출부, 메시지 전송·게시글 작성 레이트 리밋(NFR-016 나머지 두 항목)은
  이번 Task 038 범위 밖이다 — `docs/decisions/ops-foundation-038.md` "남은 리스크" 참고.
