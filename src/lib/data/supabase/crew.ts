import "server-only";

import { crewColorIndex } from "@/lib/rules/crew-color-hash";
import type { Crew, CrewMembership, CrewMembershipRole, CrewVisibility, Id } from "@/lib/types";

import { type CursorPage, type DataErrorCode, type DataResult, err, ok } from "../contracts";

import { escapeForIlikeOr, toCrew, toCrewMembership } from "./mappers";
import { createSupabaseServerClient } from "./server";

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
 * **I-081 해소(21일차, DESIGN 진단·CORE 수정) — public 크루 비소속 방문자용 활성 멤버 수.**
 * `listCrewMembers`는 `crew_memberships_select_self_or_fellow_member` RLS(본인이거나 이미
 * 그 크루의 활성 크루원이어야 함)에 걸려 **비소속 방문자(anon 포함)에게 항상 0행**을 준다 —
 * `CrewHomeContainer`의 "public 크루·비소속" 분기가 `listCrewMembers`로 멤버 수를 세면 실제
 * 인원과 무관하게 항상 "0명"으로 보인다(FR-012 AC3 위반). 이건 `getCrewById`의 private-크루
 * 404 폴백(17일차)·`getMeetupById`의 forbidden 폴백(21일차, I-073)과 **같은 패턴의 세 번째
 * 사례**다 — "RLS로 숨긴 값을 SECURITY DEFINER RPC로 최소 노출".
 *
 * `crew_directory_summary`(029B, D-007)가 `member_count`를 이미 RLS 우회로 정확히 계산해
 * 반환하므로 그 값을 그대로 쓴다. **이 함수는 `getCrewById`처럼 "0행→폴백"이 아니라 처음부터
 * RPC를 쓴다** — 존재 확인이 목적이 아니라(호출자가 이미 크루 존재·`public` 여부를 안다는
 * 전제) "공개 소개용 멤버 수" 하나만 목적이고, D-007이 이 값을 `public` 크루에 한해 누구나
 * (게스트 포함) 볼 수 있다고 이미 확정했다. 대상 크루가 없거나 `private`면 RPC가 0행을 주므로
 * `0`을 반환한다 — 호출자가 이미 접근 가능 여부를 판정한 뒤에만 불러야 한다(private 크루의
 * "초대 전용" 분기에서 이 값을 표시용으로 쓰면 안 된다, 소개조차 안 보이는 게 D-007 원문).
 * 실측(anon·postgres 대조): `docs/ISSUES.md` I-081.
 */
export async function getPublicCrewMemberCount(id: Id): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("crew_directory_summary", { p_crew_id: id });
  if (error) throw error;
  return data?.[0]?.member_count ?? 0;
}

export interface ListCrewsByProfileOptions {
  /**
   * FR-013 AC2(Task 040 후속, I-067) — 해산된(`archived`) 크루도 포함할지. 기본값 `false`로
   * **기존 호출자 전부의 동작을 그대로 유지한다**(전수 조사 결과는 `docs/decisions/
   * crew-lifecycle-040.md` §11 참고): `HomeCalendarSummaryContainer`(다가오는 모임 — archived
   * 크루는 미래 Meetup이 없으므로 포함해도 결과가 안 바뀌지만 의미상 "현재 소속"만 다루는 게
   * 맞다)·`fetch-crew-cards.ts`("가입됨" 배지 — 해산된 크루를 탐색 결과에 다시 노출할 이유가
   * 없다)·`AccountSettingsContainer`(FR-005 AC1 "오너로 있는 **활성** 크루" 차단 목록 — 이미
   * 해산된 크루는 탈퇴를 막을 이유가 없다) 셋 다 `active`만 봐야 하므로 옵션을 생략한다.
   * **`MonthCalendarContainer`(FR-061·FR-013 AC2, 캘린더 과거 이력 열람)만** `true`로
   * 호출해야 한다 — 캘린더는 크루가 해산돼도 과거 Meetup을 "열람 전용"으로 계속 보여줘야
   * 하는데, 그 Meetup의 크루명·색상(`crewById` 조인)을 해석하려면 해산된 크루 자체가 이
   * 목록에 있어야 한다(그렇지 않으면 크루명이 빈 문자열로 렌더된다).
   */
  includeArchived?: boolean;
}

/**
 * 프로필이 속한 크루 목록(FR-061, Task 021A). 두 단계 조회(멤버십 → 크루)로 나눴다 — Supabase
 * embedded select(`crews!inner(*)`)로 한 번에 묶을 수도 있었지만, 필터 대상 테이블이 바뀌는
 * 임베드 필터(`.eq("crews.status", ...)`) 문법은 이 프로젝트에서 실측 검증할 방법이 없어(테스트
 * 러너 없음, R-002) 단순하고 검증하기 쉬운 2단계 조회를 택했다(설계 문서 §4).
 *
 * **1단계(멤버십)는 옵션과 무관하게 항상 `status='active'`만 본다** — "지금 이 크루에 속해
 * 있는가"는 `includeArchived`가 결정할 문제가 아니다(탈퇴·강퇴된 사용자에게는 여전히 안
 * 보여야 한다). `includeArchived`는 **2단계(크루 자체)에서만** `crews.status` 필터를
 * 생략할지 결정한다 — Task 040 후속(I-067), `docs/decisions/crew-lifecycle-040.md` §11.
 */
export async function listCrewsByProfile(
  profileId: Id,
  opts: ListCrewsByProfileOptions = {},
): Promise<Crew[]> {
  const supabase = await createSupabaseServerClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("crew_memberships")
    .select("crew_id")
    .eq("profile_id", profileId)
    .eq("status", "active");
  if (membershipError) throw membershipError;

  const crewIds = [...new Set((memberships ?? []).map((m) => m.crew_id))];
  if (crewIds.length === 0) return [];

  let query = supabase.from("crews").select("*").in("id", crewIds);
  if (!opts.includeArchived) {
    query = query.eq("status", "active");
  }
  const { data: crews, error: crewError } = await query;
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

export interface CreateCrewInput {
  name: string;
  description: string;
  category: string;
  visibility: CrewVisibility;
  ownerId: Id;
}

/**
 * 크루 개설(FR-010 AC1·AC2, D-008, D-016). `crews.id`는 기본값이 `gen_random_uuid()`이지만
 * D-016("색 = hash(crewId) mod 12")을 만족하려면 INSERT **전에** id를 알아야 한다 — 그래서
 * `crypto.randomUUID()`로 이 레이어가 직접 id를 생성해 넘긴다(Mock의 `generateId` 자리를
 * 대신한다). 오너 멤버십·게시판·채팅방 자동 생성은 `crews_provision_owner_bootstrap`
 * (AFTER INSERT 트리거)이 단일 INSERT 안에서 원자적으로 처리한다 — Mock처럼 이 함수가 4단계를
 * 手동으로 묶을 필요가 없다.
 */
export async function createCrew(input: CreateCrewInput): Promise<Crew> {
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from("crews")
    .insert({
      id,
      name: input.name,
      description: input.description,
      category: input.category,
      visibility: input.visibility,
      color_key: crewColorIndex(id),
      owner_id: input.ownerId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toCrew(data);
}

export type UpdateCrewInfoInput = Partial<Pick<Crew, "name" | "description" | "category" | "colorKey">>;

/**
 * 크루 정보 수정(FR-011). `crews_update_staff_or_owner` RLS가 임원 이상만 허용한다.
 *
 * **I-070 해소(20일차, CORE)** — 예전엔 `if (error) throw error`라 SQL 거부(RLS·트리거)가
 * 처리되지 않은 예외로 `updateCrewInfoAction`(Server Action)까지 그대로 올라갔다. 20일차
 * `crews_guard_archived_immutable` 트리거(I-066 잔여분, archived 크루는 UPDATE 전체 거부)가
 * 새로 생기면서 이 gap이 실제로 도달 가능해졌다 — `CrewSettingsContainer`는 `crew.status`를
 * 보지 않으므로(별도 이슈 아님, 범위 밖) archived 크루의 설정 화면도 오너에게 정상 렌더되고,
 * 제출 시점에야 이 UPDATE가 거부된다. `transferCrewOwnership`이 이미 쓰던 것과 같은 패턴
 * (`err("forbidden", ...)`)으로 맞춘다 — 호출자 `updateCrewInfoAction`은 이미 `!result.ok`를
 * 범용으로 처리하므로(`strings.crew.settings.info.errors.failed`) 이 파일 밖은 손대지
 * 않아도 된다.
 */
export async function updateCrewInfo(
  id: Id,
  patch: UpdateCrewInfoInput,
): Promise<DataResult<Crew>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crews")
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.colorKey !== undefined ? { color_key: patch.colorKey } : {}),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    // crews_update_staff_or_owner RLS·crews_guard_archived_immutable(I-066) 트리거가 여기서
    // 거부될 수 있다 — D-030 ③에 따라 예외를 던지지 않고 도메인 오류로 표현한다(I-070).
    return err("forbidden", error.message);
  }
  if (!data) return err("not_found", `crew ${id} 를 찾을 수 없다.`);
  return ok(toCrew(data));
}

/**
 * 크루 공개 범위 변경(FR-012, D-007). RLS는 임원 이상까지 UPDATE를 허용하지만
 * `crews_guard_owner_only_fields` 트리거가 `visibility`·`status`·`owner_id` 변경을 오너로
 * 다시 좁힌다 — 호출자(Server Action)가 이미 `crew:update_visibility`(오너 전용) 권한을
 * 확인했다는 전제이며, 이 트리거는 그 판정이 이미 실패했어야 할 상황의 2차 방어선이다.
 *
 * **I-070 해소(20일차, CORE)** — `updateCrewInfo`와 같은 이유로 `throw` 대신 `err("forbidden")`
 * 을 반환한다(`crews_guard_archived_immutable` 트리거 포함). 호출자 `updateCrewVisibilityAction`
 * 도 이미 `!result.ok`를 범용으로 처리하므로 변경이 필요 없다.
 */
export async function updateCrewVisibility(
  id: Id,
  visibility: CrewVisibility,
): Promise<DataResult<Crew>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crews")
    .update({ visibility })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    return err("forbidden", error.message);
  }
  if (!data) return err("not_found", `crew ${id} 를 찾을 수 없다.`);
  return ok(toCrew(data));
}

/**
 * 임원 임명·해임(FR-024) — role만 바꾼다. `crew_memberships_guard_self_transition`(§029B)이
 * "오너만 임명/해임 가능·대상은 active 멤버·role은 staff/member만"을 이미 강제한다 — 호출자
 * (`set-crew-member-role.ts`)가 대상 상태(E1·E2)를 먼저 확인했다는 전제다.
 *
 * **I-124 해소(26일차)** — 호출자의 사전 확인은 이중화일 뿐 강제 경계가 아니다. 직접 REST로
 * 우회하면(실측: staff 본인 JWT로 자기 자신의 role을 바꾸려 시도) 트리거가 `raise exception`을
 * 던지고, 예전엔 `throw error`가 그대로 전파돼 `setCrewMemberRoleAction`까지 raw exception이
 * 올라갔다 — `transferCrewOwnership`이 이미 쓰는 패턴(`err("forbidden", …)`)으로 맞춘다.
 */
export async function setCrewMembershipRole(
  crewId: Id,
  profileId: Id,
  role: Extract<CrewMembershipRole, "staff" | "member">,
): Promise<DataResult<CrewMembership>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crew_memberships")
    .update({ role })
    .eq("crew_id", crewId)
    .eq("profile_id", profileId)
    .select("*")
    .maybeSingle();
  if (error) {
    // crew_memberships_guard_self_transition이 여기서 거부될 수 있다(FR-024 AC2 "오너만
    // 임명·해임 가능" 등) — D-030 ③에 따라 예외를 던지지 않고 도메인 오류로 표현한다.
    return err("forbidden", error.message);
  }
  if (!data) return err("not_found", `crew ${crewId} 의 멤버십(${profileId})을 찾을 수 없다.`);
  return ok(toCrewMembership(data));
}

/**
 * 오너 이양(FR-025, D-002). `crews.owner_id`를 바꾸는 단일 UPDATE 하나가 곧 트랜잭션 경계다
 * (운영 규칙 2 — 여러 PostgREST 호출로 나누지 않는다). 부수효과(구오너→staff 강등, 신오너→owner
 * 승격)는 `trg_crews_sync_membership_on_owner_transfer`(029A)가 같은 문장 안에서 처리한다.
 *
 * **대상이 활성 크루원이어야 한다(FR-025 E1)는 SQL이 강제한다** — Task 040이 확장한
 * `crews_guard_owner_only_fields` 트리거가 `new.owner_id`를 검증하므로, 이 함수는 대상을
 * 미리 조회하지 않는다(호출자 `transfer-crew-ownership.ts`가 UX용으로 먼저 확인하지만, 그건
 * 이중화된 안내일 뿐 강제 경계가 아니다 — SQL 우회 시에도 이 트리거가 막는다).
 */
export async function transferCrewOwnership(id: Id, newOwnerId: Id): Promise<DataResult<Crew>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crews")
    .update({ owner_id: newOwnerId })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    // crews_guard_owner_only_fields(FR-025 E1 포함)·crews_update_staff_or_owner RLS가
    // 여기서 거부될 수 있다 — D-030 ③에 따라 예외를 던지지 않고 도메인 오류로 표현한다.
    return err("forbidden", error.message);
  }
  if (!data) return err("not_found", `crew ${id} 를 찾을 수 없다.`);
  return ok(toCrew(data));
}

/**
 * 크루 해산(FR-013). `public.disband_crew` SECURITY DEFINER RPC(Task 040) 하나로 크루
 * `archived` 전이 + 진행 중 투표 전부 `cancelled` + 미래 Meetup 전부 `cancelled` + 채팅 로그
 * 즉시 파기(D-009 후반)를 원자화한다(운영 규칙 2 — I-054 재발 방지). 인가(오너 본인·크루명
 * 재입력 확인)도 함수 내부에서 재구현되어 있어(SECURITY DEFINER가 RLS를 우회하므로) 실패는
 * 예외가 아니라 함수 자신의 `ok:false`+`reason`으로 돌아온다 — `respond_meetup_attendance`
 * (`meetup.ts`)와 같은 패턴이다. `error`(진짜 예외 — 네트워크·grant 문제 등)는 그대로 던진다.
 */
export type DisbandCrewReason = "forbidden" | "not_found" | "already_disbanded" | "name_mismatch";

export interface DisbandCrewResult {
  cancelledPolls: number;
  cancelledMeetups: number;
  purgedMessages: number;
}

export async function disbandCrew(
  id: Id,
  confirmName: string,
): Promise<DataResult<DisbandCrewResult>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("disband_crew", { p_crew_id: id, p_confirm_name: confirmName })
    .single();
  if (error) throw error;
  if (!data.ok) {
    const reason = (data.reason ?? "forbidden") as DisbandCrewReason;
    const code: DataErrorCode =
      reason === "not_found"
        ? "not_found"
        : reason === "already_disbanded"
          ? "conflict"
          : reason === "name_mismatch"
            ? "validation_failed"
            : "forbidden";
    return err(code, reason);
  }
  return ok({
    cancelledPolls: data.cancelled_polls,
    cancelledMeetups: data.cancelled_meetups,
    purgedMessages: data.purged_messages,
  });
}

/**
 * 크루 탈퇴(FR-026, 본인)·강퇴(FR-027, v0.2, 오너/임원)를 함께 받는다 — 둘 다 같은 상태 전이
 * (`crew_memberships_guard_self_transition`이 `active→left`는 본인, `active→removed`는
 * 오너/임원 자격을 각각 검사한다). 조건부 UPDATE(`.eq("status","active")`)로 이미 탈퇴·강퇴된
 * 행에 중복 적용하지 않는다.
 *
 * **I-124 해소(26일차)** — `leaveCrewAction`은 오너를 `hasOwnerSuccessorOrDisband: false`로
 * 항상 앱 레이어에서 막지만, 그건 이중화일 뿐이다. 직접 REST로 우회하면(실측: 오너 본인 JWT로
 * 자기 자신을 `active→left`로 전환 시도) `crew_memberships_guard_self_transition`이 "오너는
 * 이양·해산 없이 탈퇴할 수 없다(FR-026 E1)"를 던지고, 예전엔 `throw error`가 그대로 전파됐다 —
 * `transferCrewOwnership`과 같은 패턴(`err("forbidden", …)`)으로 맞춘다. 조건부 UPDATE 자체가
 * 만드는 "이미 비활성"(0행) 케이스는 종전대로 `err("conflict", …)`다.
 */
export async function updateCrewMembershipStatus(
  crewId: Id,
  profileId: Id,
  status: Extract<CrewMembership["status"], "left" | "removed">,
  removedReason: string | null = null,
): Promise<DataResult<CrewMembership>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crew_memberships")
    .update({ status, removed_reason: status === "removed" ? removedReason : null })
    .eq("crew_id", crewId)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) {
    // crew_memberships_guard_self_transition이 여기서 거부될 수 있다(FR-026 E1 "오너는 이양·
    // 해산 없이 탈퇴 불가", FR-027 E1 "임원은 일반 크루원만 강퇴 가능" 등) — D-030 ③에 따라
    // 예외를 던지지 않고 도메인 오류로 표현한다.
    return err("forbidden", error.message);
  }
  if (!data) {
    return err("conflict", `crew ${crewId} 의 멤버십(${profileId})은 활성 상태가 아니다.`);
  }
  return ok(toCrewMembership(data));
}
