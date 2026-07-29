import { resolveBoardViewer } from "@/components/board/resolve-board-viewer";
import type { PollBallotViewer, PollViewModel } from "@/components/poll/poll-view-models";
import { PollLiveContainer } from "@/components/poll/PollLiveContainer";
import { PollPanel } from "@/components/poll/PollPanel";
import { isAuthenticated } from "@/components/shell/auth-session";
import {
  getCrewMembership,
  getMeetupByPollId,
  getPollByPostId,
  getPollTally,
  getPostById,
  listEligibleVotersWithCurrentStatus,
  listVotes,
} from "@/lib/data";
import { checkPermission } from "@/lib/rules/permission";
import { countQuorumEligibleVoters } from "@/lib/rules/poll-eligibility";
import { shouldShowDetailedTally } from "@/lib/rules/poll-tally-visibility";
import { getPollRemainingMs, isPollAwaitingClosure } from "@/lib/rules/poll-timezone";
import { computeQuorum, countVotedForQuorum } from "@/lib/rules/quorum";
import type { Id } from "@/lib/types";

export interface PollPanelContainerProps {
  crewId: Id;
  postId: Id;
}

/**
 * Mock 조회 컨테이너(D-030 ①) — Task 019. `PostDetailContainer`(Task 018A)와 나란히
 * `/crews/[crewId]/board/[postId]` 페이지에 얹힌다(FR-031 AC1 "투표 UI가 본문 아래에 함께
 * 렌더된다"). 일반 게시글이거나 아직 투표가 없으면(`getPollByPostId`가 `null`) 아무것도
 * 그리지 않는다 — 페이지는 이 컨테이너를 조건 없이 호출하고, "투표가 있는가"의 판단은
 * 여기 한 곳에 둔다.
 *
 * **크루원 게이트를 다시 하지 않는다** — 이 라우트는 이미 `(app)/crews/[crewId]/layout.tsx`
 * (D-039) 트리 안에 있어 여기 도달했다는 것 자체가 활성 크루원임을 보장한다(`MeetupDetailContainer`
 * 가 트리 밖이라 게이트를 다시 하는 것과 다른 자리). 그래도 `poll:vote`·`poll:close_early`
 * **세분 권한**(role 매트릭스)과 "이 투표의 대상자 스냅샷에 있는가"는 이 컨테이너가 판정한다
 * (CONVENTIONS.md D-030 ④ — role 세분은 컨테이너 몫으로 남는다).
 *
 * **단, 미인증(guest) 자체는 이 컨테이너가 직접 막는다(I-115류 재발 방지, 25일차)** — Next.js가
 * 레이아웃과 페이지를 병렬 렌더하므로(`AdminReportsContainer` I-115와 같은 구조) 위 레이아웃
 * 게이트가 아직 리다이렉트를 확정하지 않은 병렬 브랜치에서도 이 컨테이너는 독립적으로 실행돼
 * `getPollTally`(→ `poll_vote_tally` RPC, `authenticated` 전용 EXECUTE)를 호출할 수 있다.
 * 그래서 `resolveBoardViewer` 직후 `Promise.all` **앞에서** `isAuthenticated(session)`을 먼저
 * 확인해 조기 반환한다(CORE의 I-095 패턴 그대로, `AdminReportsContainer`와 동일 모양). 실제
 * 게스트 접근으로 `42501`이 재현되지는 않았지만(CORE 25일차 실측, 원인 미확정) 구조가
 * 완전히 같아 재현 여부와 무관하게 선제 수정했다 — I-106→I-107→I-114처럼 "진입점을 안 막고
 * 완결 지점만 막는" 결함이 같은 팀에서 반복되는 것을 막기 위해서다.
 *
 * **판정은 전부 `lib/rules`를 호출만 한다(NFR-036, R-015)**: 정족수(`computeQuorum`)·정족수
 * 분모(`countQuorumEligibleVoters`)·집계 공개 범위(`shouldShowDetailedTally`)·"결과 집계 중"
 * 여부(`isPollAwaitingClosure`)·남은 시간(`getPollRemainingMs`) 전부 Task 009A의 순수 함수
 * 그대로다. 이 파일이 하는 일은 조회(`lib/data`)와 그 결과를 함수 인자로 넘기는 조립뿐이다.
 */
export async function PollPanelContainer({ crewId, postId }: PollPanelContainerProps) {
  const poll = await getPollByPostId(postId);
  if (!poll) {
    return null;
  }

  const { session, role } = await resolveBoardViewer(crewId);
  if (!isAuthenticated(session)) {
    // (app)/crews/[crewId] 레이아웃 게이트가 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기
    // 브랜치다(I-095·I-115와 같은 구조 — CORE 25일차 `*Container.tsx` 전수 스윕에서 발견,
    // 게스트로 재현은 안 됐지만 구조가 동일해 선제 수정한다, 팀장 지시). 이 조기 반환이 없으면
    // 아래 `Promise.all`의 `getPollTally`(→ `poll_vote_tally` RPC, `authenticated` 전용
    // EXECUTE)가 레이아웃의 리다이렉트보다 먼저 실행될 수 있다 — `AdminReportsContainer`
    // (I-115)와 정확히 같은 패턴.
    return null;
  }
  const membership = await getCrewMembership(crewId, session.profileId);

  const [post, voters, votes, meetup, tally] = await Promise.all([
    getPostById(poll.postId),
    listEligibleVotersWithCurrentStatus(poll.id),
    listVotes(poll.id),
    getMeetupByPollId(poll.id),
    getPollTally(poll.id),
  ]);

  const nowIso = new Date().toISOString();
  const eligibleVoterCount = countQuorumEligibleVoters(voters);
  const quorum = computeQuorum({
    eligibleVoterCount,
    votedCount: countVotedForQuorum(tally),
  });
  const isAwaitingClosure = isPollAwaitingClosure(poll.status, poll.closesAt, nowIso);

  // FR-041 AC4 — 대상자 판정. "크루원 이상"(role 매트릭스)과 "이 투표의 스냅샷에 있는가"는
  // 서로 다른 조건이라 순서대로 확인한다 — `not_crew_member`는 D-039 게이트가 이미 이 라우트를
  // 막아 실제로는 거의 오지 않는 방어적 분기다(`poll-view-models.ts` 참고).
  const votePermission = checkPermission({ role, action: "poll:vote" });
  const isActiveMember = membership?.status === "active";
  const isInSnapshot =
    session.status === "authenticated" && voters.some((voter) => voter.profileId === session.profileId);
  const canVote = votePermission.allowed && isActiveMember && isInSnapshot;
  const ineligibleReason: PollBallotViewer["ineligibleReason"] = canVote
    ? null
    : !votePermission.allowed || !isActiveMember
      ? "not_crew_member"
      : "not_in_snapshot";
  const myChoice =
    session.status === "authenticated"
      ? (votes.find((vote) => vote.voterId === session.profileId)?.choice ?? null)
      : null;

  const isProposalAuthor = session.status === "authenticated" && post?.authorId === session.profileId;
  const canCloseEarly = checkPermission({
    role,
    action: "poll:close_early",
    context: { isProposalAuthor },
  }).allowed;

  const viewModel: PollViewModel = {
    id: poll.id,
    postId: poll.postId,
    status: poll.status,
    outcome: poll.result,
    closesAt: poll.closesAt,
    decidedAt: poll.decidedAt,
    isAwaitingClosure,
    eligibleVoterCount,
    quorumRequired: quorum.required,
    quorumMet: quorum.met,
    votedCount: quorum.actual,
    tally,
    showDetailedTally: shouldShowDetailedTally(eligibleVoterCount, poll.status),
    remainingMs: getPollRemainingMs(poll.closesAt, nowIso),
    meetupId: meetup?.id ?? null,
    viewer: { canVote, ineligibleReason, myChoice },
    canCloseEarly,
    // FR-046 AC1(Task 044) — `poll:close_early`와 대상이 완전히 같은 판정이라(제안자 본인 또는
    // 임원 이상) 다시 판정하지 않고 그대로 재사용한다(NFR-036).
    canWithdraw: canCloseEarly,
  };

  // 실시간 갱신(FR-042 AC2, Task 033)은 진행 중(open) 투표에서만 의미가 있다 — 종료된 투표는
  // 더 이상 집계가 바뀌지 않으므로 굳이 채널을 열지 않는다(연결당 채널 100 한도, R-019).
  if (poll.status !== "open") {
    return <PollPanel crewId={crewId} poll={viewModel} />;
  }

  return (
    <PollLiveContainer crewId={crewId} pollId={poll.id}>
      <PollPanel crewId={crewId} poll={viewModel} />
    </PollLiveContainer>
  );
}
