import type { Id, ISODateTimeString, PollStatus, PostType } from "@/lib/types";

/**
 * `PostLinkCard`가 받는 조인·판정 완료 모양(FR-052·053, Task 020C). `resolvePostLinkCard`가
 * `lib/data`를 조회해 이 형태로 조립한다 — 표현 컴포넌트는 `lib/data`를 import할 수 없으므로
 * (D-030 ①, zone 4) 이미 조인된 값만 props로 받는다. `board-view-models.ts`(`BoardPostSummary`)와
 * 같은 원칙.
 *
 * 3분기: `"post"`(일반글·제안글 공통 — `postType`으로 배지만 갈린다)·`"deleted"`(FR-052 E2,
 * 게시글이 없거나 소프트 삭제됨)·`"forbidden"`(FR-052 E1, 다른 크루 게시글 — 카드로 확장하지
 * 않는다). 팀장 지침의 "4분기"는 `"post"`를 일반글/제안글 둘로 세어 부른 것과 같은 개념이다.
 */
export type PostLinkCardViewModel =
  | {
      kind: "post";
      /** `getPostDetailHref(crewId, postId)`(R-016)로 이동 링크를 조립하는 데만 쓰인다. */
      crewId: Id;
      postId: Id;
      postType: PostType;
      title: string;
      authorDisplayName: string;
      authorAvatarUrl: string | null;
      /** `postType === "meetup_proposal"` 또는 `"meetup_reschedule_proposal"`일 때만 값이
       *  있다(FR-052 AC3 "투표 상태와 남은 시간", I-079/FR-065 AC2로 26일차 확장). */
      poll: {
        status: PollStatus;
        closesAt: ISODateTimeString;
        /** `getPollRemainingMs` 결과(ms) — `PollCountdown`이 그대로 소비한다. */
        remainingMs: number;
        isAwaitingClosure: boolean;
      } | null;
    }
  | { kind: "deleted" }
  | { kind: "forbidden" };
