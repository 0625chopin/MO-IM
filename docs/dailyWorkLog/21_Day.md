# 21일차 작업 로그 (2026-07-25)

## 회차 요약

- 활성 팀원: **4명 전원**(CORE · DESIGN · CREW · BOARD).
- 이번 회차 배치 근거: 완료 집합 {Task 001~035 전량 · 038 · 039 · 040 · 042A} 기준으로 의존·선행 대기가 모두 풀린 미완료 로드맵 Task는 **036**(DESIGN) · **041**(BOARD) · **042B**(원 배정 DESIGN) 3건이었다. 1인 1건 폭 제한 아래 4명 전원을 가동하기 위해 **042B를 CREW로 재배정**했고(팀장 판정 — 근거는 아래), 잔여 Task 044가 Task 036 의존이라 미개시인 **CORE에는 20일차 워크로그가 "21일차 최우선 후보"로 남긴 I-073·I-074를 배정**했다.
- 결과: **완료 로드맵 Task 3건(036 · 041 · 042B)** + **이슈 처리 다수**. 마이그레이션 **15건** 적용. 신규 결정 **8건**(D-048~D-055). `docs/ISSUES.md` 신규 등재 **12건**(I-081~I-092), **그중 10건을 같은 회차에 닫았다.** 전체 테스트 3종 통과.
- **이번 회차의 성격**: 계획은 "통합 테스트 + 기능 확장"이었으나, 실제로는 **통합 테스트가 제 역할을 해서 심각한 권한 결함 5건(CRITICAL 1 · MAJOR 4)을 드러낸 회차**가 됐다. 더 중요한 것은 **그 결함들이 순차적으로 서로를 불러냈다**는 점이다 — 아래 "이번 회차가 드러낸 구조적 문제" 참고.

### 팀장 판정 — 042B 재배정(원 배정 DESIGN → CREW)

(a) CREW가 20일차에 042A(신고·차단)를 직접 구현했고, 042B가 소비할 `reports.status` 전이 계약을 `docs/decisions/report-block-042a.md` §6에 **본인이 정리해 인계**해 둔 상태였다. (b) DESIGN은 같은 회차에 크리티컬 패스 위의 Task 036에 전념해야 했다. `docs/ROADMAP/team/02.DESIGN.md`의 042B 항목에 "CREW로 재배정, 수행 기록의 SSOT는 03.CREW.md"를 명시했고, 원 배정 시점의 공수·기간 산정은 보존했다.

## 팀원별 완료 내역

### DESIGN (02.DESIGN.md)

- 완료 Task: **036 · v0.2 통합 테스트 (CRUD·인증·RLS·E2E)**
- 산출물:
  - 신규 문서 — `docs/decisions/integration-test-036.md`(검증 범위·매트릭스 결과표·여정 실측 로그·RLS 재현 절차·D-040 재판정·테스트 러너 판단·방법론 한계 §2.4)
  - 신규 결정 **D-052**(테스트 러너 이번 회차 미도입 — R-002가 "도입 여부를 D-\*로 결정한다"고 위임한 그 결정)
  - 등재 — I-081 · I-082 · I-083
  - 수정 — `src/components/sample/sections/ChatMessageListPreview.tsx`(빌드 차단 수정, 본인 소유 `/sample` 파일)
- 실측: 권한 매트릭스 34행 × 6역할을 **측정 22건(위반 0) + 정적 대조 8건 + 미구현 4건**으로 분해. **PRD §3 여정 B는 프로덕션 빌드 브라우저로 전 구간 완주**(개설 → 게시판/채팅 자동 생성 → 핸들 검색 초대 → 로그아웃/재로그인 → 수락 → 임원 임명). 여정 A는 로그인·크루 탐색·public/private 노출 확인(회원가입은 신규 계정 생성 금지 지침으로 미실행). 여정 C는 Meetup 상세·캘린더 로드만 브라우저 확인.
- 판정: **NFR-012 · FR-011 E1 · FR-012 AC4는 "승인된 편차"**(D-040 하위). 프로덕션 빌드에서 일반 크루원의 크루 설정 접근이 `POST .../settings => [200] OK`임을 네트워크 탭으로 실측 재확인했다. 문자 그대로의 403은 여전히 미충족이나, 매트릭스가 요구하는 **판정 결과**(누가 볼 수 있고 없는지)는 정확하다.
- 신규 결함 발견: **I-081**(FR-012 AC3 위반 — 비소속 방문자에게 크루 멤버 수가 항상 "0명").
- DB 잔존물: 테스트 크루 **`729ced18-2016-459a-94c3-e7959dfe808c`**(public, active). 오너 `chopin_0625` · 임원 `chopin0625`(여정 B로 임명). **archived 처리하지 않았다** — 20일차 교훈 반영. RLS 검증은 전부 `begin`…`rollback`.
- 비고: 이번 회차 **검증자 역할로도 가장 많이 기여했다** — CORE의 I-074 major 발견(프로브 A·B), 3차 보완 재검증(프로브 10종), I-081 브라우저 5항목, I-090 재검증에서 **진짜 동시 HTTP 요청으로 D-019 원자성 실증**.

### BOARD (04.BOARD.md)

- 완료 Task: **041 · 커뮤니티 확장 (FR-033 · FR-054 · FR-065)**
- 산출물:
  - 신규 — `src/lib/rules/{comment-depth,comment-content-validation}.ts` · `src/lib/data/{mock,supabase}/comment.ts` · `src/lib/actions/{create,update,delete}-comment.ts`·`delete-chat-message.ts`·`cancel-meetup.ts` · `src/components/board/{comment-view-models.ts,CommentForm,CommentComposer,CommentItem,CommentList,CommentListSkeleton,CommentListContainer}.tsx` · `src/components/meetup/MeetupLifecycleActions.tsx`
  - 마이그레이션 1건 — `chat_message_delete_broadcast_041`
  - 신규 문서 — `docs/decisions/community-expansion-041.md`
  - 수정 — `permission.{ts,types.ts}`(**34→37 액션**) · `block-content-visibility.ts` · `audit-log.ts` · `lib/data/index.ts` · mock/supabase의 `fixtures`·`meetup`·`chat`·`mappers` · `MessageBubble/List/ListContainer/RoomContainer.tsx` · `MeetupDetail(Container).tsx`·`meetup-view-models.ts` · `board-links.ts` · `board/[postId]/page.tsx` · `/sample`의 `board.tsx`·`meetup.tsx`·`chat.tsx`·`MessageBubblePreview.tsx` · `strings/ko.ts`
  - 신규 결정 **D-051**(FR-065 AC2 미충족 판정) · **D-053**(매트릭스 댓글 3행 보완 근거)
  - 등재 — I-079 · I-080
- 실측: FR-033 RLS 7시나리오 · FR-054 RLS 4시나리오 · FR-065 트리거 4시나리오 전부 기대 일치(anon/비소속/일반원/staff/owner 대조군).
- 자체 발견·수정: 초안의 `delete-chat-message`가 "삭제 후 사후 권한 확인" 순서라 Mock에서 권한 없는 삭제가 먼저 실행됐다 → `getMessageById` 신설로 "조회→판정→삭제"로 교정.
- **I-072 잔여분 해소**: 20일차 042A가 만든 `block-content-visibility.ts`·`BlockedContentNotice`를 댓글에 배선했다. I-072가 "댓글은 화면 자체가 없어 남은 범위"로 남겨 둔 항목이 이번에 화면이 생기며 닫혔다.
- 미확인(정직하게 남김): 채팅 삭제 브로드캐스트의 **실제 소켓 전달**(트리거 SQL과 구독 핸들러의 구조적 정합성만 코드로 확인).
- 비고: 이번 회차 **최대 발견자**다 — I-089(CRITICAL) · I-090을 재검증 도중 찾았고, 진짜 공통 패턴(I-091)을 정식화했다.

### CREW (03.CREW.md)

- 완료 Task: **042B · 신고·차단·관리자 콘솔 — 관리자 콘솔 (FR-082)** (팀장 재배정)
- 산출물:
  - 마이그레이션 5건 — `admin_console_042b_is_system_admin` · `..._report_resolution_rpcs` · `..._reports_guard_admin_bypass` · `..._fix_ambiguous_status_column` · `..._fix_decision_number_refs`(뒤 3건은 **실측 중 자기 결함을 스스로 발견해 고친 것**)
  - 신규 — `lib/data/supabase/admin.ts` · `lib/rules/report-resolution.ts` · `lib/actions/resolve-report.ts` · `components/admin/{AdminReportQueue,AdminReportQueueSkeleton,AdminReportsContainer}.tsx` · `app/(app)/admin/{layout,page}.tsx` · `components/sample/sections/admin.tsx`
  - 수정 — `lib/types/{profile,moderation}.types.ts` · `lib/data/supabase/{mappers,profile,database.types}.ts` · `lib/data/mock/{fixtures,profile,seed/generate-profiles}.ts` · `components/shell/{auth-session,get-auth-session}.ts` · `lib/audit/audit-log.ts`(report.\* 5종) · `lib/strings/ko.ts` · `lib/data/index.ts` · `components/sample/{registry.ts,sections/shell.tsx}`
  - 신규 문서 — `docs/decisions/admin-console-042b.md`
  - 신규 결정 **D-049**(`system_admin` 식별 = `profiles.is_system_admin` + 자가승격 차단 트리거) · **D-050**(신고 처리를 service_role이 아니라 SECURITY DEFINER RPC로 강제, `audit_logs.action`에 `report.*` 5종 추가, 소프트삭제는 기존 `deleted_at`/`profiles.status='suspended'` 재사용 — 새 스키마 불필요)
  - 등재 — I-075 ~ I-078
- 실측: FR-082 AC1 **18개 시나리오 전부 PASS**(기각·콘텐츠 삭제·계정 제재·이미 처리됨·존재하지 않음·이미 삭제됨·이미 제재됨·잘못된 action 등). AC2는 `(app)/admin/layout.tsx`의 `notFound()` + RPC 레벨 이중 방어. anon 직접 RPC 호출 거부(42501) 확인.
- **029A §7.5 · 029B §8이 "새 결정 필요"로 이월한 `system_admin` 식별을 이번에 확정했다.**
- 미확인: 브라우저 실클릭(`npm run dev`가 팀장 전용 운영 규칙).
- 비고: **I-085·I-086·I-084를 수정**했고, 이번 회차 **최대 정정자**이기도 하다 — CORE·DESIGN이 세운 "조건부 셀" 패턴이 불완전함을 반례로 밝혔고(아래 5번), 그 정정이 I-089·I-090 발견으로 이어졌다. 마지막으로 **I-092**를 찾았다.
- **사용자에게 알림**: D-049 구현 시 최초 관리자가 필요해 **이 세션 사용자 본인 계정(`0625chopin@gmail.com`)을 시스템 관리자로 지정**했다(마이그레이션 직접 UPDATE). 셀프서비스 승격 경로가 의도적으로 없어 해제하려면 SQL 직접 UPDATE가 필요하다(해제 UI 없음 — I-075).

### CORE (01.CORE.md)

- 완료 Task: **없음**(잔여 044가 Task 036 의존이라 미개시). 대신 이슈 다수를 처리했다.
- 산출물:
  - **I-073** — 마이그레이션 `meetup_directory_summary_i073`(신규 RPC, `id`·`crew_id` 두 컬럼만 반환, `anon` EXECUTE 없음) · `src/lib/data/supabase/meetup.ts`(`getMeetupById` 0행→RPC 폴백) · `database.types.ts` · `MeetupDetailContainer.tsx`(docstring) · `/sample`의 `meetup.tsx` · 신규 결정 **D-048**
  - **I-074** — `eslint.config.mjs`(zone 6→6/6b 분리, zone 3에 `noProfileHandleOracleRelative`) · `src/lib/data/supabase/profile-handle-oracle.ts`(신규, `getProfileByHandle` 격리) · `src/lib/data/index.ts`
  - **I-081** — `src/lib/data/supabase/crew.ts`(`getPublicCrewMemberCount` 신설) · `src/components/crews/CrewHomeContainer.tsx` · `src/components/crews/fetch-crew-cards.ts`
  - **I-090** — 마이그레이션 3건(`major_fix_i090_meetup_attendances_capacity_bypass` · `..._move_respond_meetup_attendance_to_private_wrapper` · `i090_revoke_meetup_attendances_delete_grant`)
  - 등재 — I-088(CONVENTIONS.md zone 표 누락, 다음 회차 후보)
- 실측: I-073 5시나리오(비소속·강퇴 대조군·활성 크루원·없는 id·anon). I-081 대조군 4종(anon 3 · 비소속 인증 3 · 활성 오너 3 · ground truth 3, 전부 일치). I-090 회귀 8종. `get_advisors(security)` 신규 WARN 0건.
- **이번 회차 최대 기여는 Task 036 교차검증이다** — DESIGN이 "코드 정적 대조"로 넘긴 8행 중 4행을 실제 SQL로 재현해 **2건이 실제로 뚫려 있음**을 밝혔다(I-085 · I-086). 이 발견이 없었으면 I-089·I-090·I-092도 나오지 않았다.
- 비고: **마이그레이션 파일 누락 사고**를 냈다(아래 6번). 복구 후 "적용 즉시 로컬 저장"으로 습관을 바꿨고 이후 사고는 없었다.

## 교차검증 결과

- **CORE → DESIGN**(036): **MAJOR 2건**(I-085 · I-086) + minor 2(집계 오류 27→22, D-052 근거② 약함). "매트릭스 위반 0건"이 과신이었음을 실증으로 밝혔다.
- **DESIGN → CORE**(I-073 · I-074): I-073 **이슈 없음**(RPC 정의 원문·GRANT 독립 재현, 036 브라우저 실측과 SQL 원인 일치 확인). I-074 **MAJOR 1건** — zone 3 내부 상대경로 우회가 안 잡힘을 프로브로 실증. 부수로 **마이그레이션 로컬 파일 누락** 발견.
- **BOARD → CREW**(042B): **7항목 전부 PASS**, major 0 · minor 1(I-084). 20+ 시나리오 독립 재현. CREW가 미확인으로 남긴 **I-076(`report.post_removed` 감사 로그)을 실측으로 채워 PASS**시켰다.
- **CREW → BOARD**(041): major 0 · minor 1(D-053으로 해소). **D-051 "재해석 타당" 판정**(UNIQUE 제약 2개를 근거로 제시 — 이것이 팀장 반론의 근거가 됐다). I-080을 raw INSERT로 독립 재현해 BOARD 판정이 정확함을 확인. BOARD 미확인분 1건을 실측 보완.
- **DESIGN → CORE 재검증 ①**(I-074 2차): 프로브 5종 중 4 PASS. **프로브 D(배럴 경유)가 여전히 잡힘** — 파일 이동으로 1차 방어가 무효화되지 않았음 확인. **프로브 F(확장자 `.ts`) FAIL** — minor로 평가(전례 0건).
- **DESIGN → CORE 재검증 ②**(I-074 3차, 최종): **프로브 10종 전부 잡힘.** `npm run lint` 전체 에러가 정확히 프로브 10개뿐(무관 파일 0건). `../../` 2단계 경로가 와일드카드 stem으로 커버됨을 처음 실증.
- **DESIGN → CORE 재검증 ③**(I-081 브라우저): **5항목 전부 PASS.** 게스트 `/crews` 9개 카드 전부 정확, 출사모임 크루 홈 "크루원 3명"(전에는 "0명"), 소속 크루원 회귀 없음, private 4곳 섞인 13개 카드에 이상값 0건.
- **BOARD → CREW 재검증**(I-085 · I-086): 체크리스트 6항목 전부 PASS + **신규 CRITICAL/MAJOR 2건 발견**(I-089 · I-090). 조건부 셀 카운트가 CREW의 "6개"가 아니라 **9셀/7액션**임을 정정.
- **CREW → BOARD 재검증 ①**(I-089): 핵심 방어 PASS(위조 → `closed_invalid` 정정, Meetup 0건, cron 정상, 동수→`rejected`). **★ 두 판정 확정** — `auth.uid() IS NULL` 전제는 안전하고(정책 3개 전부 `TO authenticated`, anon 실측 0행), "덮어쓰기" 트레이드오프도 타당하다(TS·SQL 공식 줄 단위 대조 100% 일치 + RETURNING 의미론). **신규 MAJOR 1건 발견**(I-092).
- **DESIGN → CORE 재검증 ④**(I-090): **7항목 전부 PASS.** ★참석 기능 생존을 HTTP로 실증, **★D-019 원자성을 진짜 동시 HTTP 요청으로 실증**(CORE가 도구 제약으로 못 한 자리). DELETE 권한 잔존물 발견.
- **CREW → BOARD 재검증 ②**(I-092, 최종): **전부 PASS.** ★`pg_trigger_depth() > 1` 판정이 충분함을 전수 조사로 확정(`poll_votes`에 UPDATE하는 트리거는 강퇴 트리거 하나뿐, 사람은 depth>1을 만들 수 없음). DEFINER 전환의 차단 범위가 넓어지지 않았음도 확인.

## 발견·해결한 이슈

1. **[CORE] MAJOR · I-085 — 가입 신청자가 자기 신청을 스스로 승인할 수 있다** (CORE가 036 교차검증에서 발견) → 신청자 본인이 자기 pending 신청을 `status='approved'`로 직접 UPDATE하면 성공하고 멤버십이 즉시 `active`로 동기화됐다. **FR-023을 REST 직접 호출로 완전 우회.** 막고 있던 건 앱 레이어 `checkPermission`뿐이었다. → CREW가 `join_requests_update_requester_or_staff`의 `WITH CHECK`를 좁혀 self-service 분기가 `status='withdrawn'`(FR-022 E4 자진 철회)일 때만 통과하게 수정 (재검증 BOARD PASS)
2. **[CORE] MAJOR · I-086 — 오너가 승계자·해산 없이 크루를 떠날 수 있다** (CORE 발견) → `crew_memberships_guard_self_transition`의 self-service 분기가 role 변경만 막고 "오너인 채로 나가기"는 안 막아, `owner_id`는 남고 활성 오너 멤버십이 없는 **고아 크루**가 됐다. **결정적 대조**: 같은 조건(`hasOwnerSuccessorOrDisband`)을 공유하는 `profile:withdraw`는 `owns_active_crew`로 DB에서 정확히 차단하고 있었다 — **같은 규칙을 공유하는 두 액션 중 하나만 강제되고 있었다.** → CREW가 `private.owns_active_crew(p_crew_id default null)` 단일 헬퍼로 승격해 두 자리를 통일(인자 생략 시 전역, 지정 시 크루 하나 — "다른 크루 Y의 오너인데 이 크루 X에서는 일반 멤버"인 사람이 잘못 차단되는 false positive를 피하기 위한 매개변수화, 대조군으로 실증) (재검증 BOARD PASS)
3. **[BOARD] CRITICAL · I-089 — 크루원이 투표 결과를 혼자 위조해 가짜 Meetup을 만들 수 있다** (BOARD가 I-085/086 재검증 중 발견) → `polls_update_proposal_author_or_staff`의 `WITH CHECK`가 컬럼값을 전혀 제한하지 않고 `polls`에 BEFORE UPDATE 가드가 **아예 없어서**, 일반 크루원이 **실제 투표 0표인 상태에서** `status='closed_passed', result='passed'`를 직접 써넣으면 `trg_polls_finalize_closed_poll`이 발동해 **진짜 `meetups` 행이 생겼다.** 정족수·찬반 계산 전면 우회 — D-003·FR-040~045가 REST 직접 호출 앞에서 무의미해진다. → BOARD가 판정 계산을 `private.compute_poll_decision()`으로 추출(**세 번째 사본을 만들지 않았다** — I-071이 인정한 TS 1벌+SQL 1벌 이상으로 이중화를 늘리지 않음)하고, `polls_guard_decision_integrity` BEFORE 트리거를 신설해 **거부가 아니라 재계산 덮어쓰기**로 처리했다(**D-054**). 부수로 신규 트리거 함수의 `anon` RPC 노출을 자가 발견해 revoke (재검증 CREW PASS)
4. **[BOARD] MAJOR · I-090 — 정원 마감을 직접 INSERT로 우회할 수 있다** (BOARD 발견) → `meetup_attendances`에 트리거가 0건이라 꽉 찬 Meetup에 RPC를 거치지 않고 직접 INSERT하면 성공했다. 18일차 D-019가 "RPC로 정원 원자성을 보장했다"고 한 주장에 흠이 생긴다. → CORE가 **전면 금지** 채택(BEFORE 트리거는 기각 — 카운터 동기화 문제가 별도로 남아 문제가 두 배가 된다는 근거). `respond_meetup_attendance`를 먼저 SECURITY DEFINER로 전환한 뒤 INSERT/UPDATE 권한 회수, 1차 시도의 advisor WARN을 자가 발견해 "private 실구현 + public 얇은 래퍼" 2단 구조로 재정정 (재검증 DESIGN PASS)
5. **[CREW] MAJOR · I-092 — `poll_votes.invalidated`가 self-service로 무제한 변경된다** (CREW가 I-089 재검증 중 발견) → `poll_votes_guard_immutability`가 `choice`/`voted_at`만 보고 `invalidated`를 안 봐서, **staff가 강퇴 없이 남의 표를 무효화**하고 **강퇴자가 자기 표를 재유효화**할 수 있었다. **D-003의 "강퇴자 표 무효화"가 강퇴 시점 1회성 이벤트일 뿐 불변식이 아니었다는 뜻.** I-089의 방어가 정확히 이 데이터 위에 서 있어, "0표로 가결" 같은 노골적 위조 대신 **표 몇 개를 무효화해 정족수를 떨어뜨리는 은밀한 경로**가 남아 있었다. → BOARD가 `pg_trigger_depth() > 1`(029A가 이미 쓰던 패턴 재사용, 새 메커니즘 안 만듦)로 강퇴 트리거 경유만 허용하고, 트리거를 INVOKER→DEFINER로 전환해 **우연한 방어를 의도된 방어로** 교체했다(**D-055**) (재검증 CREW PASS)
6. **[CORE] MAJOR · I-074 재발 — ESLint 규칙에 제3의 진입문이 열려 있었다** (DESIGN 발견) → 1차 구현이 배럴(`@/lib/data`) 경유만 막아, `src/lib/data/supabase/` **안에서 `./profile` 상대경로**로 가져오면 안 잡혔다. I-074의 취지가 정확히 "세 번째 진입문이 또 생겨도 lint가 통과한다"를 막는 것이었는데, CORE의 실증이 배럴 경로 하나만 테스트해 **"해결됨" 판정이 과대평가**됐다. → CORE가 ⓑ(별도 모듈 `profile-handle-oracle.ts` 분리) 채택 — 상대경로 `paths` 나열은 "파일 위치에 묶인 규칙"이라는 같은 실패 모드를 반복한다는 근거. **3차로 확장자 표기 gap까지 보완**(DESIGN 재검증이 발견, 전례 0건이라 minor) (재검증 DESIGN 프로브 10/10 PASS)
7. **[CORE] MAJOR·기록 · 마이그레이션 파일이 로컬에 없었다** (DESIGN 발견) → `20260725141946_meetup_directory_summary_i073`이 **DB에는 적용됐는데 `supabase/migrations/`에 `.sql`이 없었다.** 이대로 커밋하면 저장소가 원격 DB보다 하나 부족한 채 남고 새 환경의 `supabase db reset`에서 빠진다. **19일차가 정확히 "원격 DB와 저장소가 어긋난다"를 드러낸 회차였으므로 재발이다.** → CORE가 `schema_migrations.statements`에서 **기억이 아니라 적용된 SQL 원문**을 꺼내 저장, DB↔로컬 전체 diff로 다른 누락이 없음을 확인
8. **[DESIGN] MAJOR·판정 · "매트릭스 위반 0건"이 과신이었다** (CORE 발견) → 집계도 부정확했다(§2.1의 "15+12=27"이 실제 표를 세면 **22+8+4=34**, 검증 강도가 실제보다 세 보이는 방향의 오류). → 결론을 "측정 22건 위반 0 · 정적 대조 8건 중 2건이 사후 재현에서 MAJOR"로 정정하고 §2.4에 방법론 한계를 신설
9. **[CREW] MAJOR·판정 · "조건부 셀" 패턴이 불완전했다** (CREW가 반례 제시) → CORE·DESIGN이 세운 "정적 대조는 조건부 셀에서 실패한다"는 두 결함 중 하나만 설명한다. **`crew:approve_join_request`(I-085)는 조건부 셀이 아니라 순수 `allow`/`deny`**이고, 진짜 원인은 "self-service RLS 분기가 어떤 상태값까지 허용하는지 제한하지 않은 것"이었다. → BOARD가 self-service RLS 전수 조사로 **진짜 범주를 정식화**(I-091, 테이블 14행 표) — **이 정정 덕분에 넓힌 범주를 훑다가 I-089·I-090이 나왔다**
10. **[BOARD] 판정 뒤집힘 · D-051의 근거가 틀렸다** (팀장 반론, BOARD 수용) → BOARD는 "FR-065 AC2와 D-003이 정면 충돌하므로 뒤에 나온 확정이 이긴다"고 프레임했으나, 원문 대조 결과 **AC2는 결과를, D-003은 승인 경로를 규정**해 합성 가능하다("재투표 승인 → 기존 Meetup UPDATE + 이력"). D-003이 배제하는 건 "재투표 **없는** 직접 UPDATE"뿐인데 BOARD가 그 중간 선택지를 대안 목록에 넣지 않았다. → 구현은 유지하되 근거를 **"AC2를 만족하는 설계가 존재하나 스키마(`polls_post_id_key`·`meetups_poll_id_key` UNIQUE)가 재투표를 기존 Meetup에 바인딩할 수단을 주지 않아 예산 초과로 미구현, 현재 경로는 AC2 미충족 임시 조치"** 로 다시 썼다. 대안 ④를 "기각이 아니라 이월"로 추가, I-079도 "DB 연결 부재"에서 "**AC2 미충족 자체**"로 재정의
11. **[CREW] minor · I-084 — `getProfileByHandle`이 타인의 실제 `isSystemAdmin`을 반환한다** (BOARD 발견) → 같은 파일의 형제 함수 둘은 `false`로 고정하는데 이 함수만 방어가 없었다. 오늘 시점 악용 불가(호출부가 그 필드를 안 읽음)지만 **이 저장소에서 우회가 두 번 실제로 발생한 그 함수**이고, `isSystemAdmin` 필드를 이번 회차에 CREW가 도입하며 형제 둘에만 고정을 넣은 누락이었다. → 고정 + docstring에 역할 분담 명시("누가 부르는가"는 I-074 ESLint가, "불렀을 때 무엇이 새는가"는 이 고정값이 막는다)
12. **[CORE] minor · I-081 — 비소속 방문자에게 크루 멤버 수가 항상 "0명"** (DESIGN이 036에서 발견) → `CrewHomeContainer`가 anon에 안 열리는 `listCrewMembers`를 쓰는 게 원인. **FR-012 AC3 위반.** CORE 조사로 `/crews` 목록(`fetch-crew-cards.ts`)도 같은 패턴임이 확인됐다. → `getPublicCrewMemberCount` 신설 + 컨테이너 2곳 배선. `fetch-crew-cards.ts`는 소속/비소속이 한 루프에 섞여 있어 **분기를 새로 만들었다**(private 크루의 RPC `member_count`가 항상 `null`이라 소속 크루에 잘못 쓰면 안 된다는 확인 포함) (재검증 DESIGN 브라우저 5항목 PASS)
13. **[BOARD] minor · `.next/dev/types` 타입 에러의 성격** (CORE 지적) → BOARD가 자기 증상을 DESIGN의 I-083과 같은 원인으로 뭉뚱그렸으나, CORE가 "런타임 모듈 그래프 vs 빌드 타임 타입 캐시로 **메커니즘이 다르다**"고 지적. → BOARD가 **"재시작으로 해소됐다고 확인한 적이 없다"고 스스로 정정**하고 별도 이슈 **I-087**로 등재, I-083에 상호 참조 추가. 확실한 것(코드 수정 불필요)과 미확인(무엇이 desync를 없앴는지)을 갈랐다
14. **[CORE] minor · DELETE 권한 잔존물** (DESIGN이 I-090 재검증에서 발견) → `meetup_attendances`의 `anon`·`authenticated` DELETE 권한이 회수 안 됐다. 지금은 DELETE 정책이 없어 RLS 기본 거부로 막히지만, **나중에 누군가 DELETE 정책을 추가하는 순간 이 잔존 GRANT가 조용히 문을 연다.** → CORE가 회수, 방어선이 1→2로 강화됨을 실측 확인
15. **[CREW] minor · 조건부 셀 카운트 오류** (BOARD 발견) → CREW의 "정확히 6개"가 실제로는 **9셀 / 7액션**이었다(`profile:withdraw`가 3역할 전부 conditional이라 혼자 3셀인데 1개로 묶어 셈). 실질 문제는 없었고(빠진 처리 없음) 결론도 유효하다. → CREW가 `integration-test-036.md` §2.4를 정정

**미해결로 남긴 것**: I-082(로그인 직후 알림 Realtime 1회 인가 실패, 경미·자연 회복) · I-088(CONVENTIONS.md zone 1~8 표 누락, 기존 관행) · I-091(전수 조사 지침, 등재 자체가 산출물) · I-079(FR-065 AC2 미충족) · I-080(댓글 depth-1 앱 레이어 전용) · I-075~078(042B 후속).

## 이번 회차가 드러낸 구조적 문제

**결함이 순차적으로 서로를 불러냈다.** 036 통합 테스트 → CORE 교차검증이 I-085·I-086 발견 → 그 수정을 검증하던 BOARD가 "진짜 패턴이 뭔가"를 정식화하려 self-service RLS를 훑다가 **I-089(CRITICAL)·I-090 발견** → I-089 수정을 검증하던 CREW가 **그 방어가 딛고 선 데이터에서 I-092 발견**. 다섯 결함이 하나의 사슬이고, **어느 한 단계라도 "보고를 믿고 넘어갔으면" 나머지가 안 나왔다.** 이 회차의 교차검증은 형식이 아니라 실제로 결함을 생산했다.

**"앱 레이어만 막고 DB가 독립 강제하지 않는다"가 이 저장소의 지배적 결함 형태다.** I-085·I-086·I-089·I-090이 전부 같은 형태였다. 20일차 교훈("방어를 걸었는데 그게 유일한 진입문이 아니었다")의 확장판이며, 이번엔 **진입문이 앱 바깥(REST 직접 호출)에 있었다**는 점이 다르다. NFR-011/012가 "RLS가 최종 방어선"이라고 세워 뒀는데, 실제로는 여러 자리에서 앱이 유일한 방어선이었다.

**패턴 서술의 범위가 다음 회차의 탐색 범위를 결정한다.** CORE·DESIGN이 세운 "조건부 셀" 패턴은 그럴듯했지만 CREW의 반례로 불완전함이 드러났고, BOARD가 범주를 "self-service를 허용하는 모든 RLS write 정책 + 그 위에 얹힌 트리거 유무"로 넓히자 **그 넓힌 범주 안에서 CRITICAL이 나왔다.** 좁은 패턴을 그대로 뒀으면 I-089를 못 찾았다. 심각도 기준("이 경로가 다운스트림 트리거를 발동시키는가")도 `polls`가 `meetup_attendances`보다 위험한 이유를 정확히 설명한다.

**매트릭스 전수 검증이 닿지 못하는 영역이 있다.** `meetup_attendances`는 권한 매트릭스에 대응 액션이 거의 없어, 34행을 아무리 전수 검증해도 I-090은 안 나온다. 036 문서가 "매트릭스 34행 × 6역할"을 검증 범위로 선언했으므로 이 한계를 §2.4에 명시했다 — 없으면 다음 회차가 "매트릭스 다 봤으니 됐다"고 넘어간다.

**"실증했다"가 "충분히 실증했다"는 아니다.** I-074는 CORE가 프로브로 실증하고도 커버리지가 좁아 두 번(상대경로·확장자) 뚫렸다. 두 번 다 DESIGN이 잡았다. 20일차 교훈("검증 방법이 검증 결과를 바꾼다")이 실증의 **범위**에도 적용된다.

## 팀장 전체 테스트 (항상 실행)

잔여 `next-server` 프로세스 6개(최고 3.3시간 경과)를 종료하고 `.next`를 삭제한 뒤 깨끗한 상태에서 실행했다 — 이 프로세스들이 I-083·I-087의 원인이었다.

- `npm run lint`: **통과**(0 errors / 0 warnings)
- `npx tsc --noEmit`: **통과**(exit 0)
- `npm run build`: **통과** — Compiled 10.1s / TypeScript 11.2s / 정적 페이지 21개 생성, **26개 라우트** 전부 `ƒ` 동적 서버 렌더링(20일차 25개 → `/admin` 신설로 +1)

## 문서 갱신

- `docs/ROADMAP/team/*.md` 상태 마커: **02.DESIGN.md Task 036**(완료, 21일차) · **02.DESIGN.md Task 042B**(CREW로 재배정 — SSOT는 03.CREW.md라고 명시) · **03.CREW.md Task 042B**(완료, 21일차 + 재배정 사유) · **04.BOARD.md Task 041**(완료, 21일차 + FR-065 AC2 미충족 명시).
- `docs/team/*.md`: **변경 없음**(팀원 상태 변화 없음).
- `docs/prioritization-and-risks.md`: **D-048 ~ D-055 신규 8건**. D-040·D-052는 회차 중 근거 정정.
- `docs/ISSUES.md`: **I-081 ~ I-092 신규 12건**, 그중 10건 같은 회차에 닫음. I-065·I-072·I-073·I-074·I-076·I-083도 갱신.
- 신규 결정 문서 4건: `integration-test-036.md` · `community-expansion-041.md` · `admin-console-042b.md` · (I-091은 ISSUES.md 내 항목).
- 마이그레이션 **15건** 적용, DB ↔ 로컬 `supabase/migrations/` 전건 일치 확인.

## 다음 회차에 열리는 Task

완료 집합이 {001~036 전량 · 038 · 039 · 040 · 041 · 042A · 042B}가 되어 다음이 열린다:

- **044 · 잔여 C등급 기능** (CORE, 의존 036 ✓) — 9.5인일 L. **036 완료로 새로 열렸다.**
- **045 · 관측과 브라우저 지원** (DESIGN, 의존 036 ✓) — **036 완료로 새로 열렸다.**
- **037 · 동시성·부하 검증과 Realtime 팬아웃 실측** (BOARD, 의존 033 ✓ · 036 ✓) — 3.5인일 M. **036 완료로 새로 열렸다.**
- CREW는 잔여 로드맵 Task가 없다.

**036 완료로 예고대로 세 Task가 한꺼번에 열렸다.** 1인 1건 폭 제한을 적용하면 CORE 044 · DESIGN 045 · BOARD 037이고 CREW는 이슈 배정이 필요하다 — 22일차 산정 시 재계산한다.

**22일차 착수 전에 확인할 것**:

1. **`invitations`가 최우선 후보다** — I-091의 전수 표에서 **유일하게 "강제 전무 + 미수정 + 미실측"으로 남은 칸**이다. BOARD가 코드 리뷰만 하고 실제 익스플로잇 재현은 시간 제약으로 못 했다고 정직하게 표시했다. `sync_membership_on_response` AFTER 트리거 캐스케이드가 있어 **I-089와 같은 "다운스트림 트리거 발동" 위험군**이다 — 이번 회차에 그 기준으로 CRITICAL이 하나 나왔다는 점을 기억할 것.
2. **I-091을 조사 지침으로 쓸 것** — "self-service RLS write 정책 + 그 위의 트리거 유무" 전수 표가 SSOT다. BOARD의 후속 제안 2건(Task 036류 표준 체크리스트에 추가 / 신규 self-service 정책 리뷰 체크리스트에 캐스케이드 항목 추가)도 판단이 필요하다.
3. **037이 동시성·부하 Task라 이번 회차 실측 자산을 이어받을 수 있다** — DESIGN이 I-090 재검증에서 **실계정 JWT 발급 + 병렬 curl로 진짜 동시 요청을 쏘는 절차**를 확립했다. 037이 정확히 그 수단을 필요로 한다.
4. **테스트 러너는 여전히 없다(D-052)** — 이번 회차에 미도입으로 확정했으나, 근거②가 약하다는 지적을 받아 정정됐고 "이 사실이 오히려 도입을 앞당길 근거"임이 D-052에 명시돼 있다. I-071(TS·SQL 판정 공식 이중화)은 **정적 검사로 막을 수 없다**는 것이 CORE 판단으로 확정됐다 — 실행·비교가 필요한 의미 문제다. 037·044·045 중 어디서 도입할지 판단할 시점이다.
5. **DB 잔존물 2건 추가**: DESIGN의 Task 036 테스트 크루 `729ced18-2016-459a-94c3-e7959dfe808c`(active, archived 아님) — 20일차의 `c4283f8a-...`(archived, 되돌릴 수 없음)와 함께 총 2건이다. **여전히 시드 크루를 archived로 만들지 말 것.**
6. **사용자 계정이 시스템 관리자다** — D-049 검증을 위해 `0625chopin@gmail.com`이 `is_system_admin=true`로 지정됐다. 해제 UI가 없어(I-075) SQL 직접 UPDATE가 필요하다.
7. **NFR-012·FR-011 E1·FR-012 AC4는 "승인된 편차"로 확정됐다**(036 판정, D-040 하위). FR-064 AC2도 같은 지위다(D-048) — I-073 수정으로 404에서 "200 + forbidden"으로 옮겨갔을 뿐 문자 그대로의 403은 아니다. **다음에 이 지점을 다시 열려면 `forbidden()`/`unauthorized()`의 stable 승격 여부부터 확인할 것.**
8. **미확인으로 남은 실측**: 채팅 삭제 브로드캐스트의 실제 소켓 전달(BOARD·CREW 둘 다 못 함) · 042B 관리자 콘솔 브라우저 E2E · 회원가입 실측(신규 계정 생성 금지) · 캘린더 상호작용 UI · I-057(비밀번호 재설정 메일, 수신함 접근 수단 없음, 20일차부터 진전 없음).

## git

- 브랜치: `day-21`
- 커밋: 아래 커밋 절 참고
- 푸시: 사용자 확인 후 결정
