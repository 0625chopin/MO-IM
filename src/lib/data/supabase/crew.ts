import "server-only";

import type { Crew, CrewMembership, CrewVisibility, Id } from "@/lib/types";


import { escapeForIlikeOr, toCrew, toCrewMembership } from "./mappers";
import { createSupabaseServerClient } from "./server";

import type { CursorPage } from "../contracts";

/**
 * Crew·CrewMembership 읽기 전용 실데이터 구현 (Task 031, FR-010~012·014·022~024·026·028).
 * Mock(`../mock/crew.ts`)과 동일한 시그니처(NFR-035). 쓰기(개설·정보수정·상태전이 등)는
 * Task 032 몫 — 배럴이 `../mock/crew`에서 그대로 재노출한다.
 *
 * **`listCrewMembers`는 정책이 직접 select를 허용한다** — 029B가
 * `crew_memberships_select_self_or_fellow_member`로 "활성 크루원이면 그 크루의 모든 멤버십
 * 행(상태 무관)을 본다"로 넓혀서, 이 함수를 원본 테이블 직접 조회로 그대로 옮겨도 Mock과
 * 동작이 같다(README.md 인계 사항 1번 — 멤버 목록은 직접 select, 집계·소개·검색만 RPC 경유).
 */

export interface ListCrewsQuery {
  visibility?: CrewVisibility;
  query?: string;
  category?: string;
  /**
   * Mock 시그니처 호환을 위해 남겨 둔다 — 실데이터에서는 이 값 대신 세션(쿠키, RLS)이 "누가
   * 보는가"를 결정한다. `crews_select_anon_public`/`crews_select_authenticated`(029A §5)가
   * private 크루 비노출(D-017)을 이미 강제하므로, 이 함수 안에서 다시 필터링하지 않는다 —
   * 호출자가 실제 로그인 사용자와 다른 `viewerProfileId`를 넘겨도 결과는 세션 기준으로만
   * 나온다는 뜻이다(Mock과의 유일한 의미론적 차이, 설계 문서 §6 기록).
   */
  viewerProfileId?: Id | null;
  cursor?: Id | null;
  limit?: number;
}

export async function listCrews(opts: ListCrewsQuery = {}): Promise<CursorPage<Crew>> {
  const supabase = await createSupabaseServerClient();
  const limit = opts.limit ?? 20;
  const needle = opts.query?.trim();

  let query = supabase.from("crews").select("*").eq("status", "active");
  if (opts.visibility) query = query.eq("visibility", opts.visibility);
  if (opts.category) query = query.eq("category", opts.category);
  if (needle) {
    const safe = escapeForIlikeOr(needle);
    query = query.or(`name.ilike."%${safe}%",description.ilike."%${safe}%"`);
  }
  query = query.order("created_at", { ascending: true }).order("id", { ascending: true });

  if (opts.cursor) {
    const { data: anchor } = await supabase
      .from("crews")
      .select("created_at")
      .eq("id", opts.cursor)
      .maybeSingle();
    if (anchor) query = query.gt("created_at", anchor.created_at);
  }

  const { data, error } = await query.limit(limit + 1);
  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: page.map(toCrew), nextCursor: hasMore ? page[page.length - 1].id : null };
}

/**
 * **MAJOR 1 핫픽스(17일차) — private 크루 비소속자 404 회귀 복구.** `crews_select_authenticated`
 * RLS는 "보이거나 안 보이거나"만 표현할 수 있어, private 크루의 비소속자에게는 원본 select가
 * 조용히 0행을 준다 — 이 레이어(§4 결정)는 그걸 "크루 없음"과 구분하지 않으므로, 원본 select만
 * 썼다면 `CrewHomeContainer`가 이 경우를 404로 오판한다(D-007 위반, 팀장 실측·CORE 재확인).
 *
 * 그래서 원본 select가 0행이면 `crew_directory_summary` RPC(D-007 부분 노출 전용, 029B 설계·
 * CORE 17일차 재검증 — RPC 자체는 처음부터 정확했다, `docs/decisions/
 * crew-directory-summary-verification-hotfix.md` §8 시그니처)로 한 번 더 확인한다:
 * - RPC도 0행이면 진짜 크루가 없다(해산·오타 URL) — `null` 그대로 반환, `CrewHomeContainer`가
 *   `notFound()`를 던지는 게 맞다.
 * - RPC가 1행이면 크루가 실재하되 못 보는 것이다 — `id`·`name`·`visibility`만 진짜 값이고
 *   `description`·`category`·`colorKey`·`ownerId`는 RPC 자체가 안 주므로(D-007이 비소속자에게
 *   감추는 값) 플레이스홀더로 채운 `Crew`를 반환한다.
 *
 * **⚠️ 플레이스홀더 필드를 신뢰하지 말 것**: 이 마스킹된 객체는 `CrewHomeContainer`의
 * `crew.visibility === "private"` 비소속 분기(`crew.name`만 읽는다)를 만족시키기 위한 것이지
 * "전체 상세"가 아니다. 오늘 이 폴백을 실제로 타는 소비자는 `CrewHomeContainer`뿐이다 —
 * `getCrewById`의 다른 소비자(`BoardListContainer`·`PostDetailContainer`·`CrewSettingsContainer`
 * 등)는 전부 `(app)/crews/[crewId]/layout.tsx`(활성 멤버십 게이트) 뒤에 있어 원본 select가
 * 항상 성공하므로 이 폴백에 도달하지 않는다. **이 전제가 깨지는 새 소비자**(멤버십 게이트
 * 없이 `getCrewById`를 부르는 코드)를 추가할 때는 이 함수가 private+비소속 조합에서 가짜
 * `description`/`category`/`colorKey`("", "", 0)를 줄 수 있다는 것을 반드시 재확인할 것.
 */
export async function getCrewById(id: Id): Promise<Crew | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("crews").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (data) return toCrew(data);

  const { data: summaryRows, error: summaryError } = await supabase.rpc("crew_directory_summary", {
    p_crew_id: id,
  });
  if (summaryError) throw summaryError;
  const summary = summaryRows?.[0];
  if (!summary) return null;

  return {
    id: summary.id,
    name: summary.name,
    // RPC 타입은 `string`으로 생성돼 있지만(자동생성 타입의 알려진 한계 — SQL 함수 반환
    // 컬럼의 실제 nullability를 반영하지 못한다) private 크루에서는 런타임에 `null`이 온다
    // (CORE 실측 확인). 방어적으로 처리한다.
    description: (summary.description as string | null) ?? "",
    category: (summary.category as string | null) ?? "",
    visibility: summary.visibility as CrewVisibility,
    colorKey: 0,
    ownerId: "",
    status: "active",
  };
}

export async function listCrewMembers(crewId: Id): Promise<CrewMembership[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crew_memberships")
    .select("*")
    .eq("crew_id", crewId);
  if (error) throw error;
  return (data ?? []).map(toCrewMembership);
}

/**
 * 프로필이 속한 크루 목록(FR-061, Task 021A). 두 단계 조회(멤버십 → 크루)로 나눴다 — Supabase
 * embedded select(`crews!inner(*)`)로 한 번에 묶을 수도 있었지만, 필터 대상 테이블이 바뀌는
 * 임베드 필터(`.eq("crews.status", ...)`) 문법은 이 프로젝트에서 실측 검증할 방법이 없어(테스트
 * 러너 없음, R-002) 단순하고 검증하기 쉬운 2단계 조회를 택했다(설계 문서 §4).
 */
export async function listCrewsByProfile(profileId: Id): Promise<Crew[]> {
  const supabase = await createSupabaseServerClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("crew_memberships")
    .select("crew_id")
    .eq("profile_id", profileId)
    .eq("status", "active");
  if (membershipError) throw membershipError;

  const crewIds = [...new Set((memberships ?? []).map((m) => m.crew_id))];
  if (crewIds.length === 0) return [];

  const { data: crews, error: crewError } = await supabase
    .from("crews")
    .select("*")
    .in("id", crewIds)
    .eq("status", "active");
  if (crewError) throw crewError;
  return (crews ?? []).map(toCrew);
}

export async function getCrewMembership(
  crewId: Id,
  profileId: Id,
): Promise<CrewMembership | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crew_memberships")
    .select("*")
    .eq("crew_id", crewId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data ? toCrewMembership(data) : null;
}
