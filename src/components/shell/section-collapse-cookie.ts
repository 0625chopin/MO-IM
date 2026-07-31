import { cookies } from "next/headers";

import {
  parseCollapsedSections,
  SECTION_COLLAPSE_COOKIE_NAME,
  type HomeSectionId,
} from "@/components/shell/section-collapse";

/**
 * 홈 섹션 접힘 상태의 서버 쪽 읽기 — `crew-filter-cookie.ts`와 같은 이유로 `next/headers`를
 * 쓰는 함수만 별도 파일로 갈랐다(서버 컴포넌트에서만 import한다).
 *
 * **쓰기가 여기 없는 것도 같은 이유다.** 접힘 상태는 인증·권한이 아니라 평범한 UI 선호도라
 * `httpOnly`일 필요도, Server Action을 거칠 이유도 없다 — `CollapsibleSection`(클라이언트)이
 * 토글할 때 `document.cookie`로 직접 쓴다. 크루 필터와 달리 `router.refresh()`도 부르지
 * 않는다: 접기는 이미 화면에 있는 것을 숨기는 동작이라 서버에서 다시 받아올 데이터가 없다.
 * 쿠키는 **다음 방문의 초기 상태**를 위해서만 쓴다.
 */
export async function getCollapsedSections(): Promise<ReadonlySet<HomeSectionId>> {
  const cookieStore = await cookies();
  return parseCollapsedSections(cookieStore.get(SECTION_COLLAPSE_COOKIE_NAME)?.value);
}
