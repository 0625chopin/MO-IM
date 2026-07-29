import type {
  Id,
  ISODateTimeString,
  PollOutcome,
  PollStatus,
  PollTally,
  VoteChoice,
} from "@/lib/types";

/**
 * 표현 컴포넌트(`PollPanel.tsx` 이하 6종)가 받는 조인·판정 완료 모양. `PollPanelContainer`가
 * `lib/data`(조회)와 `lib/rules`(판정: 정족수·집계 공개 범위·타임존)를 호출해 이 형태로
 * 조립한다 — 표현 컴포넌트는 `lib/data`를 import할 수 없으므로(D-030 ①, zone 4) 이미 판정된
 * 값만 받는다. `board-view-models.ts`(`PostDetailViewModel`)와 같은 원칙.
 */
export interface PollBallotViewer {
  /** `poll:vote` 권한(크루원 이상) **AND** 이 투표의 대상자 스냅샷 소속 여부를 모두 반영한
   *  최종 판정. `false`면 `ineligibleReason`이 항상 값을 가진다. */
  canVote: boolean;
  /**
   * FR-041 AC4 — 비대상자에게 컨트롤을 비활성화하며 보여줄 사유. `not_crew_member`는
   * D-039 크루원 게이트가 이미 board 하위 라우트를 막아 실제로는 거의 발생하지 않는 방어적
   * 분기이고, `not_in_snapshot`(투표 생성 이후 가입)이 실제로 발생하는 사유다.
   */
  ineligibleReason: "not_crew_member" | "not_in_snapshot" | null;
  /** 현재(마지막) 선택. 재투표해 온 사람도 최종 선택 하나만 담긴다(D-003 "종료 전까지 무제한 변경"). */
  myChoice: VoteChoice | null;
}

export interface PollViewModel {
  id: Id;
  postId: Id;
  status: PollStatus;
  outcome: PollOutcome | null;
  closesAt: ISODateTimeString;
  decidedAt: ISODateTimeString | null;
  /** FR-043 AC4 · D-024 — 마감은 지났지만 자동 종료가 아직 반영되지 않은 window. */
  isAwaitingClosure: boolean;
  /** 정족수 분모(D-003, `removed`만 제외). */
  eligibleVoterCount: number;
  /** `ceil(eligibleVoterCount / 3)`(D-032). */
  quorumRequired: number;
  quorumMet: boolean;
  /** 기권 포함 참여자 수(D-003 정족수 분자). */
  votedCount: number;
  tally: PollTally;
  /** D-031 — 대상자 5명 미만 && 진행 중이면 `false`(상세 집계 숨김, "N명 참여"만 노출). */
  showDetailedTally: boolean;
  /** `getPollRemainingMs` 결과(ms). 진행 중일 때만 의미 있다. */
  remainingMs: number;
  /**
   * FR-060 1:1 — 가결(closed_passed) Meetup의 리소스 ID. Meetup 자동 생성 파이프라인은
   * Task 034 몫이라 가결이어도 아직 없을 수 있다(`null`이 정상 상태) — 링크는 리소스 ID
   * 기준으로만 만든다(R-016).
   */
  meetupId: Id | null;
  viewer: PollBallotViewer;
  /** `poll:close_early` 판정 결과(제안자 본인 또는 임원 이상). */
  canCloseEarly: boolean;
  /** FR-046 AC1(Task 044) — 철회 권한. `poll:close_early`와 대상이 완전히 같아(제안자 본인
   *  또는 임원 이상, NFR-036) 같은 판정 결과를 공유한다. */
  canWithdraw: boolean;
}
