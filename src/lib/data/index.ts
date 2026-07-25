/**
 * `src/lib/data/` 의 유일한 외부 진입점(배럴).
 *
 * 소비자(서버 컴포넌트·Server Action·컨테이너 컴포넌트)는 항상 이 배럴을 통해서만
 * 데이터 접근 레이어를 쓴다 — `@/lib/data/mock/*`·`@/lib/data/supabase/*` 딥 임포트는
 * `eslint.config.mjs` zone 4·5·6이 막는다. 이 파일이 mock/supabase 구현을 조립
 * import하는 것은 zone 6 `ignores`가 `src/lib/data/**` 전체를 제외해 허용한다
 * (docs/CONVENTIONS.md "남은 리스크" 절 참고).
 *
 * **Task 032(18일차)부터 9개 도메인 전부 읽기+쓰기를 `./supabase/<domain>`이 담당한다.**
 * Task 031(17일차)이 읽기만 옮기며 도메인마다 "읽기는 supabase export *, 쓰기는 mock 이름
 * 나열" 두 줄 구조를 썼는데(`docs/decisions/read-path-realdata-031.md` §2), 이번 회차가 그
 * 표의 쓰기 칸을 전부 `./supabase/<domain>`으로 옮겨 각 도메인이 다시 한 줄(`export *`)이
 * 됐다. `./mock/*`는 더 이상 이 배럴에서 재노출되지 않는다.
 *
 * **정정(18일차, CORE 교차검증)** — 이전 판은 여기에 "`/sample`이 정적 데모 데이터로 mock
 * 픽스처를 직접 참조한다"고 적었으나 **사실이 아니었다.** 실제로는 `src/components/sample/**`
 * 가 `@/lib/data`를 배럴이든 `mock/*` 딥 임포트든 **한 번도 import하지 않는다** — 4상태
 * 데모는 전부 손으로 쓴 정적 리터럴이다. 이 배럴을 mock 전용으로 되돌리거나 확장해도
 * `/sample` 렌더에는 영향이 없다는 뜻이다.
 *
 * **crew 도메인에서 사라진 5개 함수** — `initiateCrewMembership`·
 * `acceptCrewInvitationMembership`·`declineCrewInvitationMembership`·
 * `approveCrewMembership`·`rejectCrewMembership`. Mock 시절에는 초대·가입신청 발급/응답/
 * 승인/반려 Server Action이 `crew_memberships` 동기화를 이 함수들로 직접 호출해야 했다.
 * 실 DB에는 그 동기화를 대신하는 트리거가 이미 있다(`trg_invitations_provision_membership`·
 * `trg_invitations_sync_membership_on_response`·`trg_join_requests_sync_membership_on_decision`,
 * `rls-policies-029a.md` §5) — 그래서 이 함수들을 호출하면 트리거가 이미 끝낸 전이를
 * 다시 시도하다 상태 불일치로 막힌다. Server Action(`invite-crew-member.ts`·
 * `request-join-crew.ts`·`respond-to-invitation.ts`·`decide-join-request.ts`)에서 이
 * 호출을 제거했고, 여기서 재노출하지 않는다(호출부가 없는 죽은 export를 남기지 않는다).
 * 상세 근거: `docs/decisions/write-path-realdata-032.md`.
 */
export * from "./supabase/board";
export * from "./supabase/chat";
export * from "./supabase/crew";
export * from "./supabase/invitation";
export * from "./supabase/join-request";
export * from "./supabase/meetup";
export * from "./supabase/notification";
export * from "./supabase/poll";
export * from "./supabase/profile";

export * from "./contracts";
