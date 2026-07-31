import type { Id, ISODateString, ISODateTimeString } from "./common.types";

/** D-034 — 별도 'scheduled' 중간 상태를 두지 않는다. 투표 가결로 생성되면 즉시 confirmed. */
export type MeetupStatus = "confirmed" | "cancelled";

export interface Meetup {
  id: Id;
  crewId: Id;
  pollId: Id;
  /** 제목·설명. FR-064 AC1의 상세 표시 요구로 PRD §7에 복구된 필드(D-035). */
  title: string;
  description: string | null;
  date: ISODateString;
  /**
   * 종료일. **하루짜리 모임이면 `date`와 같은 값이며 null이 되지 않는다** — "하루짜리"는
   * 별도 표현이 아니라 기간이 하루인 경우다(DB `meetups.end_date`도 NOT NULL). null을
   * "하루짜리"로 쓰지 않은 이유는 캘린더 겹침 조회가 매번 `endDate ?? date`를 타야 하고,
   * 그 폴백을 한 곳이라도 빠뜨리면 진행 중인 기간 모임이 목록에서 조용히 사라지기 때문이다.
   * 반대로 **제안글(`Post.meetupEndDate`)에서는 nullable이다** — 그쪽은 "입력하지 않았다"를
   * 표현해야 하고, 가결 시 `coalesce(meetupEndDate, meetupDate)`로 이 필드에 담긴다.
   */
  endDate: ISODateString;
  startTime: string | null;
  /**
   * 종료 시각(선택, D-013). `startTime`이 없으면 이 값도 없다(DB CHECK
   * `meetups_end_time_requires_start_time_check`). 같은 날 끝나는 모임이면 `startTime`보다
   * 뒤여야 하지만, 날짜를 넘기면 그 제약이 없다 — "22:00 시작 → 다음 날 02:00 종료"는 정상이다.
   */
  endTime: string | null;
  place: string | null;
  /** 정원(선택, D-013). null이면 정원 제한 없음 — 조건부 UPDATE 판정을 거치지 않는다. */
  capacity: number | null;
  /** 참석 확정 인원. `attendingCount < capacity` 조건부 UPDATE로 원자성을 보장한다(D-019). */
  attendingCount: number;
  status: MeetupStatus;
  createdAt: ISODateTimeString;
}

export type AttendanceStatus = "attending" | "absent";

/**
 * D-013 신규 엔티티. UNIQUE(meetupId, profileId)는 FR-067 E2 멱등성(upsert)의
 * 전제다(D-019) — 스키마 제약이며 이 타입 자체가 강제하지는 않는다.
 */
export interface MeetupAttendance {
  meetupId: Id;
  profileId: Id;
  status: AttendanceStatus;
  respondedAt: ISODateTimeString;
  /**
   * I-079/FR-065 AC2, 팀장 결정 — 소속 Meetup의 일정이 변경되면 이 값이 채워져 이 응답이
   * "무효화"됐음을 뜻한다("7/1에 간다"가 "7/8에 간다"를 의미하지 않으므로 재확인을 요구한다).
   * `status`는 이전 값 그대로 남지만(이력 목적) 정원(FR-066) 계산에는 반영되지 않는다 —
   * 무효화 시점에 `Meetup.attendingCount`가 이미 0으로 재계산됐다. 재확인
   * (`respond_meetup_attendance`)이 성공하면 이 값을 다시 null로 되돌린다. null이면 유효한
   * 응답이다(일반적인 상태).
   */
  invalidatedAt: ISODateTimeString | null;
}

/**
 * I-079/FR-065 AC2(26일차, CORE) — 일정 변경 투표 가결로 기존 Meetup 행이 UPDATE될 때 남는
 * 변경 이력 1건. Meetup 상세 화면의 "일정 변경 이력" 표시(AC2 "변경 이력이 남는다")가 소비
 * 대상이다. DB에서 `poll_id`가 UNIQUE라 같은 투표가 두 번 반영되지 않는다(멱등).
 */
export interface MeetupScheduleChange {
  id: Id;
  meetupId: Id;
  /** 이 변경을 가결시킨 "일정 변경 투표"의 pollId — Meetup을 최초로 만든 poll과는 다른 poll이다. */
  pollId: Id;
  previousDate: ISODateString;
  /** 변경 전 종료일. `Meetup.endDate`와 같은 이유로 non-null(하루짜리면 `previousDate`와 같다). */
  previousEndDate: ISODateString;
  previousStartTime: string | null;
  previousEndTime: string | null;
  previousPlace: string | null;
  previousCapacity: number | null;
  newDate: ISODateString;
  /** 변경 후 종료일. non-null — 하루짜리면 `newDate`와 같다. */
  newEndDate: ISODateString;
  newStartTime: string | null;
  newEndTime: string | null;
  newPlace: string | null;
  newCapacity: number | null;
  changedAt: ISODateTimeString;
}

/**
 * 참석/불참 응답 처리 결과. `Meetup.capacity`가 null(정원 없음)이면 이 타입을 거치지
 * 않고 바로 성공 처리한다 — 호출부(데이터 접근 레이어)의 책임.
 *
 * - `success: false, reason: "full"` — 정원 조건부 UPDATE(D-019) 판정에 의한 **실제
 *   실패**(FR-066 E1·E2, AC1·AC2).
 * - `success: false, reason: "forbidden"` — 크루원이 아닌데도 호출된 경우(Task 032
 *   교차검증 major 1 수정, 18일차). Server Action이 호출 전에 이미 활성 멤버십을
 *   확인하므로 정상 UI 흐름에서는 도달하지 않는다 — publishable key로 RPC를 직접
 *   호출하는 경로(TOCTOU 포함)에 대한 데이터 레이어의 2차 방어선이다.
 * - `success: true, changed: false` — 이미 같은 상태로 응답한 요청을 멱등 처리한
 *   결과(예: 이미 "불참"인데 다시 "불참" 요청). FR-067 E2 "이미 불참 상태 → 무시
 *   (멱등)"가 이를 실패가 아니라 조용한 성공으로 요구하므로 `success: false`로
 *   표현하지 않는다 — 이전 `reason: "already_responded"`는 이 요구와 충돌해 제거했다.
 *   `unique(meetupId, profileId)` 제약이 이 멱등 처리(upsert)의 전제다(D-019).
 * - `success: true, changed: true` — 실제로 상태가 바뀐 정상 처리.
 */
export type AttendanceJoinResult =
  | { success: true; changed: boolean }
  | { success: false; reason: "full" | "forbidden" };

/**
 * 메인 화면(랜딩 `/` + 홈 `/home`) "지금 활발한 모임" 카드 한 줄 (D-109).
 *
 * **`Meetup`의 부분집합이 아니라 별개 타입이다.** 크루 정보(이름·카테고리·색)를 함께 담고,
 * 반대로 **`place`·`description`·`pollId`·`createdAt`은 일부러 없다** — 이 타입이 표현하는
 * 것은 "공개 크루의 예정된 모임을 비소속자·게스트에게 보여줄 때 허용된 필드 집합"이고, 그
 * 경계는 `public.hot_public_meetups` RPC가 유일한 통로다(D-048이 세운 "Meetup 콘텐츠
 * 비노출"을 넓히되 오프라인 집결지는 계속 감춘다).
 *
 * **`Meetup`을 재사용하지 않은 이유**: `Meetup`을 그대로 쓰면 `place`를 `null`로 채워 넘겨야
 * 하는데, 그러면 "정말 장소가 없는 모임"과 "노출이 금지돼 비운 것"이 타입에서 구분되지 않는다.
 * 나중에 이 목록을 다른 화면에 재사용하는 사람이 `place`가 비어 있는 것을 데이터 결손으로
 * 오해해 채워 넣을 수 있다 — 필드를 아예 두지 않으면 그 실수가 컴파일 단계에서 막힌다.
 */
export interface HotMeetup {
  id: Id;
  crewId: Id;
  crewName: string;
  /** 공개 크루만 반환되므로 항상 값이 있다 — `crew_directory_summary`의 private 분기와 다르다. */
  crewCategory: string | null;
  /** `crews.color_key`. `crewPaletteVars`(`src/lib/crew-palette.ts`)에 그대로 넘긴다. */
  crewColorKey: number;
  title: string;
  date: ISODateString;
  /** `Meetup.endDate`와 같은 규약 — 하루짜리면 `date`와 같다. */
  endDate: ISODateString;
  startTime: string | null;
  endTime: string | null;
  attendingCount: number;
  /** null이면 정원 제한 없음(D-013). */
  capacity: number | null;
  /**
   * 최근 7일 크루 활동의 가중 합성값(3·게시글 + 2·투표 + 1·채팅). **순위 근거일 뿐 표시용
   * 수치가 아니다** — 개별 카운트로 역산되지 않도록 합성해 둔 값이라 그대로 화면에 숫자로
   * 찍으면 의미 없는 정보를 노출하는 셈이 된다. UI는 순위(1~5)만 쓴다.
   */
  activityScore: number;
}
