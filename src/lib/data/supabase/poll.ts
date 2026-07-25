import "server-only";

import type {
  Id,
  Poll,
  PollEligibleVoter,
  PollTally,
  PollVote,
  SnapshotVoterStatus,
} from "@/lib/types";

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
 * 대상자 스냅샷 × 현재 크루 멤버십 상태 조인. poll → post → board → crew 경로로 crewId를 찾은
 * 뒤(3단계 순차 조회 — Supabase embedded select 대신, `listCrewsByProfile`과 같은 이유로
 * 단순한 형태를 택했다) 그 크루의 `crew_memberships`와 조인한다. 스냅샷에 이름이 남은 사람은
 * 반드시 그 크루의 멤버십 행이 있어야 한다(Mock docstring과 동일 전제) — 못 찾으면 데이터
 * 정합성이 깨진 것이므로 `DataResult`가 아니라 예외로 알린다.
 */
export async function listEligibleVotersWithCurrentStatus(
  pollId: Id,
): Promise<SnapshotVoterStatus[]> {
  const supabase = await createSupabaseServerClient();

  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("post_id")
    .eq("id", pollId)
    .maybeSingle();
  if (pollError) throw pollError;
  if (!poll) return [];

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("board_id")
    .eq("id", poll.post_id)
    .maybeSingle();
  if (postError) throw postError;
  if (!post) return [];

  const { data: board, error: boardError } = await supabase
    .from("boards")
    .select("crew_id")
    .eq("id", post.board_id)
    .maybeSingle();
  if (boardError) throw boardError;
  if (!board) return [];

  const { data: voters, error: votersError } = await supabase
    .from("poll_eligible_voters")
    .select("profile_id")
    .eq("poll_id", pollId);
  if (votersError) throw votersError;
  if (!voters || voters.length === 0) return [];

  const voterIds = voters.map((v) => v.profile_id);
  const { data: memberships, error: membershipError } = await supabase
    .from("crew_memberships")
    .select("profile_id, status")
    .eq("crew_id", board.crew_id)
    .in("profile_id", voterIds);
  if (membershipError) throw membershipError;

  const statusByProfileId = new Map((memberships ?? []).map((m) => [m.profile_id, m.status]));
  return voters.map((voter) => {
    const status = statusByProfileId.get(voter.profile_id);
    if (!status) {
      throw new Error(
        `crew ${board.crew_id} 의 멤버십(${voter.profile_id})을 찾을 수 없다 — poll ${pollId} 스냅샷과 불일치.`,
      );
    }
    return {
      profileId: voter.profile_id,
      currentMembershipStatus: status as SnapshotVoterStatus["currentMembershipStatus"],
    };
  });
}

export async function listVotes(pollId: Id): Promise<PollVote[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("poll_votes").select("*").eq("poll_id", pollId);
  if (error) throw error;
  return (data ?? []).map(toPollVote);
}

/** 무효화되지 않은 표의 선택지별 집계(FR-042) — `poll_vote_tally` RPC 경유(모듈 docstring 참고). */
export async function getPollTally(pollId: Id): Promise<PollTally> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("poll_vote_tally", { p_poll_id: pollId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) {
    return { forCount: 0, againstCount: 0, abstainCount: 0 };
  }
  return {
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
    forCount: row.for_count ?? 0,
    againstCount: row.against_count ?? 0,
    abstainCount: row.abstain_count ?? 0,
  };
}
