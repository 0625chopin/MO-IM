import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getPollTally`·`getPollTallyForDecision` 데이터 레이어 매핑 회귀 테스트(I-121 확장, 25일차,
 * 사용자 결정 → D-074 승격 예정).
 *
 * **왜 이 파일이 필요한가**: D-052/D-072(24일차)가 도입한 vitest는 `src/lib/rules/**` 순수
 * 함수 3개 모듈만 덮는다. I-119(24일차, "참여 N명"이 D-031 숨김 상태에서 항상 0으로 보이던
 * 결함)의 실제 진원지는 그 순수 함수(`quorum.ts`의 `countVotedForQuorum`)가 아니라 **이
 * 파일의 `getPollTally`**였다 — RPC(`poll_vote_tally`)의 `participant_count`를 읽지 않고
 * `for_count+against_count+abstain_count`로 재계산해 버렸던 매핑 버그였다. `quorum.test.ts`는
 * `countVotedForQuorum`이 받은 `tally`를 그대로 돌려주는지만 고정하므로, `getPollTally`가
 * 다시 이 버그로 되돌아가도 `npm test`는 27/27(24일차 기준) 그대로 통과했다(I-121 실측).
 * 이 파일이 그 구멍을 메운다 — "Supabase 응답(snake_case RPC row) → 도메인 타입(camelCase
 * `PollTally`)" 매핑 지점 자체를 고정한다.
 *
 * **① 스키마 확인(실측, 상상 아님)** — 2026-07-29(25일차), `mcp__supabase__execute_sql`로 프로젝트
 * `damruradpliktkrlkakl`(MO-IM)의 `pg_proc`을 직접 조회해 두 RPC의 실제 반환 타입을 확인했다:
 *
 * ```sql
 * select p.proname, pg_get_function_result(p.oid) as return_type
 * from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 * where p.proname in ('poll_vote_tally', 'poll_vote_tally_for_decision');
 * -- both: TABLE(poll_id uuid, poll_status text, eligible_count integer, participant_count
 * --   integer, for_count integer, against_count integer, abstain_count integer,
 * --   tally_hidden boolean)
 * ```
 *
 * 이 결과는 `supabase/migrations/20260725015801_rls_move_definer_logic_to_private_wrappers.sql`
 * (10~81행, `private.poll_vote_tally`/`public.poll_vote_tally` 정의)과 정확히 일치하고 그
 * 뒤로 재정의된 마이그레이션이 없음을 `grep`으로 확인했다.
 *
 * **② 실행값 대조(2026-07-29, 25일차, 팀장 지시 — "스키마만 실측, 값은 미실측"이었던 ①의
 * 한계를 닫는다)**: 조회 시점 `status='open'`인 poll이 0건이라 ①에서는 RPC를 직접 실행해
 * 반환 행을 받지 못했다 — **해결 가능한 조건이라 실제로 만들어서 실행했다.** 임시 크루원
 * 조합 2세트로 poll을 2개 띄우고 실 계정 2개(`chopin0625@gmail.com`=owner/staff,
 * `0625chopin@gmail.com`=member)의 JWT(`/auth/v1/token?grant_type=password`)로 REST
 * `POST /rest/v1/rpc/{fn}`을 직접 호출해 5가지 경로를 대조했다:
 *
 * ```
 * A) poll_vote_tally           / eligible=2,open,1표 / caller=member(비작성자,비staff)
 *    → {..., participant_count:1, for_count:null, against_count:null, abstain_count:null, tally_hidden:true}
 * B) poll_vote_tally_for_decision / 위와 동일 poll / caller=member(비작성자,비staff, 미종료 트리거)
 *    → A와 완전히 동일한 값 — "decision 미준비면 poll_vote_tally에 그대로 위임"이 실측대로 성립
 * C) poll_vote_tally_for_decision / 위와 동일 poll / caller=owner
 *    → {..., participant_count:1, for_count:1, against_count:0, abstain_count:0, tally_hidden:false}
 *    — staff/owner는 종료 트리거 없이도 실 집계를 본다(SQL 주석이 문서화한 트레이드오프,
 *      실측으로 재확인)
 * D) poll_vote_tally            / eligible=5,open,2표(for 1·against 1) / caller=member(작성자)
 *    → {..., participant_count:2, for_count:1, against_count:1, abstain_count:0, tally_hidden:false}
 *    — **`status='open'`이어도 eligible_count>=5면 숨기지 않는다**(D-031 임계값이 실제로
 *      "5명 미만"이지 "진행 중이면 무조건"이 아님을 실측으로 확인 — I-119가 정확히 이 경계에서
 *      났었다)
 * E) poll_vote_tally_for_decision / D와 동일 poll / caller=작성자 본인
 *    → D와 완전히 동일한 값(작성자 조건으로 decision_ready=true, 그러나 애초에 숨김 대상이
 *      아니라 poll_vote_tally와 결과가 같다)
 * ```
 *
 * **대조 결과: 아래 픽스처의 필드명·타입·널 처리·`tally_hidden` 의미 전부 일치, 수정 없음.**
 * 특히 "숨김 상태에서도 `participant_count`는 항상 실값"(A·B)과 "`eligible_count>=5`면 열려
 * 있어도 숨기지 않는다"(D)는 이 테스트의 핵심 회귀 방지 케이스인데 둘 다 실제 RPC 응답으로
 * 확인됐다. 임시 크루원·post·poll·투표는 검증 직후 전부 DELETE로 원복(잔여 0건 재확인,
 * Task036 테스트 크루는 사용하지 않음).
 *
 * **자기반증(팀장 지시)**: `getPollTally`를 I-119 이전 구현(`participant_count`를 버리고
 * `for_count+against_count+abstain_count`로 재계산)으로 임시로 되돌려 `npx vitest run
 * src/lib/data/supabase/poll.test.ts`를 실행하면 아래 "I-119 회귀 방지" 케이스가 정확히
 * `expected 4 to be 0`(또는 그 반대) 형태로 FAIL하는 것을 확인한 뒤 원상복구했다 — 결과는
 * 팀 보고에 남긴다.
 */

// `vi.mock` 팩토리는 `vi.hoisted`로 만든 값만 참조할 수 있다(Vitest가 이 호출 자체를 파일
// 최상단으로 끌어올리기 때문 — 일반 `const`는 그 시점에 아직 초기화되지 않았다).
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/data/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc: rpcMock }),
}));

const { getPollTally, getPollTallyForDecision } = await import("./poll");

/** 위에서 확인한 실제 RPC row 형태(snake_case) — 필드를 임의로 지어내지 않고 그 조회 결과의
 *  컬럼명·타입을 그대로 옮긴다. */
interface PollVoteTallyRow {
  poll_id: string;
  poll_status: string;
  eligible_count: number;
  participant_count: number;
  for_count: number | null;
  against_count: number | null;
  abstain_count: number | null;
  tally_hidden: boolean;
}

function rpcRow(overrides: Partial<PollVoteTallyRow> = {}): PollVoteTallyRow {
  return {
    poll_id: "poll-1",
    poll_status: "open",
    eligible_count: 6,
    participant_count: 3,
    for_count: 2,
    against_count: 1,
    abstain_count: 0,
    tally_hidden: false,
    ...overrides,
  };
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("getPollTally", () => {
  it("공개 상태 — 네 필드를 전부 실값 그대로 옮긴다", async () => {
    rpcMock.mockResolvedValue({ data: [rpcRow()], error: null });

    const result = await getPollTally("poll-1");

    expect(rpcMock).toHaveBeenCalledWith("poll_vote_tally", { p_poll_id: "poll-1" });
    expect(result).toEqual({ participantCount: 3, forCount: 2, againstCount: 1, abstainCount: 0 });
  });

  /**
   * I-119 회귀 방지(24일차 결함의 정확한 재현 조건) — D-031 숨김(대상자 5명 미만 + `open`)이면
   * RPC는 `for_count`·`against_count`·`abstain_count`를 `null`로, `participant_count`는
   * 숨김과 무관하게 실값으로 돌려준다. 옛 결함은 이 상태에서 `participant_count`를 무시하고
   * 세 필드(이미 null→0으로 매핑된)의 합으로 참여자 수를 재계산해 "참여 N명"이 항상 0으로
   * 보였다 — 여기서는 `participantCount`가 `for+against+abstain`(=0)이 아니라 RPC가 돌려준
   * 실값(4)과 같은지를 고정한다.
   */
  it("D-031 숨김 상태 — participantCount는 RPC의 participant_count를 그대로 쓴다(I-119 회귀 방지)", async () => {
    rpcMock.mockResolvedValue({
      data: [
        rpcRow({
          poll_status: "open",
          eligible_count: 3,
          participant_count: 4,
          for_count: null,
          against_count: null,
          abstain_count: null,
          tally_hidden: true,
        }),
      ],
      error: null,
    });

    const result = await getPollTally("poll-hidden");

    expect(result.participantCount).toBe(4);
    // 옛 결함(재계산)이었다면 0(null→0 세 필드의 합)이 나왔을 자리 — 명시적으로 다름을 고정.
    expect(result.participantCount).not.toBe(result.forCount + result.againstCount + result.abstainCount);
    expect(result).toEqual({ participantCount: 4, forCount: 0, againstCount: 0, abstainCount: 0 });
  });

  it("data가 빈 배열이면(poll_id가 존재하지 않는 등) 전부 0인 기본값을 반환한다", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const result = await getPollTally("poll-missing");

    expect(result).toEqual({ participantCount: 0, forCount: 0, againstCount: 0, abstainCount: 0 });
  });

  it("RPC가 error를 반환하면 그대로 던진다(DataResult로 감싸지 않는다 — 모듈 계약)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("connection reset") });

    await expect(getPollTally("poll-1")).rejects.toThrow("connection reset");
  });
});

describe("getPollTallyForDecision", () => {
  it("tally_hidden=false — 네 필드를 실값 그대로 옮긴다(판정 전용 경로)", async () => {
    rpcMock.mockResolvedValue({
      data: [rpcRow({ eligible_count: 2, participant_count: 2, for_count: 1, against_count: 1, abstain_count: 0, tally_hidden: false })],
      error: null,
    });

    const result = await getPollTallyForDecision("poll-1");

    expect(rpcMock).toHaveBeenCalledWith("poll_vote_tally_for_decision", { p_poll_id: "poll-1" });
    expect(result).toEqual({ participantCount: 2, forCount: 1, againstCount: 1, abstainCount: 0 });
  });

  it("tally_hidden=true면 예외를 던진다 — 불변식 위반(정상 흐름에서 도달 불가)", async () => {
    rpcMock.mockResolvedValue({
      data: [rpcRow({ tally_hidden: true, for_count: null, against_count: null, abstain_count: null })],
      error: null,
    });

    await expect(getPollTallyForDecision("poll-1")).rejects.toThrow(/tally_hidden=true/);
  });

  it("data가 빈 배열이면 예외를 던진다(decideAndClosePoll은 항상 존재하는 poll에만 호출된다)", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await expect(getPollTallyForDecision("poll-missing")).rejects.toThrow(/빈 결과/);
  });
});
