import {
  parseCollapsedSections,
  SECTION_COLLAPSE_COOKIE_NAME,
  serializeCollapsedSections,
  type HomeSectionId,
} from "@/components/shell/section-collapse";

/** 접힘 상태는 "명시적으로 바꾸기 전까지" 유지한다 — 크루 필터 쿠키와 같은 1년. */
const SECTION_COLLAPSE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * 섹션 하나의 접힘 여부를 쿠키에 반영한다 — `CollapsibleSection.tsx`의 토글 이벤트 핸들러
 * 전용이다.
 *
 * `writeCrewFilterCookie`(`crew-filter-client.ts`)와 같은 이유로 컴포넌트 본문이 아니라 평범한
 * top-level 함수로 뒀다: `document` 대입을 컴포넌트 함수 안에 두면 `react-hooks/immutability`가
 * "컴포넌트 바깥 값을 수정한다"고 오탐한다(그 파일의 모듈 docstring 참고).
 *
 * **쓰기 전에 쿠키를 다시 읽는다.** 홈에는 이 컴포넌트 인스턴스가 섹션 수만큼 있고 각자
 * 자기 섹션만 안다 — 자기 상태만으로 쿠키를 통째로 덮어쓰면 같은 화면의 다른 섹션 접힘이
 * 지워진다. 브라우저 쿠키가 이 값의 단일 소스다.
 */
export function writeSectionCollapsed(sectionId: HomeSectionId, collapsed: boolean): void {
  const next = new Set(parseCollapsedSections(readRawCookie()));
  if (collapsed) {
    next.add(sectionId);
  } else {
    next.delete(sectionId);
  }
  document.cookie = `${SECTION_COLLAPSE_COOKIE_NAME}=${serializeCollapsedSections(next)}; path=/; max-age=${SECTION_COLLAPSE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

function readRawCookie(): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${SECTION_COLLAPSE_COOKIE_NAME}=`))
    ?.slice(SECTION_COLLAPSE_COOKIE_NAME.length + 1);
}
