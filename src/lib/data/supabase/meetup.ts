import "server-only";

import type { AttendanceJoinResult, AttendanceStatus, Id, Meetup, MeetupAttendance } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { toMeetup, toMeetupAttendance } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * Meetup·MeetupAttendance 실데이터 구현 (Task 031 읽기 + Task 032 쓰기, FR-060~061·063~064·
 * 066~068).
 *
 * **정원 원자성(D-019)**: `respondAttendance`는 `public.respond_meetup_attendance` RPC를
 * 호출한다 — PostgREST는 UPDATE 본문에 산술 표현식(`attending_count + 1`)을 실을 수 없어
 * "읽기→조건부 UPDATE→attendance upsert" 세 문장을 앱 레이어에서 왕복하면 그 사이 경쟁
 * 조건이 생긴다. RPC는 이 전부를 단일 트랜잭션(함수 호출 자체)으로 묶어 D-019가 요구하는
 * 조건부 UPDATE(`attending_count = attending_count + 1 where … and attending_count <
 * capacity`)를 그대로 수행한다 — `security invoker`라 RLS(`meetups_update_members_scoped_by_
 * trigger`)와 `meetups_guard_attendee_scope` 트리거가 그대로 적용되며, "RLS로 정원을 강제하지
 * 않는다"(D-019)는 유지된다 — 정원 판정은 이 함수 본문의 WHERE 절만 담당한다. 동시성 실측:
 * `docs/decisions/write-path-realdata-032.md` 참고.
 */

/**
 * **I-073 해소(21일차, D-048) — 비소속자 404→403 폴백.** `meetups_select_members` RLS
 * (`crew_id IN (내 활성 멤버십 crew_id 목록)`)가 비소속자에게 원본 select를 0행으로 돌려줘,
 * 이 함수 하나만으로는 "meetup이 없음"과 "meetup은 있지만 크루원이 아니라 못 봄"을 구분할 수
 * 없었다 — `MeetupDetailContainer`가 `if (!meetup) notFound()`를 먼저 실행해 FR-064 AC2가
 * 요구하는 403(이 앱에서는 D-040에 따라 `<RouteErrorBoundary kind="forbidden"/>` 값 반환,
 * HTTP 200)이 아니라 진짜 404("페이지를 찾을 수 없어요")로 응답됐다.
 *
 * `getCrewById`(D-007, 17일차 핫픽스)와 같은 "원본 0행 → private 최소정보 RPC 폴백" 패턴을
 * 그대로 적용한다 — 다만 크루와 달리 Meetup에는 독자적 공개 범위가 없어(D-048, 크루의
 * public/private 2단계와 다름) 폴백이 주는 정보는 `crewId` **하나뿐**이다. 그 값으로 호출자
 * — `MeetupDetailContainer`·`respondMeetupAttendanceAction`·`cancelMeetupAction`
 * (`src/lib/actions/cancel-meetup.ts:54~62`, Task 041·D-051. **정정(21일차, DESIGN
 * 교차검증)** — 원래 이 문단은 소비자를 "둘"로 적었으나 실제로는 셋이다, 이번 회차에
 * 새로 생긴 이 소비자를 놓쳤었다)가 이미 하던 크루원 재판정
 * (`getCrewMembership` + `isActiveMembership`)을 그대로 수행해 정확한 forbidden 분기에
 * 도달하게 하는 것이 유일한 목적이다 — `title`·`date`·`place` 등 실제 콘텐츠는 이 경로로
 * 노출되지 않는다(아래 플레이스홀더는 신뢰 가능한 값이 아니다. 표시용으로 쓰지 말 것 —
 * 셋 다 실콘텐츠 사용보다 이 크루원 재판정이 먼저 오므로 정상적으로는 도달하기 전에
 * 반환한다 — DESIGN이 21일차에 세 소비자 전부를 확인해 누출 경로가 구조적으로 없음을
 * 재확인했다).
 *
 * `meetup_directory_summary` RPC는 `authenticated`에게만 EXECUTE가 있다(`anon` 배제 —
 * 크루와 달리 Meetup은 게스트 노출 시나리오 자체가 없다). 실측(비소속·강퇴·소속·존재하지
 * 않는 meetup·anon 5개 시나리오, `begin`…`rollback`)은 21일차 결정 문서(D-048) 참고.
 */
export async function getMeetupById(id: Id): Promise<Meetup | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("meetups").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (data) return toMeetup(data);

  const { data: summaryRows, error: summaryError } = await supabase.rpc(
    "meetup_directory_summary",
    { p_meetup_id: id },
  );
  if (summaryError) throw summaryError;
  const summary = summaryRows?.[0];
  if (!summary) return null;

  return {
    id: summary.id,
    crewId: summary.crew_id,
    pollId: "",
    title: "",
    description: null,
    date: "",
    startTime: null,
    place: null,
    capacity: null,
    attendingCount: 0,
    status: "confirmed",
    createdAt: "",
  };
}

export async function getMeetupByPollId(pollId: Id): Promise<Meetup | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetups")
    .select("*")
    .eq("poll_id", pollId)
    .maybeSingle();
  if (error) throw error;
  return data ? toMeetup(data) : null;
}

export interface ListMeetupsQuery {
  crewIds: Id[];
  from: string;
  to: string;
  includeCancelled?: boolean;
}

/** 캘린더 월간 뷰 + 크루 필터(FR-061). 기본은 취소된 Meetup을 제외한다. */
export async function listMeetupsByCrews(opts: ListMeetupsQuery): Promise<Meetup[]> {
  if (opts.crewIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("meetups")
    .select("*")
    .in("crew_id", opts.crewIds)
    .gte("date", opts.from)
    .lte("date", opts.to);
  if (!opts.includeCancelled) query = query.eq("status", "confirmed");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toMeetup);
}

/** 참석자 목록 조회(FR-068). */
export async function listAttendance(meetupId: Id): Promise<MeetupAttendance[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetup_attendances")
    .select("*")
    .eq("meetup_id", meetupId);
  if (error) throw error;
  return (data ?? []).map(toMeetupAttendance);
}

export interface CreateMeetupFromPollInput {
  crewId: Id;
  pollId: Id;
  title: string;
  description?: string | null;
  date: string;
  startTime?: string | null;
  place?: string | null;
  capacity?: number | null;
}

/**
 * 가결 Meetup 자동 등록(FR-060). `meetups_insert_proposal_author_or_staff` RLS가 제안자
 * 본인 또는 임원 이상만 허용한다 — 호출자(Server Action, 종료 트리거 문맥)가 이미 그 역할로
 * 실행 중이라는 전제(Mock과 동일하게 이 함수는 가결 여부를 재판정하지 않는다).
 *
 * **Task 034(20일차)부터 실제 프로덕션 경로는 이 함수가 아니다** — Meetup 생성은
 * `public.finalize_closed_poll`(DB AFTER UPDATE 트리거, SECURITY DEFINER, RLS 우회)이
 * 담당한다(`docs/decisions/poll-pipeline-034.md`). 이 TS 함수는 현재 아무도 호출하지
 * 않는다(grep 확인) — RLS를 우회하지 않는 별도 호출부가 필요해지면(예: 관리자 수동 보정
 * 도구) 그때 다시 쓰일 수 있어 남겨 뒀다.
 */
export async function createMeetupFromPoll(input: CreateMeetupFromPollInput): Promise<Meetup> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetups")
    .insert({
      crew_id: input.crewId,
      poll_id: input.pollId,
      title: input.title,
      description: input.description ?? null,
      date: input.date,
      start_time: input.startTime ?? null,
      place: input.place ?? null,
      capacity: input.capacity ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toMeetup(data);
}

export interface RespondAttendanceInput {
  meetupId: Id;
  profileId: Id;
  status: AttendanceStatus;
}

/**
 * 참석/불참 응답(FR-066) + 취소 시 자리 반환(FR-067). Mock 시그니처의 `profileId`는
 * 실데이터에서 쓰지 않는다 — `listCrews`의 `viewerProfileId`와 같은 이유로 RPC가 내부에서
 * `auth.uid()`를 쓴다(호출자가 실제 로그인 사용자와 다른 값을 넘겨도 결과는 세션 기준으로만
 * 나온다, `read-path-realdata-031.md` §6 선례). 정원 원자성은 `respond_meetup_attendance`
 * RPC(D-019, 이 파일 상단 docstring) 몫이다.
 *
 * **Task 032 교차검증(CORE, 18일차) major 1 수정** — RPC가 `reason`으로 `full`과 `forbidden`을
 * 구분해 반환하므로(비소속자가 호출하면 RLS가 UPDATE를 0행으로 막는 것을 "정원 마감"으로
 * 오판정하던 결함) 여기서도 `full`로 뭉뚱그리지 않고 그대로 전달한다. `not_found`(메모리상
 * 존재하지 않는 meetup, 진짜 프로그래밍 오류에 가깝다)는 `AttendanceJoinResult` 계약 밖이라
 * 예외로 던진다 — 호출자(Server Action)가 이미 `getMeetupById`로 존재를 확인했어야 한다.
 */
export async function respondAttendance(
  input: RespondAttendanceInput,
): Promise<AttendanceJoinResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("respond_meetup_attendance", { p_meetup_id: input.meetupId, p_status: input.status })
    .single();
  if (error) throw error;

  if (!data.ok) {
    if (data.reason === "full" || data.reason === "forbidden") {
      return { success: false, reason: data.reason };
    }
    throw new Error(
      `respond_meetup_attendance(${input.meetupId}) 가 예상 밖의 reason을 반환했다: ${data.reason}`,
    );
  }
  return { success: true, changed: data.changed };
}

/**
 * Meetup 취소(FR-065 AC1, Task 041). `meetups_update_members_scoped_by_trigger` RLS는
 * 소속 크루원 전원에게 UPDATE를 열어 두지만, `trg_meetups_guard_attendee_scope` 트리거가
 * `attending_count` 외 필드(이 `status` 포함) 변경을 임원·오너·제안글 작성자로 좁힌다 —
 * `meetup:cancel_or_update` 권한 매트릭스 행과 정확히 같은 제약이라(Task 032가 이미
 * 만들어 둔 트리거) 별도 RPC 없이 일반 UPDATE로 충분하다. 과거 Meetup 가드(AC3)는 호출자가
 * `isMeetupAttendanceOpen`으로 먼저 판정한다(mock 구현과 동일 원칙).
 */
export async function cancelMeetup(id: Id): Promise<DataResult<Meetup>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetups")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "confirmed")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return err("not_found", `meetup ${id} 를 찾을 수 없거나 이미 취소됐다.`);
  return ok(toMeetup(data));
}
