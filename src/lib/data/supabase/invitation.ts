import "server-only";

import type { Id, Invitation, InvitationStatus } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { toInvitation } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * Invitation 실데이터 구현 (Task 031 읽기 + Task 032 쓰기, FR-020 초대 발급·FR-021 수락·거절).
 *
 * **crew_memberships 동기화는 이 레이어가 하지 않는다** — `trg_invitations_provision_membership`
 * (AFTER INSERT)이 초대 발급 시 `invited` 멤버십을, `trg_invitations_sync_membership_on_response`
 * (AFTER UPDATE)이 수락/거절 시 `active`/`declined` 전이를 **자동으로** 처리한다
 * (`rls-policies-029a.md` §5 표). Mock은 이 동기화를 `lib/actions/`가 별도 함수
 * (`initiateCrewMembership`·`acceptCrewInvitationMembership`·`declineCrewInvitationMembership`)
 * 로 명시 호출했지만, 실 DB에서는 그 함수들을 호출하면 트리거가 이미 끝낸 전이를 다시
 * 시도하다 상태 불일치로 막힌다 — Server Action(`invite-crew-member.ts`·
 * `respond-to-invitation.ts`)에서 그 호출을 제거했다.
 */

export async function getInvitationById(id: Id): Promise<Invitation | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toInvitation(data) : null;
}

/**
 * **D-073 (I-030)**: 초대 만료는 상태 전이가 아니라 **조회 필터링**으로 다룬다.
 * `invitations.status`는 만료돼도 절대 `'pending'`에서 스스로 바뀌지 않는다(배치·트리거
 * 없음 — 24일차 실측). 그래서 `"pending"` 조회에서는 `expires_at > now()` 조건을 얹어 이미
 * 지난 초대를 결과에서 뺀다 — "받은 초대함"이 몇 달 지난 초대를 방금 온 것과 구분 없이
 * 영원히 보여주던 문제(I-030 §4)가 여기서 없어진다.
 *
 * 이 필터를 `status === "pending"`일 때만 적용하는 이유: 이미 응답이 끝난 상태
 * (`accepted`/`declined`)를 조회할 때까지 `expires_at`으로 걸러내면, 정상적으로 수락된
 * 과거 이력(초대 당시엔 유효했고 실제로 수락까지 됐지만 지금 시각 기준으로는 `expiresAt`이
 * 지난 행)이 조회에서 사라져 이력을 왜곡한다 — "지금 응답 가능한가"만 만료가 좌우해야
 * 하고, "과거에 무슨 일이 있었는가"는 만료와 무관해야 한다. `status` 미지정(전체 조회) 시에도
 * 같은 이유로 필터를 걸지 않는다 — 현재 호출부는 `"pending"` 하나뿐이라(`InvitationInboxContainer`)
 * 실질적인 차이는 없지만, 의미를 명확히 남겨 둔다.
 *
 * **D-073 확장(32일차, BOARD 실측 발견 → CREW 수정, 팀장 회귀 지적 후 재수정)**: archived
 * 크루로 가는 pending 초대도 같은 방식(조회 필터링)으로 거른다. `disband_crew`는
 * `invitations`를 정리하지 않는다(32일차 결정, `docs/DECISIONS.draft.CREW.md` "해산=동결" —
 * 데이터는 그대로 둔다) — 그런데 그 "동결"이 조회 계층까지 새지 않아
 * `/invitations`(`InvitationInboxContainer`)가 archived 크루의 죽은 초대를 완전히 살아있는
 * 것처럼(활성화된 수락/거절 버튼 포함) 그려서 사용자에게 거짓을 보여주고 있었다(BOARD가
 * 실계정으로 재현). 데이터 층(동결)과 표시 층(필터링)을 분리한 것이 만료와 정확히 같은
 * 모양이라 새 패턴을 만들지 않고 이 자리에 조건 하나만 더한다. **거르는 쪽을 택했다**(비활성
 * 카드로 보여주는 대신) — 이유 셋: ① 만료(D-073)가 이미 "거른다"를 택했으므로 같은
 * 자리·같은 판단축(자기소개함이 지금 응답 가능한 것만 보여준다)에서 다른 결론을 내면 화면이
 * 두 가지 규칙을 섞어 쓰게 된다. ② 만료된 초대도 사용자에게 "왜 사라졌는지" 알려주지 않고
 * 조용히 빠지는 것이 기존 동작이라, archived만 유독 사유를 설명하려면 그 자체가 새 UX
 * 패턴이 된다. ③ 걸러내면 "거절 버튼이 죽은 초대에 계속 남아 있어야 하는가"(I-147이 지킨
 * 원칙 — 거절은 항상 가능해야 한다) 질문이 애초에 발생하지 않는다 — 카드 자체가 안 뜨므로.
 *
 * **1차 구현(회귀, 폐기)**: 이 함수 안에서 초대 조회 → `crews` 2단계 조회로 archived를
 * 걸렀다(`listCrewsByProfile`이 임베드 조인 대신 2단계 조회를 쓰는 관례를 재사용한
 * 것이었다). **팀장이 실데이터로 잡아냈다** — 그 2단계가 **초대받은 사람의 세션으로**
 * `crews`를 직접 select했는데, `crews_select_authenticated` RLS는
 * `visibility='public' OR owner_id=auth.uid() OR (활성 멤버)`만 허용한다. 초대받은 사람은
 * 아직 `crew_memberships.status='invited'`(active 아님)이므로 **private 크루는 무조건
 * 0행**이 되어 `activeCrewIds`가 비었고, 결과적으로 **활성 private 크루의 멀쩡한 pending
 * 초대까지 전부 지워졌다** — 원래 결함(죽은 초대가 살아 보임)보다 나쁜 회귀(살아있는 초대가
 * 안 보임)였다. `listCrewsByProfile`의 관례는 "필터 대상 테이블에 이미 SELECT 권한이 있는"
 * 경우에만 성립하는데, 여기서는 애초에 그 권한이 없다는 게 문제의 본질이라 같은 관례를
 * 그대로 옮겨 쓸 수 없었다.
 *
 * **2차 구현(현재, 회귀 수정)**: `private.is_crew_active(uuid)`(31일차, CREW가 세 마이그레이션
 * 에서 이미 재사용한 그 함수)를 재사용하는 SECURITY DEFINER RPC
 * `list_pending_invitations_for_self`(`public.*` INVOKER 얇은 래퍼 + `private.*` DEFINER 실제
 * 로직, 029B 2단 구조 — disband_crew·crew_directory_summary와 동일 패턴)로 이 판정을
 * RLS 밖에서 한다. 매개변수를 받지 않고 내부에서 `auth.uid()`만 쓴다 — 호출자가 다른 사람의
 * id를 넣어 조회 범위를 넓힐 방법 자체가 없다. `crews_select_authenticated`를 초대받은
 * 사람에게까지 여는 방향(RLS 확장)은 택하지 않았다 — 비소속 사용자에게 private 크루 행
 * 전체를 여는 권한 확대이고, 이 프로젝트에서 권한 확대가 반복해서 사고를 낸 축이다(I-102·
 * I-107). 상세 근거는 마이그레이션
 * `supabase/migrations/20260730092707_list_pending_invitations_for_self_32.sql` 참고.
 *
 * `status !== "pending"`(또는 미지정) 경로는 이 RPC를 쓰지 않는다 — `invitations_select_
 * participant_or_staff` RLS가 `invitee_id = auth.uid()`를 이미 무조건 허용해서(크루
 * 멤버십과 무관) 원래도 RLS 문제가 없었다. **주의**: 이 RPC는 `auth.uid()`로만 스코프되므로
 * `inviteeId` 인자는 `status === "pending"` 경로에서 사실상 무시된다 — 유일한 호출부
 * (`InvitationInboxContainer`)가 항상 `session.profileId`(= 호출자 자신의 `auth.uid()`)로만
 * 부르므로 지금은 무해하지만, 방어적으로 반환 행을 `inviteeId`와 대조해 한 번 더 좁힌다(다른
 * 사람의 id로 잘못 불렸을 때 엉뚱한 사람의 데이터를 "정상"인 것처럼 반환하지 않도록).
 */
export async function listInvitationsForProfile(
  inviteeId: Id,
  status?: InvitationStatus,
): Promise<Invitation[]> {
  const supabase = await createSupabaseServerClient();

  if (status === "pending") {
    const { data, error } = await supabase.rpc("list_pending_invitations_for_self");
    if (error) throw error;
    return (data ?? []).map(toInvitation).filter((i) => i.inviteeId === inviteeId);
  }

  let query = supabase.from("invitations").select("*").eq("invitee_id", inviteeId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toInvitation);
}

export async function listInvitationsForCrew(
  crewId: Id,
  status?: InvitationStatus,
): Promise<Invitation[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("invitations").select("*").eq("crew_id", crewId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toInvitation);
}

export interface CreateInvitationInput {
  crewId: Id;
  inviteeId: Id;
  inviterId: Id;
  /** ISO 8601. 호출자가 "발급 후 14일"(요구사항 2.2절 용어집) 계산 결과를 넘긴다. */
  expiresAt: string;
}

/**
 * 초대 발급(FR-020). `invitations_insert_staff_or_owner` RLS가 오너·임원만 허용한다.
 *
 * **Task 042A(FR-081 AC2) — 반환 타입이 `Invitation`에서 `DataResult<Invitation>`으로
 * 바뀌었다.** 그 정책의 `WITH CHECK`에 `not private.is_blocked(invitee_id, inviter_id)`가
 * 추가돼(대상자가 초대자를 차단했으면 초대 INSERT 자체가 거부됨, `report-block-rpcs-042a.sql`
 * 참고), 이 경로가 이제 "권한 있는 오너·임원이 정당하게 호출했는데도 RLS가 거부하는" 상황을
 * 만든다 — 예전에는 이 함수에 도달했다는 것 자체가 성공을 뜻했지만 더는 아니다. RLS 42501을
 * 예외로 던지면 `inviteCrewMemberAction`이 처리하지 못한 채 그대로 터진다(D-030 ③ 위반) —
 * 그래서 `forbidden`으로 감싸 값으로 반환한다. **이유를 구분하지 않는다** — "차단됐다"는
 * 사실이 노출되면 requirements.md FR-020 정상 흐름 E3("사유는 노출하지 않음")를 어기므로,
 * 다른 이유의 42501(예: 호출자가 실제로는 임원이 아닌 경쟁 상태)과 같은 일반 메시지로
 * 뭉뚱그린다 — 호출부는 이미 `checkPermission`으로 권한을 먼저 확인하므로 정상 경로에서
 * 이 42501은 사실상 차단 케이스만 남는다.
 */
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<DataResult<Invitation>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      crew_id: input.crewId,
      invitee_id: input.inviteeId,
      inviter_id: input.inviterId,
      expires_at: input.expiresAt,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "42501") {
      return err("forbidden", "이 사용자를 초대할 수 없다(RLS 거부).");
    }
    throw error;
  }
  return ok(toInvitation(data));
}

/**
 * 초대 수락·거절(FR-021). 조건부 UPDATE(`.eq("status","pending")`)로 이미 응답했거나 만료된
 * 초대는 conflict — 동시에 두 번 응답하는 경쟁도 이 조건으로 막힌다(D-019와 같은 원리).
 *
 * **DESIGN 교차검증 발견(25일차) 해소** — `trg_invitations_guard_response_transition`
 * (BEFORE UPDATE, I-091)이 `old.expires_at <= now()`를 **DB 시각 기준**으로 독립 강제한다.
 * Server Action(`respond-to-invitation.ts`)은 UPDATE 전에 `evaluateInvitationResponseEligibility`
 * 로 **앱(JS) 시각** 기준 만료를 먼저 걸러내므로 정상 경로에서는 이 트리거에 도달하지
 * 않지만, 앱-DB 클럭 편차나 만료 경계와 정확히 겹치는 좁은 레이스에서는 JS 사전 검사를
 * 통과한 뒤에도 이 UPDATE 시점엔 DB `now()`가 이미 만료를 넘겨 트리거가 `P0001` 예외를
 * 던질 수 있다. 예전엔 `if (error) throw error`라 이 예외가 처리되지 않은 채
 * `respondToInvitationAction`까지 그대로 올라갔다 — `updateCrewInfo`/`updateCrewVisibility`
 * (I-070)와 같은 패턴으로 `err("conflict", ...)`로 감싼다. 호출자는 이미 `!result.ok`를
 * `strings.invitation.inbox.errors.failed`로 범용 처리하므로(I-070과 동일한 이유) 이
 * 파일 밖은 손대지 않아도 된다.
 */
export async function respondToInvitation(
  id: Id,
  response: Extract<InvitationStatus, "accepted" | "declined">,
): Promise<DataResult<Invitation>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitations")
    .update({ status: response })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) return err("conflict", error.message);
  if (!data) return err("conflict", `invitation ${id} 는 이미 처리됐거나 존재하지 않는다.`);
  return ok(toInvitation(data));
}
