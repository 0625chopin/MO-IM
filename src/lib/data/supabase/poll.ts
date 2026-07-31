import "server-only";

import type {
  EligibleVoterProgress,
  Id,
  Poll,
  PollEligibleVoter,
  PollOutcome,
  PollTally,
  PollVote,
  SnapshotVoterStatus,
  VoteChoice,
} from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { toPoll, toPollEligibleVoter, toPollVote } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * Poll·PollEligibleVoter·PollVote 읽기 전용 실데이터 구현 (Task 031, FR-040~045).
 * Mock(`../mock/poll.ts`)과 동일한 시그니처(NFR-035). 쓰기(`createPoll`·`castVote`·`closePoll`)는
 * Task 032 몫 — 배럴이 `../mock/poll`에서 그대로 재노출한다.
 *
 * **`getPollTally`만은 원본 테이블(`poll_votes`)을 직접 집계하지 않는다** — README.md 인계
 * 사항 1번대로 `public.poll_vote_tally` RPC(029B)를 경유한다. `poll_votes`는 본인+임원 이상만
 * 개별 행을 볼 수 있어(D-003 "개인 선택 비공개") 크루원 전체가 봐야 하는 집계(D-003 "집계는
 * 공개")를 원본 테이블 SELECT로는 만들 수 없다. RPC가 D-031(대상자 5명 미만이면 진행 중 집계
 * 숨김)까지 함께 강제한다 — 숨김 상태에서 for/against/abstain은 RPC가 `null`을 반환하는데
 * `PollTally`는 숫자만 허용하므로 0으로 매핑한다. **이 0은 "표가 0개"가 아니라 "숨겨서 모른다"는
 * 뜻이다** — 화면은 이 값을 직접 쓰지 않고 `shouldShowDetailedTally`(lib/rules, 같은 임계값 5)로
 * 노출 여부를 별도 판정하므로 실제로 노출되지는 않는다.
 *
 * **⚠️ 계산 결함은 실재, 오늘 관측 가능한 피해는 없음 — 둘 다 사실이다(17일차, 팀장 확정).**
 * `lib/actions/poll-auto-close.ts`의 `decideAndClosePoll`은 **이미 존재하고 이미 이 함수를
 * 호출한다**(`cast-vote.ts`·`close-poll.ts`가 프로덕션 경로에서 부른다) — 미래에 생길 코드가
 * 아니다. poll이 `open`인 상태에서 호출되므로 D-031 숨김 조건(대상자 5명 미만 + `open`)이
 * 그대로 걸리고, 이 함수가 그 상태에서 반환하는 0(원래 null)이 그대로
 * `computeQuorum`·`decidePollOutcome`에 들어가 **매 호출** 정족수·판정을 실제 표와 무관하게
 * 계산한다 — 계산 결함 자체는 조건부가 아니라 항상 일어난다. 다만 그 결과는 `closePoll`/
 * `castVote`(여전히 Mock 쓰기)가 Supabase의 실 UUID를 Mock 스토어에서 못 찾아 저장 단계에서
 * 우연히 폐기된다 — **설계된 안전장치가 아니라 Task 031이 읽기만 옮긴 과도기의 부수효과**라,
 * Task 032가 poll 쓰기를 옮기면 사라지고 이 계산 결함이 그대로 사용자에게 보이는 오판정이
 * 된다. 표시용 집계(D-031, "숨긴다")와 서버측 판정용 집계(참값 필요)를 이 함수 하나로
 * 겸용한 것이 근본 원인 — 수정은 숨김 없는 판정 전용 RPC/함수가 필요해 마이그레이션과
 * `lib/actions/poll-auto-close.ts` 수정을 요구하므로 이 데이터 레이어(`src/lib/data/**`)
 * 밖이었다. 담당 배정(팀장): 신규 RPC는 CORE, 이 파일에 `getPollTallyForDecision` 추가는
 * DESIGN, `poll-auto-close.ts` 교체는 BOARD — **셋 다 완료했다**(17일차). 아래
 * `getPollTallyForDecision`이 그 결과이고, `poll-auto-close.ts`는 이미 그 함수를 쓰도록
 * 교체됐다(BOARD, 확인됨). 상세는 `docs/decisions/read-path-realdata-031.md` §5 참고.
 */

export async function getPollByPostId(postId: Id): Promise<Poll | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("post_id", postId)
    .maybeSingle();
  if (error) throw error;
  return data ? toPoll(data) : null;
}

export async function getPollById(id: Id): Promise<Poll | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("polls").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toPoll(data) : null;
}

export async function listEligibleVoters(pollId: Id): Promise<PollEligibleVoter[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("poll_eligible_voters")
    .select("*")
    .eq("poll_id", pollId);
  if (error) throw error;
  return (data ?? []).map(toPollEligibleVoter);
}

/**
 * 대상자 스냅샷 × 현재 크루 멤버십 상태 조인 — `poll_eligible_voters_with_status` RPC 경유
 * (34일차, I-089 후속).
 *
 * **원래 원본 테이블 3단 순차 조회(`polls`→`posts`→`boards`→`poll_eligible_voters`→
 * `crew_memberships`)였는데, `poll_eligible_voters_select_self_or_staff` RLS(본인 OR
 * staff/owner)에 걸려 일반 멤버(member) 세션에서는 자기 자신 1행만 반환하는 결함이
 * 있었다** — `PollPanelContainer`의 "대상자 수"·"정족수" 표시가 role별로 조용히 틀렸고,
 * `cast-vote.ts`(트리거③)·`poll-auto-close.ts`(`decideAndClosePoll`)·`withdraw-poll.ts`
 * (철회 알림 수신자) 전부 이 함수를 통해 같은 결함을 물려받았다. RPC(`private.
 * poll_eligible_voters_with_status`, `20260730145738_poll_eligible_voters_with_status_
 * rpc_i089.sql`)는 `is_active_crew_member`만 확인해 role과 무관하게 항상 전체 스냅샷을
 * 반환한다 — `notified_at`/`notify_attempts`(D-025가 지키려는 발송 부기 컬럼)는 반환 목록에
 * 없어 그 결정을 위반하지 않는다(반환하는 `profile_id` 집합도 이미 role 무관 공개인
 * `crew_memberships` 로스터의 부분집합이라 새 노출이 아니다). 실측(role-시뮬레이션 SQL,
 * 근거: `docs/design/poll-display-verification-34/README.md`): member 시점 1→4, staff
 * 시점 5→5(회귀 없음).
 *
 * 스냅샷에 이름이 남은 사람은 반드시 그 크루의 멤버십 행이 있어야 한다(D-003 불변식) — RPC
 * 내부는 LEFT JOIN으로 먼저 결손 여부를 확인해 있으면 `raise exception`(poll_id·profile_id
 * 포함)으로 멈추고, 없으면 원래의 INNER JOIN 결과를 그대로 반환한다(34일차 3차 마이그레이션
 * `20260730151125_poll_i089_rpcs_fix_silent_inner_join.sql`). **최초 버전(위 두 마이그레이션)은
 * INNER JOIN뿐이라 멤버십 행을 못 찾으면 그 행이 조용히 빠지는 결함이 있었는데, 이 마이그레이션이
 * 그것을 해소했다** — 지금 배포된 정의는 조용한 축소가 아니라 예외로 멈춘다. 이 불변식이
 * 실제로 깨지는 사례는 아직 없었고(스냅샷 생성 후 멤버십 행 자체는 삭제되지 않는다, 상태만
 * 바뀐다) 깨지면 이제 "전체 개수가 스냅샷 개수보다 작다"가 아니라 예외로 즉시 드러난다.
 */
export async function listEligibleVotersWithCurrentStatus(
  pollId: Id,
): Promise<SnapshotVoterStatus[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("poll_eligible_voters_with_status", {
    p_poll_id: pollId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    profileId: row.profile_id,
    currentMembershipStatus: row.current_membership_status as SnapshotVoterStatus["currentMembershipStatus"],
  }));
}

/**
 * 종료 트리거③(D-022 "미투표자 0명") 전용 — 신원 없는 익명 진행 상황(34일차, I-089 후속).
 *
 * `cast-vote.ts`가 투표 직후 이 값을 `countRemainingVoters`(`lib/rules/poll-eligibility.ts`)에
 * 넘겨 미투표자 수를 판정한다. `listEligibleVotersWithCurrentStatus`처럼 신원을 반환하지
 * **않는다** — `poll_votes`(개인 선택, D-003)를 내부에서 조인해 "투표했는가"만 표시하는데,
 * 신원까지 함께 반환하면 `poll_vote_tally`(찬반기권 집계, 이미 크루원 전체 공개)와 결합해
 * 소규모 poll(D-031 특례가 있을 만큼 흔한 사용 경로)에서 상대의 선택이 역산되는 재식별
 * 벡터가 된다(팀장 지적, 34일차) — RPC(`private.poll_eligible_voter_progress`,
 * `20260730145758_..._rpc_i089.sql`)가 애초에 `profile_id`·`choice` 둘 다 SELECT하지
 * 않아 이 경로 자체가 없다. 판정(active AND NOT 투표함, 그 개수)은 여전히
 * `countRemainingVoters` 순수 함수가 한다(NFR-036) — 이 함수는 "이 대상자가 투표했는가"라는
 * 사실 하나를 붙여 줄 뿐이다.
 */
export async function listEligibleVoterProgress(pollId: Id): Promise<EligibleVoterProgress[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("poll_eligible_voter_progress", {
    p_poll_id: pollId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    currentMembershipStatus: row.current_membership_status as EligibleVoterProgress["currentMembershipStatus"],
    hasVoted: row.has_voted,
  }));
}

export async function listVotes(pollId: Id): Promise<PollVote[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("poll_votes").select("*").eq("poll_id", pollId);
  if (error) throw error;
  return (data ?? []).map(toPollVote);
}

/**
 * 무효화되지 않은 표의 선택지별 집계(FR-042) — `poll_vote_tally` RPC 경유(모듈 docstring 참고).
 *
 * **`row.participant_count`를 반드시 옮긴다 — `for_count`+`against_count`+`abstain_count`로
 * 대신 계산하지 않는다(I-119, 24일차).** SQL 함수(`private.poll_vote_tally`)는 D-031
 * 숨김이 걸리면 `for_count`·`against_count`·`abstain_count`를 `null`로 반환하지만
 * `participant_count`는 숨김과 무관하게 `poll_votes`를 직접 센 정확한 값이다 — 이 함수가
 * 원래 `participant_count`를 버리고 세 필드의 합으로 참여자 수를 재계산했던 것이 결함의
 * 원인이었다(대상자 5명 미만인 모든 진행 중 투표에서 "참여 N명"이 항상 0으로 보임,
 * FR-042 AC2 미충족으로 오인돼 I-105로 잘못 등재됐던 것 — 실측으로 재분류, 근거는
 * `docs/decisions/performance-043b.md`).
 */
export async function getPollTally(pollId: Id): Promise<PollTally> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("poll_vote_tally", { p_poll_id: pollId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) {
    return { participantCount: 0, forCount: 0, againstCount: 0, abstainCount: 0 };
  }
  return {
    participantCount: row.participant_count ?? 0,
    forCount: row.for_count ?? 0,
    againstCount: row.against_count ?? 0,
    abstainCount: row.abstain_count ?? 0,
  };
}

/**
 * FR-043·044 종료 판정 전용 집계 — `lib/actions/poll-auto-close.ts`의 `decideAndClosePoll`이
 * `getPollTally` 대신 쓴다(BOARD 교체, 17일차 팀장 배정). `public.poll_vote_tally_for_decision`
 * RPC(CORE, `docs/decisions/poll-vote-tally-for-decision-hotfix.md`)를 경유한다 — D-003의
 * 종료 트리거 조건이 참일 때만 실제(숨김 없는) 집계를 반환하고, 거짓이면 `poll_vote_tally`
 * (화면 노출용)에 그대로 위임해 숨김을 포함한 동일 결과를 반환한다. 반환 타입은 팀장 지시대로
 * 기존 `getPollTally`와 **동일한 `PollTally`**로 맞췄다 — `decideAndClosePoll`이 넘기는
 * `computeQuorum`·`decidePollOutcome` 호출 방식을 전혀 바꾸지 않기 위해서다(회귀 위험 최소화).
 * `eligible_count`·`participant_count`는 쓰지 않는다 — D-022의 미투표자 정의(스냅샷 ∩ 활성)는
 * `countQuorumEligibleVoters`(`lib/rules`)의 별개 관심사이고, 여기서 대체하면 이 핫픽스가
 * 판정 로직 리팩터링으로 번진다(팀장 지시).
 *
 * **`tally_hidden === true`면 예외를 던진다(`DataResult`로 감싸지 않는다).**
 * `decideAndClosePoll`은 D-003 종료 트리거(마감 도래·조기 종료·미투표자 0명) 중 하나가 이미
 * 참인 뒤에만 호출된다 — 정상 흐름에서 `tally_hidden=true`가 나올 수 없다(RPC는 그 조건에서만
 * 숨김을 적용하도록 설계됐다). 나오면 호출 시점이 잘못됐거나 RPC 조건이 깨진 **불변식 위반**,
 * 즉 진짜 프로그래밍 오류다 — `contracts.ts`의 "예상 가능한 실패는 `DataResult`, 진짜
 * 프로그래밍 오류만 예외로 던진다" 원칙을 그대로 따른다. `DataResult`로 감싸면 호출부가 그
 * 실패를 "그럴 수도 있는 결과"로 취급해 0 집계로 조용히 판정을 계속할 여지가 남는데, 그게
 * `getPollTally`를 오용했을 때의 원래 결함 형태였다(§5) — 같은 실수를 이 함수에서 반복하지
 * 않는다.
 */
export async function getPollTallyForDecision(pollId: Id): Promise<PollTally> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("poll_vote_tally_for_decision", {
    p_poll_id: pollId,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) {
    throw new Error(
      `poll_vote_tally_for_decision(${pollId})가 빈 결과를 반환했다 — decideAndClosePoll은 항상 존재하는 poll에 대해서만 호출돼야 한다.`,
    );
  }
  if (row.tally_hidden) {
    throw new Error(
      `poll ${pollId}: 판정 전용 집계가 tally_hidden=true를 반환했다 — decideAndClosePoll은 D-003 종료 트리거 조건이 참일 때만 호출되므로 정상 흐름에서 나올 수 없는 상태다(불변식 위반, 호출 시점을 확인할 것).`,
    );
  }
  return {
    // 판정 전용 경로 — D-022 분모 재정의에 쓰지 않는다는 원 docstring 그대로다(위 §176행).
    // `participantCount`는 `PollTally` 타입이 요구하는 필드를 채우는 것뿐이고, 이 지점은
    // `tally_hidden`이 이미 걸러진 뒤라(위 예외) 항상 실값과 일치한다.
    participantCount: row.participant_count ?? 0,
    forCount: row.for_count ?? 0,
    againstCount: row.against_count ?? 0,
    abstainCount: row.abstain_count ?? 0,
  };
}

export interface CreatePollInput {
  postId: Id;
  opensAt: string;
  closesAt: string;
  /** 투표 생성 시각의 대상자 스냅샷(D-025) — 호출자가 크루원 목록에서 미리 계산해 넘긴다. */
  eligibleVoterIds: Id[];
}

/**
 * 찬반 투표 생성(FR-040) + D-025 대상자 스냅샷(`poll_eligible_voters`)을 단일 트랜잭션으로.
 *
 * **I-054 해소(28일차, CORE)** — 예전에는 `polls` INSERT와 `poll_eligible_voters` bulk INSERT가
 * 별도 PostgREST 호출(=별도 트랜잭션)이라 두 번째가 실패하면 `polls` 행만 커밋된 채 남을 수
 * 있었다. `create_poll` RPC(029B 2단 구조)가 둘을 한 트랜잭션으로 묶는다 — 대상자 중 하나라도
 * `poll_eligible_voters_guard_insert_scope` 트리거(활성 멤버·open 상태 검사)에 걸리면 poll
 * 생성 자체가 롤백된다. 이 RPC가 이제 유일한 정당 생성 경로라 `polls`·`poll_eligible_voters`의
 * client INSERT GRANT는 회수됐다(D-065 전제 변경, 마이그레이션
 * `i054_atomic_join_request_and_poll_creation_rpcs`). 자기반증 원시 로그는
 * `docs/decisions/i054-atomic-write-rpcs.md` 참고.
 *
 * 이 함수는 `DataResult`를 쓰지 않는다(원래도 안 썼다) — 호출자(`create-post.ts`)가 이미
 * `post.author_id`로 검증된 본인 글에 대해서만 호출하므로 `ok:false`는 진짜 프로그래밍 오류에
 * 가깝다. 실패하면 예외를 던진다.
 */
export async function createPoll(input: CreatePollInput): Promise<Poll> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("create_poll", {
      p_post_id: input.postId,
      p_opens_at: input.opensAt,
      p_closes_at: input.closesAt,
      p_eligible_voter_ids: input.eligibleVoterIds,
    })
    .single();
  if (error) throw error;
  if (!data.ok) {
    throw new Error(`create_poll(${input.postId})가 실패했다: ${data.reason_code}`);
  }
  return toPoll(data);
}

export interface CastVoteInput {
  pollId: Id;
  voterId: Id;
  choice: VoteChoice;
}

/**
 * 투표 참여(FR-041). 대상자 스냅샷에 없거나 종료된 투표는 사전 확인해 도메인 오류로 반환한다
 * (RLS `poll_votes_insert_eligible_self`도 같은 조건을 강제하지만, 여기서 먼저 걸러야
 * "왜 실패했는지" 구분되는 메시지를 줄 수 있다). 재투표는 upsert로 처리한다 —
 * `poll_votes_guard_immutability` 트리거가 `open` 동안만 변경을 허용한다(D-003).
 */
export async function castVote(input: CastVoteInput): Promise<DataResult<PollVote>> {
  const supabase = await createSupabaseServerClient();

  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("status")
    .eq("id", input.pollId)
    .maybeSingle();
  if (pollError) throw pollError;
  if (!poll) return err("not_found", `poll ${input.pollId} 를 찾을 수 없다.`);
  if (poll.status !== "open") {
    return err("conflict", `poll ${input.pollId} 는 이미 종료됐다.`);
  }

  const { data: eligible, error: eligibleError } = await supabase
    .from("poll_eligible_voters")
    .select("poll_id")
    .eq("poll_id", input.pollId)
    .eq("profile_id", input.voterId)
    .maybeSingle();
  if (eligibleError) throw eligibleError;
  if (!eligible) {
    return err(
      "validation_failed",
      `profile ${input.voterId} 는 poll ${input.pollId} 의 투표 대상이 아니다.`,
    );
  }

  const { data, error } = await supabase
    .from("poll_votes")
    .upsert(
      { poll_id: input.pollId, voter_id: input.voterId, choice: input.choice, voted_at: new Date().toISOString() },
      { onConflict: "poll_id,voter_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return ok(toPollVote(data));
}

export interface ClosePollInput {
  pollId: Id;
  /** 조기 종료 처리자(제안자/임원/오너). 기한 도래·트리거③ 자동 종료는 null(D-035). */
  closedBy: Id | null;
  /** `lib/rules`의 판정 순수 함수가 이미 계산한 결과. */
  outcome: PollOutcome;
}

const STATUS_BY_OUTCOME: Record<PollOutcome, "closed_passed" | "closed_rejected" | "closed_invalid"> = {
  passed: "closed_passed",
  rejected: "closed_rejected",
  invalid: "closed_invalid",
};

/**
 * 투표 종료 처리(FR-043) + 결과 저장(FR-044). 조건부 UPDATE(`.eq("status","open")`)로 중복
 * 종료를 막는다. `polls_update_proposal_author_or_staff` RLS는 제안자·임원 이상만 허용한다 —
 * 트리거③(투표 중 마지막 표를 던진 순간의 자동 종료, `closedBy: null`)은 그 표를 던진 사람이
 * 임원이 아닐 수 있어 RLS가 조용히 0행을 반환할 수 있다(`err("conflict", …)`로 표현된다) —
 * `cast-vote.ts`가 이 실패를 표 저장 성공과 분리해 처리한다(I-049).
 */
/**
 * 제안 철회(FR-046 AC1). 조건부 UPDATE(`.eq("status","open")`)로 이미 종료된 투표의 재취소
 * 시도를 막는다(AC3) — `closePoll`과 같은 패턴. `polls_guard_decision_integrity` 트리거(Task 044
 * 수정, `docs/decisions/remaining-c-features-044.md` 참고)가 `open → cancelled` 전이만 허용하고
 * 그 외(이미 `cancelled`이거나 `closed_*`인 상태에서 다시 바꾸려는 시도)는 예외를 던진다 — 이
 * 함수가 던지는 예외가 아니라 DB가 던지는 예외이므로 그대로 전파한다(`castVote`가 상태 검사를
 * 먼저 하는 것과 달리, 여기서는 트리거가 두 번째 방어선이다). `polls_update_proposal_author_or_
 * staff` RLS가 제안자·임원 이상만 허용한다(AC1 "제안자, 임원, 오너").
 */
export async function withdrawPoll(pollId: Id): Promise<DataResult<Poll>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("polls")
    .update({ status: "cancelled", result: null, decided_at: null })
    .eq("id", pollId)
    .eq("status", "open")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return err("conflict", `poll ${pollId} 는 이미 종료됐거나 취소됐다.`);
  }
  return ok(toPoll(data));
}

export async function closePoll(input: ClosePollInput): Promise<DataResult<Poll>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("polls")
    .update({
      status: STATUS_BY_OUTCOME[input.outcome],
      closed_by: input.closedBy,
      result: input.outcome,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.pollId)
    .eq("status", "open")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return err("conflict", `poll ${input.pollId} 는 이미 종료됐거나 종료 권한이 없다.`);
  }
  return ok(toPoll(data));
}
