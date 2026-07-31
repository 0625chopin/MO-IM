/**
 * "지금 활발한 모임"(D-109) 표현 컴포넌트가 받는 뷰 모델.
 *
 * `calendar-types.ts`의 `UpcomingMeetupSummary`와 같은 역할이다 — 표현 컴포넌트가 도메인
 * 타입(`HotMeetup`)이나 데이터 레이어에 직접 의존하지 않도록 컨테이너가 여기로 변환해 넘긴다
 * (D-030 ①).
 *
 * **`activityScore`(원시 합성 점수)를 여기 담지 않는다.** 대신 컨테이너가 1위 대비 비율로
 * 정규화한 `intensity`만 넘긴다 — 표현 층이 절대 점수를 알 필요가 없고, 알면 언젠가 화면에
 * 숫자로 찍히기 때문이다(그 값은 3·게시글+2·투표+1·채팅 합성값이라 사용자에게 아무 의미가
 * 없다). 정규화 자체도 컨테이너 몫이다 — 목록 전체를 봐야 계산할 수 있어 행 단위 표현
 * 컴포넌트가 할 수 없는 일이다.
 */
export interface HotMeetupItem {
  id: string;
  /** 크루 홈으로 잇는다 — 모임 상세는 비소속자에게 닫혀 있다(D-048). */
  crewHref: string;
  crewName: string;
  crewCategory: string | null;
  /** `crews.colorKey` 그대로. `crewCertaintyVars`에 넘긴다. */
  colorIndex: number;
  title: string;
  /** 이미 사람이 읽는 형식으로 변환된 값(예: "8월 4일 (화)"). */
  dateLabel: string;
  /** 이미 변환된 값(예: "오후 7:00"). 시간 미정이면 null. */
  timeLabel: string | null;
  attendingCount: number;
  capacity: number | null;
  /**
   * 1위 대비 상대 활동량 (0 초과 ~ 1). 잔물결 막대의 폭이 된다.
   *
   * **상대값만 담는 이유**: 절대 활동량을 노출하지 않으면서도 "1위가 압도적인지, 다섯이
   * 비슷한지"라는, 순위 숫자만으로는 알 수 없는 정보를 전달하기 위해서다. 이 목록 안에서의
   * 비율은 어떤 랭킹 표시에도 내재하는 정보라 추가 노출로 보지 않는다(D-109 §잔여 위험).
   */
  intensity: number;
}
