/**
 * 크루 홈 탭의 값 목록 — 라우팅(`?tab=`)·내비 렌더·컨테이너 분기가 전부 이 하나를 본다.
 * 문자열 리터럴을 각자 적어 두면 탭을 하나 더할 때 세 곳이 어긋난다.
 *
 * **순서가 곧 화면의 탭 순서다.** 활동내역이 먼저인 것은 크루 홈에 들어온 사람이 가장 먼저
 * 답을 원하는 질문이 "이 크루는 뭘 해 왔나"이기 때문이다 — 기능(투표·글쓰기)은 그 다음이다.
 */
export const CREW_HOME_TABS = ["activity", "votes", "posts", "photos", "members", "chat"] as const;

export type CrewHomeTab = (typeof CREW_HOME_TABS)[number];

export const DEFAULT_CREW_HOME_TAB: CrewHomeTab = "activity";

/** 알 수 없는 값(오타 URL·옛 링크)은 404가 아니라 기본 탭으로 되돌린다. */
export function resolveCrewHomeTab(raw: string | undefined): CrewHomeTab {
  return (CREW_HOME_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as CrewHomeTab)
    : DEFAULT_CREW_HOME_TAB;
}
