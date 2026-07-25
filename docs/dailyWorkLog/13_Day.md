# 13일차 작업 로그 (2026-07-24)

## 회차 요약
- 활성 팀원: **CORE 1명** (DESIGN·CREW·BOARD 대기). 리뷰어로 **BOARD**를 교차검증에 소환.
- 이번 회차 배치 근거: 완료 집합 {Task 001~026 전량} 기준으로 선행조건이 모두 풀린 유일한 미완료 Task는 **027**(의존 026 ✓, 12일차 완료, 선행 대기 없음). 나머지 3명의 다음 Task는 전부 027~029 의존이라 대기 — DESIGN(031·035), CREW(030, +I-016 차단), BOARD(038·033). **Phase 4(Supabase 실데이터) CORE 단독 직렬 구간의 두 번째 회차.**
- **이번 회차는 실제 Supabase 프로젝트(ref damruradpliktkrlkakl, MO-IM)에 첫 마이그레이션을 적용했다** — Phase 4에서 DB에 처음 손댄 회차다. 스키마(도메인 테이블)는 여전히 미생성(028 범위), 이번은 pg_cron 확장 활성화 + 스케줄/실패감지 기반뿐.
- 결과: 이슈 **1건(minor)** 발견 / 전건 해소. 전체 테스트 3/3 통과.

## 팀원별 완료 내역

### CORE (01.CORE.md)
- 완료 Task: **027 · pg_cron 확장 활성화와 스케줄 실행 기반 구축**
- 산출물:
  - 신규 — `supabase/migrations/20260724103449_enable_pg_cron.sql`(pg_cron 활성화: `create extension if not exists pg_cron with schema pg_catalog` + cron 스키마 권한 postgres 부여 + service_role에 `cron.job`/`cron.job_run_details` **select 전용** 권한), `supabase/migrations/20260724104430_revoke_public_from_cron_tables.sql`(교차검증 이슈 대응 — 아래 참고), `docs/decisions/cron-foundation.md`(D-037 확인 결과·마이그레이션 SQL·운영 지침·실패 감지 패턴·PUBLIC grant 조사 이력·인계 사항)
  - 수정 — `docs/prd/PRD.md`(§8.3 — pg_cron 활성화 완료 부기, D-027 요구), `docs/ROADMAP/team/01.CORE.md`(Task 027 상태 완료 마커)
  - `supabase/migrations/` 디렉터리 신규 생성
- 비고:
  - **착수 전 D-037 확인(실측)** — `list_tables`(public) `[]` 0개, `list_migrations` `[]` 0건, `list_extensions`의 pg_cron `installed_version: null`·`default_version: 1.6.4`. 낯선 테이블(player·fixture 등) 없음 → 정상 진행. 적용 후 재확인 — `list_migrations` 2건, pg_cron `installed_version 1.6.4`, public 테이블 여전히 0개.
  - **스케줄 수단·운영 지침** — Supabase Cron(pg_cron)만 사용, Vercel Cron 미사용(D-027). 동시 잡 8개·잡당 10분은 pg_cron이 자체 강제하지 않아 "잡을 등록하는 Task 034·035가 지킬 규약"으로 문서화하고 `statement_timeout` 권고.
  - **실패 감지(NFR-029)** — 이 프로젝트의 `cron.job_run_details`에는 `jobname` 컬럼이 없어 `cron.job`과 `jobid`로 조인해야 이름을 얻는다(실측 확인). "최근 24시간 실패 목록" 조인 쿼리를 문서화하고 실행 검증(등록 잡 0개라 빈 배열, 문법 정상). `cron` 스키마는 기본 postgres 전용이라 service_role에 select만 별도로 열었고 anon/authenticated는 접근 불가.
  - **도메인 잡(034 투표종료·035 채팅파기)은 대상 테이블이 아직 없어(028 전) 이번에 만들지 않았다** — 확장 활성화 + 기반·패턴만.

## 교차검증 결과
활성이 CORE 1명뿐이라 Task 027 지정 리뷰어 **BOARD**를 소환해 교차검증했다(CORE 프로필 리뷰 짝 = DESIGN·BOARD, Task 027 리뷰어 = BOARD).
- **BOARD → CORE(027) 1차**: 5개 검증 항목 **핵심 전부 PASS**. supabase MCP로 실제 프로젝트를 직접 조회(list_migrations·list_extensions·list_tables·execute_sql)하고 파일을 직접 열어 실측. 마이그레이션 실제 적용(pg_cron 1.6.4)·범위 준수(public 0개)·실패 감지 쿼리 실행 검증(빈 배열, 조인 정상)·D-027 지침·문서 정합성 모두 확인. **minor 1건 발견**(아래 이슈).
- **BOARD → CORE(027) 재검증**: minor 수정 후 재조회. no-op 실측(relacl PUBLIC 그대로)·원인 규명(owner supabase_admin·postgres 비-슈퍼유저·멤버 아님)·실효 차단선(스키마 USAGE 미부여) 유효성·cron-foundation.md 정정 서술 정확성·범위(public 0개, migrations 2건) 모두 **pass, 추가 이슈 0건**. no-op 마이그레이션은 감사 기록으로 **유지 권장**.

## 발견·해결한 이슈
minor 1건 — 보안 심층방어 계열, 비차단.

1. **[BOARD 발견 · CORE 027] `cron.job_run_details`에 PUBLIC = SELECT, DELETE 기본 grant 존재(`cron.job`엔 PUBLIC SELECT).** CORE 마이그레이션이 준 게 아니라 `create extension pg_cron` 설치 스크립트가 딸려주는 기본값(BOARD가 `information_schema.table_privileges`로 실측). 현재는 anon/authenticated에 cron 스키마 USAGE가 없어 실질 차단되나, ① cron-foundation.md 서술이 테이블 단위로 부정확, ② 향후 누군가 스키마 USAGE를 열면 즉시 로그 삭제(DELETE)까지 가능한 잠재 리스크. → **CORE가 defense-in-depth revoke 마이그레이션(`revoke_public_from_cron_tables`)을 적용했으나 실측 결과 no-op임을 발견** — 이 관리형 프로젝트의 `postgres` role은 `rolsuper=false`이고 cron 테이블 소유자는 `supabase_admin`이며 postgres는 그 멤버가 아니라, 우리 권한으로는 PUBLIC grant를 구조적으로 회수할 수 없다(`pg_class.relowner`·`pg_roles.rolsuper`·`pg_has_role`로 규명). "위험해서 안 한 것"이 아니라 "구조적으로 불가능한 것"으로 결론짓고, cron-foundation.md §4를 정정(테이블 단위 PUBLIC grant 존재 명시)·§5 신설(조사 이력·no-op 원인·실효 차단선·앞으로의 규칙: cron 스키마 USAGE를 anon/authenticated/PUBLIC에 절대 부여 금지, 필요시 SECURITY DEFINER 래퍼로 우회). BOARD 재검증 pass(relacl 값·원인·차단선 실측 일치).

## 팀장 전체 테스트 (항상 실행)
- `npm run lint`: **통과** (exit 0, 출력 없음)
- `npx tsc --noEmit`: **통과** (exit 0, 출력 없음)
- `npm run build`: **통과** (exit 0). 20개 라우트 전부 `ƒ (Dynamic)`, 정적 페이지 정상. pg_cron/마이그레이션은 앱 번들과 무관해 라우트 구성 변화 없음
- 참고: 빌드는 여전히 `--force`로 복구된 로컬 `node_modules`에서 돌았다 — I-045(temporal-polyfill peer 충돌)는 이번 회차와 무관하게 열려 있다

## 문서 갱신
- `docs/ROADMAP/team/01.CORE.md`: Task 027에 `- 상태: 완료 (13일차, 2026-07-24)` + 마이그레이션·교차검증 반영 내용
- `docs/decisions/cron-foundation.md`: 신규 — pg_cron 기반 결정·운영지침·실패감지 패턴·PUBLIC grant 조사 이력
- `docs/prd/PRD.md`: §8.3 pg_cron 활성화 완료 부기
- `supabase/migrations/`: 신규 2건(`enable_pg_cron`, `revoke_public_from_cron_tables`)
- `docs/team/*.md`: **변경 없음** — 팀원 상태 변화 없음
- `docs/ISSUES.md`: **새 이슈 등재 0건** — 이번 minor는 회차 내 발견·해소돼 등재 대상 아님

## 다음 회차에 열리는 Task

| Task | 담당 | 의존 | 비고 |
| --- | --- | --- | --- |
| **028** 데이터베이스 스키마 마이그레이션 | CORE | 026 ✓ · 027 ✓ | **027 완료로 새로 열렸다.** PRD §7 엔티티 20종 생성. 되돌리기가 가장 비싼 Task(NFR-032 투표 기록 소급 변경 금지 → 스키마 설계 시점이 마지막 기회, D-033 파티셔닝 재검토 시점). 공수 10.0인일(L, 22~24주차 3주 분량). `generate_typescript_types`로 Task 006 수기 타입 대조(R-003) |

- **028도 CORE 단독**이다. `028 → 029A → 029B`가 CORE 단독 직렬 사슬의 나머지이며, 029B가 끝나야 DESIGN 031·CREW 030이 열린다.
- **028은 이번 회차보다 훨씬 크고 비싸다** — 20 엔티티 스키마, D-019·020·025·032·033·034·035 다수 결정이 스키마 형태로 고정된다. 착수 전 `list_tables`·`list_migrations` 재확인(현재 migrations 2건은 pg_cron 관련뿐, public 테이블 0), 되돌리기 비용이 큰 결정은 반드시 리뷰어(DESIGN)와 대조(01.CORE 프로필 주의). 스키마 생성 후 `server.ts`/`client.ts`의 `createServerClient`/`createBrowserClient` 제네릭에 `Database` 타입을 연결한다(12일차 인계 사항).
- **I-045(열림)**: 다음 배포 검증·CI 도입 전 temporal-polyfill peer 충돌 근본 해결 필요(DESIGN과 함께). 028 스키마 작업과는 독립.

## git
- 브랜치: `day-13` (`day-12`에서 분기)
- 커밋: 아래 참고
- 푸시: 사용자 확인 대기
