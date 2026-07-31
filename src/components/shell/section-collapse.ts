/**
 * 홈 대시보드 섹션 접기/펴기 상태의 **직렬화 규약** — `calendar-types.ts`의 크루 필터 쿠키
 * (`CREW_FILTER_COOKIE_NAME` + `serializeCrewFilterSelection`)와 같은 자리·같은 성격의 모듈이다.
 * 서버(쿠키 읽기)와 클라이언트(쿠키 쓰기)가 같은 규약을 공유해야 하므로 `next/headers`도
 * `document`도 건드리지 않는 순수 모듈로 둔다 — 실제 접근은 `section-collapse-cookie.ts`(서버)와
 * `section-collapse-client.ts`(브라우저)가 나눠 맡는다.
 *
 * **저장하는 값은 "접힌 섹션"이지 "펼친 섹션"이 아니다.** 기본값이 "전부 펼침"이라 그 편이
 * 쿠키를 짧게 유지하고, 앞으로 섹션이 늘어나도 **새 섹션은 자동으로 펼친 상태**가 된다 —
 * 반대로 저장했다면 쿠키에 없는 새 섹션이 접힌 채로 나타나 사용자가 존재 자체를 모르게 된다.
 */

/** 접힘 상태 쿠키. `mo_im_crew_filter`와 같은 접두 규칙을 따른다. */
export const SECTION_COLLAPSE_COOKIE_NAME = "mo_im_home_sections";

/**
 * 홈 대시보드(SC-06) 섹션 식별자. 쿠키에 그대로 들어가는 값이므로 **이름을 바꾸면 기존
 * 사용자의 접힘 상태가 초기화된다**(깨지지는 않는다 — 모르는 값은 무시된다).
 */
export const HOME_SECTION_IDS = ["upcoming", "crews", "notifications", "hot"] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

function isHomeSectionId(value: string): value is HomeSectionId {
  return (HOME_SECTION_IDS as readonly string[]).includes(value);
}

/**
 * 쿠키 원본 문자열 → 접힌 섹션 집합. 모르는 값·빈 문자열은 조용히 버린다 — 쿠키는 사용자가
 * 손으로 고칠 수 있는 입력이고, 여기서 던져 봐야 홈 화면 전체가 오류로 바뀔 뿐이다(이 값은
 * 권한이 아니라 UI 선호도다).
 */
export function parseCollapsedSections(raw: string | undefined): ReadonlySet<HomeSectionId> {
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(isHomeSectionId));
}

/** 접힌 섹션 집합 → 쿠키 값. 순서를 `HOME_SECTION_IDS` 기준으로 고정해 같은 상태가 항상 같은
 *  문자열이 되게 한다(디버깅 시 눈으로 비교할 수 있다). */
export function serializeCollapsedSections(collapsed: ReadonlySet<HomeSectionId>): string {
  return HOME_SECTION_IDS.filter((id) => collapsed.has(id)).join(",");
}
