import type { Id, ISODateString } from "@/lib/types";

/**
 * `MeetupDetail.tsx`가 받는 평평한(flat) 조인 결과 — `MeetupDetailContainer`가 Meetup·Crew·Poll
 * 세 엔티티를 조인해 만든다(D-030 ①, `board-view-models.ts`의 `PostDetailViewModel`과 같은
 * 자리). 전부 직렬화 가능한 원시값이다(NFR-037).
 */
export interface MeetupDetailViewModel {
  id: Id;
  /** FR-065(Task 041) — 취소·일정 변경 액션이 크루 스코프 판정에 필요하다. */
  crewId: Id;
  title: string;
  /** null이면 설명 없음 — 그 문단 자체를 렌더링하지 않는다. */
  description: string | null;
  crewName: string;
  crewColorIndex: number;
  date: ISODateString;
  /** 사람이 읽는 날짜 문구(`formatDayLabelKo` 결과) — 컨테이너가 이미 만들어 내려준다. */
  dateLabel: string;
  /** "HH:MM" 원본. FR-064 AC1 — 값이 없으면 컴포넌트가 그 줄 자체를 생략한다("시각 미정" 같은
   *  플레이스홀더를 쓰지 않는다, `calendar.month.detail`과의 차이는 `ko.ts`의 `meetup` 모듈
   *  docstring 참고). 표시 가공(오전/오후)은 `date-grid.ts`의 `formatStartTimeKo`. */
  startTime: string | null;
  place: string | null;
  capacity: number | null;
  attendingCount: number;
  isCancelled: boolean;
  /** FR-064 AC1 "원 제안글 링크" — Poll을 못 찾는 등 방어적으로만 null이 될 수 있다. */
  postHref: string | null;
  /** FR-064 AC1 "투표 결과 요약". Meetup은 항상 가결(passed) Poll에서만 생성되므로(D-034)
   *  실제로는 항상 값이 있지만, Poll을 못 찾는 방어적 경우를 위해 null을 허용한다. */
  pollTally: { forCount: number; againstCount: number; abstainCount: number } | null;
  /** FR-065(Task 041) — `meetup:cancel_or_update` 판정 결과(임원·오너, 또는 제안자 본인).
   *  `isCancelled`거나 과거 Meetup이면 `MeetupDetailContainer`가 이미 false로 계산해 내려준다
   *  (AC3 — 취소·변경 버튼 자체를 숨긴다). */
  canCancelOrUpdate: boolean;
  /** FR-065 AC2 "일정 변경" CTA가 이동할 글쓰기 경로(`getBoardWriteHref`). D-003이 날짜
   *  변경에 재투표를 요구해 이 화면에서 날짜를 직접 고치지 않는다 — 새 모임 제안글 작성으로
   *  안내한다(`docs/decisions/community-expansion-041.md` §3). */
  boardWriteHref: string;
}

/** 참석자 3구분 목록(FR-068) 각 행 — `groupMeetupParticipantIds`(lib/rules)의 profileId 결과에
 *  컨테이너가 `Profile`을 조인해 만든다. `displayName`은 탈퇴자면 이미 "탈퇴한 사용자"다(D-010 —
 *  `generate-profiles.ts` 시드가 익명화 시점에 이 필드 자체를 바꿔 두므로 이 컴포넌트가 별도
 *  익명화 처리를 하지 않는다). */
export interface MeetupParticipantView {
  profileId: Id;
  displayName: string;
  avatarUrl: string | null;
}

export interface MeetupParticipantGroupsView {
  attending: MeetupParticipantView[];
  absent: MeetupParticipantView[];
  noResponse: MeetupParticipantView[];
}
