/**
 * `src/lib/data/` 의 유일한 외부 진입점(배럴).
 *
 * 소비자(서버 컴포넌트·Server Action·컨테이너 컴포넌트)는 항상 이 배럴을 통해서만
 * 데이터 접근 레이어를 쓴다 — `@/lib/data/mock/*`·`@/lib/data/supabase/*` 딥 임포트는
 * `eslint.config.mjs` zone 4·5·6이 막는다. 이 파일이 mock/supabase 구현을 조립
 * import하는 것은 zone 6 `ignores`가 `src/lib/data/**` 전체를 제외해 허용한다
 * (docs/CONVENTIONS.md "남은 리스크" 절 참고 — 1일차 교차검증에서 이 배럴 자체가
 * 막혀 있던 문제를 프로브로 확인·수정했다).
 *
 * **Task 031(17일차)부터 읽기/쓰기가 도메인 모듈 단위로 갈라진다.** 9개 모듈 전부
 * 한 파일 안에 읽기·쓰기 함수가 섞여 있었으므로(Task 007), `export *`를 그대로 두면
 * `./supabase/<domain>`의 읽기 함수와 `./mock/<domain>`의 같은 이름 읽기 함수가
 * 충돌한다(중복 export). 그래서 아래는 **읽기는 `./supabase/<domain>`에서 `export *`,
 * 쓰기는 `./mock/<domain>`에서 이름을 나열해 재노출**하는 형태로 도메인마다 한 쌍씩
 * 둔다 — 쓰기 함수 목록은 Task 032(다음 회차)가 각 모듈을 `./supabase/<domain>`으로
 * 옮기면서 지운다. 어느 이름이 읽기/쓰기인지, 왜 이렇게 나눴는지는
 * `docs/decisions/read-path-realdata-031.md` §2 참고. 이 배럴 밖(소비자 쪽) 코드는
 * 어떤 줄도 바뀌지 않는다 — D-030 "조회부만 교체" 원칙이 실제로 성립함을 이번 회차가
 * 검증했다.
 *
 * **⚠️ `npm run build`가 client bundle에서 `next/headers`를 문다 — 원인은 하나(경계 위반),
 * 관측 지점이 둘이다(17일차, 팀장이 두 차례 재실측해 확정).**
 *
 * **원인**: `"use client"` import 그래프(`MessageRoomContainer.tsx` → `message-view-models.ts`
 * → `src/components/chat/resolve-post-link-card.ts`)가 서버 전용 배럴(이 파일)을 import한다.
 * **이 배럴이 서버 전용 API(`createSupabaseServerClient` → `next/headers`)를 무는 것 자체는
 * 원인이 아니다** — 9개 도메인 읽기가 실데이터로 바뀐 정상적·의도된 결과이며 되돌릴 대상이
 * 아니다. 같은 위반이 서로 다른 그래프 두 곳에서 관측됐을 뿐 원인이 둘인 게 아니다:
 * - 서버 컴포넌트 그래프(`auth.ts → get-auth-session.ts → layout.tsx`)는 CREW의 Task 030
 *   zone 7 이관(`src/lib/auth/` 신설, 이 배럴에서 `export * from "./supabase/auth"` 제거)
 *   으로 사라진다.
 * - 클라이언트 번들 그래프(`board.ts` 등 9개 도메인 모듈 아무거나 → `resolve-post-link-card.ts`
 *   → `MessageRoomContainer.tsx`)는 **CORE의 Task 020C 수정으로만** 사라진다 — 이 배럴
 *   (`src/lib/data/**`)은 건드리지 않는 방향으로 처리 중이다.
 *
 * 최종 빌드 통과 확인은 두 조치가 합쳐진 뒤 팀장이 한다. 경위는
 * `docs/decisions/auth-integration-030.md` §1,
 * `docs/decisions/read-path-realdata-031.md` §12·§12.1 참고.
 */
export * from "./supabase/board";
export { type CreatePostInput, createPost, type UpdatePostInput, updatePost, deletePost } from "./mock/board";

export * from "./supabase/chat";
export { type SendMessageInput, sendMessage, deleteMessage } from "./mock/chat";

export * from "./supabase/crew";
export {
  type CreateCrewInput,
  createCrew,
  type UpdateCrewInfoInput,
  updateCrewInfo,
  updateCrewVisibility,
  setCrewMembershipRole,
  approveCrewMembership,
  rejectCrewMembership,
  updateCrewMembershipStatus,
  acceptCrewInvitationMembership,
  declineCrewInvitationMembership,
  initiateCrewMembership,
  withdrawPendingCrewMembership,
} from "./mock/crew";

export * from "./supabase/invitation";
export { type CreateInvitationInput, createInvitation, respondToInvitation } from "./mock/invitation";

export * from "./supabase/join-request";
export {
  type CreateJoinRequestInput,
  createJoinRequest,
  decideJoinRequest,
  withdrawJoinRequest,
} from "./mock/join-request";

export * from "./supabase/meetup";
export {
  type CreateMeetupFromPollInput,
  createMeetupFromPoll,
  type RespondAttendanceInput,
  respondAttendance,
} from "./mock/meetup";

export * from "./supabase/notification";
export {
  type CreateNotificationInput,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from "./mock/notification";

export * from "./supabase/poll";
export {
  type CreatePollInput,
  createPoll,
  type CastVoteInput,
  castVote,
  type ClosePollInput,
  closePoll,
} from "./mock/poll";

export * from "./supabase/profile";
export {
  type CreateProfileInput,
  createProfile,
  type UpdateProfileInput,
  updateProfile,
  changeProfileHandle,
} from "./mock/profile";

export * from "./contracts";
