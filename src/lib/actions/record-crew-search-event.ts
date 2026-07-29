"use server";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordProductEvent } from "@/lib/data";

/**
 * NFR-030 KPI-5(크루 검색 → 가입 신청 전환율) 산출용 — `CrewSearchBar`가 실제 키워드 검색을
 * 제출할 때(FR-014 E2, 2자 이상 검증을 통과한 제출형 검색만) 호출한다. 카테고리 토글만 바뀌는
 * 경우는 "검색"이 아니라 "필터"라 여기서 기록하지 않는다 — 호출부(`CrewSearchBar.handleSubmit`)
 * 참고.
 *
 * **게스트(anon) 검색은 기록하지 않는다** — `product_events` RLS가 `actor_id=auth.uid()`
 * self-service INSERT만 허용해(anon은 `auth.uid()`가 없다) 원천적으로 불가능하기도 하지만,
 * 이 KPI의 분자(FR-022 가입 신청)가 애초에 로그인을 요구해 게스트 단독 검색 세션은 이 전환
 * 퍼널에 기여할 수 없다 — 로그인하지 않은 방문자의 검색은 KPI-5 분모에 넣을 이유가 없다는
 * 뜻이다(`docs/decisions/observability-browser-045.md` §3 참고).
 *
 * 실패해도 검색 자체(라우팅)를 막지 않는다 — fire-and-forget, 호출부는 반환값을 기다리지 않는다.
 */
export async function recordCrewSearchEventAction(query: string, category: string | null): Promise<void> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") return;
  await recordProductEvent({
    actorId: session.profileId,
    eventType: "crew_search",
    payload: { query, category },
  });
}
