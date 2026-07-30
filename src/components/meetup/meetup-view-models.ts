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
  /**
   * I-079/FR-065 AC2(26일차, BOARD) — "일정 변경 제안" 진입 버튼 노출 여부.
   * `canCancelOrUpdate`(제안자 본인·임원·오너만)와 **의도적으로 다른 판정**이다 — 일정 변경
   * 제안은 이제 즉시 상태를 바꾸지 않고 재투표를 거치므로(D-003), `poll:create_proposal`
   * 권한 매트릭스(활성 크루원 전원 허용)를 그대로 재사용한다. 일반 FR-034 제안글을 아무
   * 크루원이나 쓸 수 있는 것과 같은 이유다 — 개인이 아니라 크루 투표가 최종 결정권을 갖는다.
   * `isCancelled`거나 과거 Meetup이면 `isMeetupAttendanceOpen`이 이미 false라 이 값도
   * false다(AC3와 같은 재사용).
   */
  canProposeReschedule: boolean;
  /** I-079/FR-065 AC2 — 조회자 본인의 참석 응답이 일정 변경으로 무효화됐는지(`invalidatedAt
   *  !== null`). true면 `MeetupDetail`이 재확인을 요구하는 안내 배너를 보여준다 — 무효화가
   *  조용히 일어나면 사용자는 자신이 여전히 참석자인 줄 안다. */
  attendanceInvalidated: boolean;
  /** I-079/FR-065 AC2 — "일정 변경 이력"(`listMeetupScheduleChanges`) 표시용, 최신순.
   *  빈 배열이면 이력 없음(AC2 빈 상태). */
  scheduleChanges: MeetupScheduleChangeView[];
}

/** `MeetupScheduleChange`(lib/types)의 표시용 가공 — 컨테이너가 날짜·시각 포맷팅을 이미
 *  끝낸 값만 담는다(D-030 ①, 이 파일의 다른 뷰모델과 같은 원칙). */
export interface MeetupScheduleChangeView {
  id: Id;
  changedAtLabel: string;
  previousDateLabel: string;
  previousStartTimeLabel: string | null;
  previousPlace: string | null;
  /** null이면 "정원 제한 없음"(과거 정원)이었다는 뜻 — 값이 있으면 그 숫자를 그대로 보여준다. */
  previousCapacity: number | null;
  newDateLabel: string;
  newStartTimeLabel: string | null;
  newPlace: string | null;
  newCapacity: number | null;
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
