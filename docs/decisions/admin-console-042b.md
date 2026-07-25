# 관리자 콘솔 (Task 042B)

- **일자**: 2026-07-25(21일차)
- **담당**: CREW(A팀) — 원 배정 DESIGN(B팀)에서 팀장이 재배정. 사유: (a) CREW가 20일차에
  042A(신고·차단)를 직접 구현했고 `docs/decisions/report-block-042a.md` §6에 042B 인계
  계약(`reports.status` 전이)을 직접 정리해 문맥을 이미 갖고 있다, (b) DESIGN은 크리티컬
  패스인 Task 036(통합 테스트)에 전념해야 한다. `docs/ROADMAP/team/03.CREW.md`에 재배정
  사유를 명시했다(원 배정 문서 `docs/ROADMAP/team/02.DESIGN.md`는 팀장이 처리, 이 팀원의
  읽기 범위 밖).
- **참조**: FR-082, D-008·D-014, NFR-015, `docs/decisions/report-block-042a.md`(§6 인계
  계약)·`rls-policies-029a.md`(§7.5)·`rls-policies-029b.md`(§8) — 셋 다 "system_admin
  식별은 새 결정이 필요하다"고 이월했다.
- **범위**: 관리자 콘솔(`/admin`) — 신고 대기열 조회·처리(기각/콘텐츠 삭제/계정 제재).

## 0. 착수 전 확인

`list_tables`(public) 결과 대상 프로젝트가 MO-IM(ref `damruradpliktkrlkakl`)임을 확인했다 —
낯선 테이블(`player`·`fixture` 등) 없음, 기존 21개 테이블 그대로. `reports`·`profiles`·
`audit_logs`는 이미 있었고(028·029A·038), 이번 회차는 여기에 컬럼 1개(`profiles.
is_system_admin`)와 RPC 2개(`admin_list_reports`·`admin_resolve_report`)만 얹었다.

## 1. FR-082 AC 정리 (구현 전 먼저 읽었다)

`requirements.md:993-999`:

- **AC1** Given 신고 대기 목록, When 처리(삭제/기각/계정 제재), Then 상태가 전이되고 감사
  로그가 남는다.
- **AC2** Given 일반 회원, When 관리자 경로 접근, Then 404가 반환된다(경로 존재를 노출하지
  않는다).
- 3.3절 권한 매트릭스: "신고 처리·계정 제재"는 `system_admin`만 `●`, 나머지 전 역할 `−`.
- 3.1절: `system_admin`은 **전역** 스코프 role("신고 처리·계정 제재 (보완)").
- SC-21: `/admin` 관리자 콘솔, 접근자 "관리자".

## 2. 새로 내린 결정 2건 — 요약(전문은 `docs/prioritization-and-risks.md` D-049·D-050)

이번 회차가 인계받은 "새로 결정해야 하는 것 2가지"를 그대로 이 두 결정으로 확정했다.

### D-049 · `system_admin` 식별

`profiles.is_system_admin boolean not null default false` 컬럼 + 자가 승격 차단 트리거
(`profiles_guard_self_status_transition` 확장 — `auth.uid() = old.id`이면서 이 컬럼이
바뀌면 예외). 셀프서비스 승격 경로를 의도적으로 두지 않았다 — 최초 지정(부트스트랩)은
마이그레이션의 직접 `UPDATE` 한 줄이다. 이 세션 사용자 본인 계정
(`0625chopin@gmail.com`, `profiles.id = fb70ff1c-3736-44ee-a4a3-96993a3c62ed`)을
관리자로 지정해 **실제 로그인으로 `/admin`을 검증할 수 있게 했다** — 다음 회차나 사용자가
직접 로그인해 확인할 수 있다.

### D-050 · 신고 처리 강제 경로 + 감사 로그 어휘 + 소프트삭제 연동

- **강제 경로**: 042A 인계 문서가 제안한 "service_role 경로"를 따르지 않고, `admin_resolve_
  report`/`admin_list_reports`(SECURITY DEFINER, 029B 2단 구조) 내부에서 `is_system_admin`을
  직접 확인하는 쪽을 택했다 — 팀장 지시("권한은 앱이 아니라 RLS/SECURITY DEFINER로
  강제하라, 042A의 FR-081 AC2 수준을 요구한다")를 따른 결과이자, 042A의 `private.is_blocked`
  패턴과의 일관성이다.
- **`audit_logs.action`**: `report.dismissed`·`report.post_removed`·`report.comment_
  removed`·`report.chat_message_removed`·`report.account_suspended` 5종. `recordAuditLog()`
  TS 헬퍼는 호출하지 않는다 — RPC가 `reports.status` 전이 + 소프트삭제/계정 제재 +
  `audit_logs` INSERT를 **단일 SQL 트랜잭션**으로 처리한다(I-054 회피 원칙의 연장).
- **소프트삭제 연동**: 새 컬럼·새 상태값을 만들지 않았다. `remove_content`는 기존
  `posts.deleted_at`/`comments.deleted_at`/`chat_messages.deleted_at`을 재사용(FR-032
  타인 게시글 삭제와 같은 계약)하고, `suspend_account`는 `profiles.status`를 이미 028부터
  있던 `'suspended'` 값으로 전이한다 — 스키마가 이미 이 결정을 기다리고 있었다.

## 3. 아키텍처 — 왜 서비스 롤이 아니라 RPC인가 (재확인)

`report-block-042a.md` §6은 "042B는 service-role 클라이언트로 status를 바꾸면 된다"고
적었다. 이번 회차는 그 제안 대신 클라이언트 호출 가능한 SECURITY DEFINER RPC를 택했다.
근거:

1. **팀장 지시**: "권한은 앱이 아니라 RLS/SECURITY DEFINER로 강제하라" — service_role
   경로는 강제가 **앱 코드(Server Action의 `if` 문)** 에 있고, 그 앱 코드가 실수로 빠지면
   막을 것이 없다. RPC 방식은 인가 검사가 SQL 함수 안에 있어 **클라이언트가 이 레이어를
   완전히 우회해 RPC를 직접 호출해도** 안전하다(§4 실측으로 확인).
2. **이 저장소의 기존 패턴과의 일관성**: `private.is_blocked`(042A)·`private.disband_crew`
   (040)가 이미 "RLS로 표현 못 하는 인가는 SECURITY DEFINER 헬퍼가 판정한다"는 표준을
   세웠다. service_role은 지금까지 **사용자 클릭이 트리거하는 일반 기능**이 아니라
   `audit-log.ts`·`lockout.ts`처럼 "읽는 화면이 없는 로그 전용 쓰기"에만 쓰였다.
3. **배선 비용**: service_role 경로는 `SUPABASE_SERVICE_ROLE_KEY`를 다루는 새
   `import "server-only"` 모듈이 하나 더 필요하다. RPC 방식은 이미 있는
   `createSupabaseServerClient()`(publishable key)로 끝난다.

**대가**: 이 설계는 042A 인계 문서의 전제와 실제로 충돌했다 — `reports_guard_self_update_
reason_only` 트리거가 "`auth.uid()`가 NULL이면(=service_role) 통과"로만 짜여 있어, 인증된
관리자 세션에서 실행되는 이 RPC의 UPDATE까지 막았다(§5 "발견하고 즉시 고친 것" 참고).
`docs/decisions/report-block-042a.md`는 옳았던 예측이 아니라 042B가 실제로 구현하며
갱신해야 했던 가정이었다 — 이 사실을 정직하게 남긴다.

## 4. 실 DB 실측 (전부 `begin`…`rollback`, 단일 호출)

기존 시드 데이터(post·chat_message·profile) + 트랜잭션 내 합성 comment 1건·report 6건으로
검증했다. 실측 후 `rollback`으로 전부 되돌렸다 — 원 데이터에 영향 없음.

| # | 시나리오 | 기대 | 실측 |
| --- | --- | --- | --- |
| 1 | 비관리자(seed_owner02)가 `admin_list_reports('pending')` 호출 | 빈 결과(0건) | ✅ **0** |
| 2 | 비관리자가 `admin_resolve_report(dismiss)` 호출 | `{ok:false, reason_code:forbidden}` | ✅ |
| 3 | 비관리자가 자기 `is_system_admin`을 직접 UPDATE(자가 승격 시도) | 트리거 예외(P0001) | ✅ |
| 4 | 비관리자가 **다른 사람**의 `is_system_admin`을 직접 UPDATE | RLS가 0행 처리(대상이 자기 행이 아니라 `profiles_update_self` 자체가 막음) | ✅ **0 rows affected**(최초 시도에서 "예외 없음"만 보고 "성공"으로 오판할 뻔했다 — 실제 행 값을 재조회해 `false`로 불변임을 확인, 방법론 교정) |
| 5 | `anon`이 `admin_resolve_report` 직접 호출 | `permission denied for function`(42501) | ✅ |
| 6 | `anon`이 `admin_list_reports` 직접 호출 | `permission denied for function`(42501) | ✅ |
| 7 | 관리자가 `admin_list_reports('pending')` | pending 4건 반환 | ✅ **4** |
| 8 | 관리자가 목록 상세 조회(post 대상) | reporter_handle·target_preview·target_author_handle 전부 정확 | ✅ |
| 9 | 관리자가 report1(post) `dismiss` | `{ok:true, status:dismissed}` | ✅ |
| 10 | 같은 report1을 다시 처리 시도 | `{ok:false, reason_code:already_handled, status:dismissed}` | ✅ |
| 11 | 관리자가 report2(comment) `remove_content` | `{ok:true, status:resolved}`, `comments.deleted_at` 기록 | ✅ |
| 12 | 관리자가 report3(chat_message) `remove_content` | `{ok:true, status:resolved}`, `chat_messages.deleted_at` 기록 | ✅ |
| 13 | 관리자가 report4(profile) `remove_content` | `{ok:false, reason_code:cannot_remove_profile_content}` | ✅ |
| 14 | 관리자가 report4(profile) `suspend_account` | `{ok:true, status:resolved}`, `profiles.status='suspended'` | ✅ |
| 15 | 관리자가 존재하지 않는 report id `dismiss` | `{ok:false, reason_code:not_found}` | ✅ |
| 16 | 관리자가 `p_action='delete_everything'`(잘못된 값) | `{ok:false, reason_code:invalid_action}` | ✅ |
| 17 | 관리자가 이미 삭제된 chat_message에 새 report로 `remove_content` | `{ok:false, reason_code:target_already_removed}` | ✅ |
| 18 | 관리자가 이미 제재된 profile에 새 report로 `suspend_account` | `{ok:false, reason_code:account_not_suspendable}` | ✅ |

**`audit_logs` 재조회 결과**(4건, 전부 `actor_id`=관리자, `crew_id=null`): `report.dismissed`
(target=report1 id)·`report.comment_removed`(target=comment id)·`report.chat_message_
removed`(target=chat_message id)·`report.account_suspended`(target=profile id) — 5종 중
`report.post_removed`는 이 실측 세트에 post 대상 `remove_content` 시나리오를 넣지 않아
미실측이다(코드 경로는 comment/chat_message와 완전히 대칭이라 구조적으로 동일하게 동작할
것으로 판단하지만, **정직하게 "미실측"으로 남긴다** — 다음 회차나 팀장 검증에서 확인 필요).

`get_advisors(security)` 최종: 신규 WARN 0건(기존 `auth_leaked_password_protection` 1건
불변, 무관). `information_schema.routine_privileges`로 `public.admin_list_reports`·
`public.admin_resolve_report`에 `anon` grant가 없음을 확인(042A의 "Supabase 기본 권한은
`public` 스키마 신규 함수에 자동으로 붙는다" 교훈을 이번엔 처음부터 명시적으로
`revoke ... from anon`까지 포함시켜 재발하지 않았다).

## 5. 실측 중 발견하고 즉시 고친 것 2건

1. **`reports_guard_self_update_reason_only` 트리거가 관리자 RPC까지 막음**(§3의 "대가"
   참고) — `admin_console_042b_reports_guard_admin_bypass` 마이그레이션으로 `is_system_
   admin` 세션을 이 트리거의 예외 대상에 추가해 해소.
2. **`private.admin_resolve_report`의 컬럼명 모호성** — `returns table(..., status text)`의
   `status`가 PL/pgSQL 함수 본문에서 암묵적 변수가 되어 `update profiles set status=...
   where ... and status='active'`의 WHERE절 `status`와 충돌(`42702`). `public.profiles.
   status`로 명시 한정해 해소(`admin_console_042b_fix_ambiguous_status_column`).

## 6. 앱 레이어 산출물

- **`lib/types`**: `profile.types.ts`(`Profile.isSystemAdmin`)·`moderation.types.ts`
  (`ReportResolutionAction`·`ReportResolutionReasonCode`·`AdminReportQueueItem`).
- **`lib/data/supabase/admin.ts`**(신규, mock 없음 — Task 032 이후 신설 도메인 전례):
  `listPendingReports`·`resolveReport`.
- **`lib/rules/report-resolution.ts`**(신규, NFR-036 순수 함수): `getAvailableResolutionActions`
  — `target_type==="profile"`이면 `remove_content`를 제공하지 않는다.
- **`lib/actions/resolve-report.ts`**(신규): `resolveReportAction` — `checkPermission`
  (`report:handle`, `system_admin`만 allow, Task 009B 매트릭스 그대로 재사용)로 앱 레이어
  1차 방어 + RPC `reason_code`를 도메인 오류로 변환(D-030 ③).
- **`components/admin/`**(신규 도메인 디렉터리): `AdminReportQueue`(표현, 카드 목록 +
  행별 확인 다이얼로그)·`AdminReportQueueSkeleton`·`AdminReportsContainer`(컨테이너,
  D-030 ①).
- **라우트**: `src/app/(app)/admin/layout.tsx`(AC2 게이트 — `session.isSystemAdmin`이
  아니면 `notFound()`)·`page.tsx`.
- **문자열**: `lib/strings/ko.ts`에 `admin.reports` 신규(제목·빈 상태·컬럼·액션 라벨·확인
  다이얼로그·오류 9종).
- **`/sample`**: `admin` 섹션 신규(`AdminReportQueue` 1항목, 기본·로딩·빈·오류 4상태). 오류
  패널은 실제 세션(비관리자/게스트)으로 제출하면 실제로 재현되는 `forbidden` 포함 4종을
  정적으로 보여준다 — `ReportDialog`·`BlockButton` 샘플과 같은 관례(실제 Server Action에
  연결).
- **부수 수정(타입 전파, 컴파일 필수)**: `lib/data/supabase/mappers.ts`(`toProfile`)·
  `lib/data/supabase/profile.ts`(`UNKNOWN_PROFILE_FIELDS`·`searchProfilesByHandle` —
  타인/검색 결과의 `isSystemAdmin`은 항상 `false` 고정, NFR-013 최소화와 같은 원칙)·
  `lib/data/mock/{fixtures.ts,profile.ts,seed/generate-profiles.ts}`(NFR-035, 대량 시드는
  관리자를 생성하지 않는다)·`components/shell/{auth-session.ts,get-auth-session.ts}`
  (`AuthSession.isSystemAdmin`)·`components/sample/sections/shell.tsx`(`/sample` 세션
  픽스처)·`lib/audit/audit-log.ts`(`AuditAction`에 `report.*` 5종, 문서적 동기화 —
  BOARD가 같은 회차에 `comment.force_deleted`·`meetup.cancelled`를 동시에 추가하고 있어
  병합 충돌을 직접 확인하며 작업했다)·`lib/data/supabase/database.types.ts`(재생성).

## 7. 확인하지 못한 것 (정직하게 남긴다)

- **브라우저 실클릭 검증을 하지 못했다** — `npm run dev`는 팀장 전용 운영 규칙이라 SQL
  레벨 실측(§4)과 정적 타입·린트 검증까지만 했다. `/admin` 접근 게이트(AC2 실제 404
  렌더)·`AdminReportQueue`의 다이얼로그·확인 흐름이 실제 브라우저에서 정확히 동작하는지는
  다음 회차나 팀장 검증이 필요하다.
- **`report.post_removed` 감사 로그는 실측하지 않았다**(§4 표 각주) — comment·chat_message
  경로와 완전히 대칭인 코드라 구조적으로 동일할 것으로 판단하지만 직접 실측하지 않았다.
- **관리자 지정/해제 UI가 없다** — D-049가 의도적으로 셀프서비스 경로를 막았으므로, 두 번째
  관리자가 필요해지면 SQL 직접 UPDATE가 유일한 방법이다. `docs/ISSUES.md`에 후속 이슈로
  남긴다.
- **콘텐츠 삭제 + 계정 제재 복합 처리가 안 된다** — 한 신고당 액션 하나만 가능하다(D-050
  "채택하지 않은 대안" 참고).
- **처리 이력 화면이 없다** — `admin_list_reports`가 `resolved`/`dismissed` 조회도 지원하지만
  (`p_status` 인자), 이번 회차 UI는 `pending` 큐만 만들었다. `listPendingReports()`의
  공개 시그니처도 `ReportStatus = "pending"` 기본값만 열어 뒀다(전 상태 조회가 필요해지면
  시그니처를 넓히고 호출부를 갱신한다).
- **`reports.target_id` 실존 검증 부재**(042A §7의 이월 한계) — 이번 회차는 완화만 했다.
  `admin_list_reports`의 `target_exists`/`target_removed`가 "대상이 이미 없거나 삭제됨"을
  관리자에게 보여주지만, 애초에 잘못된 `target_id`로 신고가 쌓이는 것 자체를 막지는 않는다.
- **BOARD의 Task 041(댓글·Meetup 취소) 관련 파일에서 `npx tsc --noEmit` 사전 실패 다수
  발견** — `MeetupLifecycleActions.tsx`·`CommentComposer.tsx`·`CommentItem.tsx`·
  `sample/sections/meetup.tsx` 등. 이 세션 도중 계속 변경되고 있던 다른 팀원의 진행 중
  파일이라(git status로 확인) 이번 회차 범위 밖으로 두고 손대지 않았다 — 팀장에게 별도
  보고한다.

## 8. `npx tsc --noEmit` / `npm run lint`

이 Task가 만들거나 고친 모든 파일 기준 clean(개별 파일 지정 실행으로 확인). 전체 저장소
기준 `npx tsc --noEmit`은 BOARD의 진행 중인 Task 041 파일들에서 사전 실패가 있다(§7
마지막 항목) — 이 Task의 파일은 그 목록에 없다.
