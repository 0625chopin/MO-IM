import type { Id, ISODateString, ISODateTimeString, PollStatus, PostType } from "@/lib/types";

/**
 * 표현 컴포넌트(`BoardList.tsx`)가 받는 목록 항목 모양. Post·Profile·Poll 세 엔티티를 컨테이너가
 * 이미 조인해 이 평평한(flat) 구조로 내려준다 — 표현 컴포넌트는 `lib/data`를 import할 수 없으므로
 * (D-030 ①, zone 4) 조인 결과만 props로 받는다. 전부 직렬화 가능한 원시값이다(NFR-037).
 */
export interface BoardPostSummary {
  id: Id;
  title: string;
  type: PostType;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  createdAt: ISODateTimeString;
  /** `type === "general"`이면 항상 null — 제안글에만 투표가 딸려 있다. */
  pollStatus: PollStatus | null;
  /** FR-081 AC1(Task 042A, 20일차 팀장 지시로 배선) — 뷰어가 작성자를 차단했는가. `authorId`
   *  자체는 노출하지 않는다(이 판정 하나만 필요하고, 표현 컴포넌트는 원본 id를 몰라도 된다 —
   *  `canWrite` 등 다른 사전 판정 불리언과 같은 원칙). `BoardListItem`이 `true`면 전체 카드를
   *  `BlockedContentNotice`로 감싼다. */
  isAuthorBlocked: boolean;
}

/** 목록 배지가 노출하는 투표 상태 4종(요구사항 §4.D AC3). `cancelled`·미종료 중간 상태는 뺀다 —
 *  이유는 `src/lib/strings/ko.ts`의 `board` 주석(§4 "상태 배지류는…") 참고. */
export const BOARD_LIST_VISIBLE_POLL_STATUSES: readonly PollStatus[] = [
  "open",
  "closed_passed",
  "closed_rejected",
  "closed_invalid",
];

/**
 * `PostDetail.tsx`가 받는 게시글 상세 모양. 권한·잠금 **판정 결과**(`canEditTitleBody`·
 * `canDelete`·`meetupDateLocked`)만 props로 내려간다 — 판정 자체는 컨테이너가
 * `lib/rules/permission.ts`·`lib/rules/post-edit-lock.ts`를 호출해 미리 계산한다(D-030 ①,
 * NFR-036). 표현 컴포넌트는 role·context를 몰라도 된다.
 */
export interface PostDetailViewModel {
  id: Id;
  title: string;
  body: string;
  type: PostType;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  createdAt: ISODateTimeString;
  editedAt: ISODateTimeString | null;
  /** `type === "meetup_proposal"`에서만 값이 있다. */
  meetupDate: ISODateString | null;
  pollStatus: PollStatus | null;
  /** `post:update_own` 판정 결과 — 제목·본문 수정 가능 여부. */
  canEditTitleBody: boolean;
  /** `post:delete_own` 또는 `post:delete_any` 판정 결과. */
  canDelete: boolean;
  /** `hasLockedFields(type)` 판정 결과 — true면 모임 예정일 잠금 안내를 보여준다. */
  meetupDateLocked: boolean;
  /** FR-081 AC1(Task 042A, 20일차) — `BoardPostSummary.isAuthorBlocked`와 같은 원칙. `PostDetail`
   *  이 `true`면 본문(`CardContent`)만 `BlockedContentNotice`로 감싼다 — 제목·작성자 표기는
   *  목록에서 이미 봤을 정보라 그대로 둔다. */
  isAuthorBlocked: boolean;
  /** FR-080(I-117 해소, 25일차) — `report:create` 판정 결과 AND 본인 글이 아님. `PostActions`에
   *  그대로 내려가 신고 버튼 노출 여부를 결정한다. */
  canReport: boolean;
}
