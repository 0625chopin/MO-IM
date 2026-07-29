"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import {
  createNotification,
  getCrewMembership,
  getPollById,
  getPostById,
  listEligibleVotersWithCurrentStatus,
  withdrawPoll,
} from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { Id, Poll } from "@/lib/types";

export interface WithdrawPollActionInput {
  crewId: Id;
  pollId: Id;
}

/**
 * 제안 철회(FR-046 AC1·AC3) Server Action — `PollWithdrawControl`(Dialog 확인 후 호출)의 유일한
 * 호출부. 권한 판정은 `poll:close_early`를 그대로 재사용한다 — 3.3절 각주⁵("제안 작성자 본인만")가
 * 요구하는 대상(제안자·임원·오너)이 FR-046 AC1 "제안자, 임원, 오너"와 정확히 같다(NFR-036, 새
 * 매트릭스 행을 추가하지 않는다). `polls_update_proposal_author_or_staff` RLS도 같은 대상을
 * 이미 허용한다 — Server Action이 우회돼도(REST 직접 호출) 이 권한 경계가 DB에도 있다.
 *
 * AC3("종료된 투표, 재개 시도 → 거부")는 이 함수가 먼저 `poll.status !== "open"`으로 걸러 도메인
 * 오류를 반환하고, `withdrawPoll`의 조건부 UPDATE + `polls_guard_decision_integrity` 트리거(Task
 * 044 수정)가 DB 레벨에서도 같은 조건을 강제한다(이중 방어 — 앱 레이어 우회 시 DB가 최종
 * 방어선이라는 걸 `begin…rollback` 실측으로 확인했다, `docs/decisions/remaining-c-features-044.md`
 * §2 참고).
 */
export async function withdrawPollAction(
  input: WithdrawPollActionInput,
): Promise<DataResult<Poll>> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return err("forbidden", strings.error.forbidden.description);
  }

  const poll = await getPollById(input.pollId);
  if (!poll) {
    return err("not_found", `poll ${input.pollId} 를 찾을 수 없다.`);
  }

  const post = await getPostById(poll.postId);
  const membership = await getCrewMembership(input.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const permission = checkPermission({
    role,
    action: "poll:close_early",
    context: { isProposalAuthor: post?.authorId === session.profileId },
  });
  if (!permission.allowed) {
    return err("forbidden", strings.vote.withdraw.forbidden);
  }

  if (poll.status !== "open") {
    // 도메인 오류 "이미 종료·취소됨" — `/sample`이 이 지점을 등록한다(D-030 ③).
    return err("conflict", strings.vote.withdraw.alreadyClosed);
  }

  const result = await withdrawPoll(input.pollId);
  if (!result.ok) {
    return result;
  }

  await recordAuditLog({
    actorId: session.profileId,
    crewId: input.crewId,
    action: "poll.withdrawn",
    targetId: input.pollId,
  });

  // FR-046 AC1 "대상자에게 알림이 간다" — FR-045(poll_closed)와 같은 대상자 정의(D-015, 강퇴자
  // 제외)를 쓴다. 철회한 본인에게는 보내지 않는다(다른 알림 발송부와 같은 관례,
  // `cancel-meetup.ts` docstring 참고).
  const voters = await listEligibleVotersWithCurrentStatus(input.pollId);
  const recipients = voters.filter(
    (voter) =>
      voter.currentMembershipStatus !== "removed" && voter.profileId !== session.profileId,
  );
  await Promise.all(
    recipients.map((voter) =>
      createNotification({
        recipientId: voter.profileId,
        type: "poll_withdrawn",
        channel: "in_app",
        payload: { crewId: input.crewId, postId: poll.postId, pollId: input.pollId },
      }).catch((error) => console.error("[withdraw-poll] 대상자 알림 실패", voter.profileId, error)),
    ),
  );

  refresh();
  return result;
}
