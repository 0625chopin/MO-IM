"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewMembership, getPollById, getPostById } from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { isPollExpired } from "@/lib/rules/poll-timezone";
import { strings } from "@/lib/strings";
import type { Id, Poll } from "@/lib/types";

import { decideAndClosePoll } from "./poll-auto-close";

export interface ClosePollEarlyActionInput {
  crewId: Id;
  pollId: Id;
}

/**
 * 투표 조기 종료(FR-043 AC3) Server Action — D-003 종료 트리거②. 제안자·임원·오너만 가능
 * (`poll:close_early`, 각주⁵ "제안 작성자 본인만"은 일반 크루원에 한해 조건부로 적용된다 —
 * `lib/rules/permission.ts` 참고). `PollEarlyCloseControl`(Dialog 확인 후 호출)의 유일한
 * 호출부다.
 */
export async function closePollEarlyAction(
  input: ClosePollEarlyActionInput,
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
    return err("forbidden", strings.vote.earlyClose.forbidden);
  }

  if (poll.status !== "open") {
    // 도메인 오류 "이미 종료됨" — `/sample`이 이 지점을 등록한다(D-030 ③).
    return err("conflict", strings.vote.earlyClose.alreadyClosed);
  }

  const result = await decideAndClosePoll(input.pollId, session.profileId);
  if (result.ok) {
    refresh();
  }
  return result;
}

export interface SimulateScheduledPollClosureInput {
  pollId: Id;
}

/**
 * D-003 종료 트리거①(기한 도래 자동 종료)의 **수동 발화 시뮬레이터** — QA 전용.
 *
 * **Task 034(20일차)부터 실제 트리거①은 이 함수가 아니라 pg_cron 잡
 * `poll_auto_close_and_finalize`(5분 주기, SQL 네이티브 — `docs/decisions/poll-pipeline-034.md`)
 * 가 처리한다.** 그 잡은 이 함수와 달리 TS `decideAndClosePoll`을 호출하지 않는다 —
 * pg_cron은 순수 SQL만 실행할 수 있어(PRD-validation.md) 판정 공식을 SQL로 미러링한
 * `public.run_poll_auto_close_job`이 자체적으로 종료·판정하고, Meetup 생성(FR-060)·알림
 * 적재(FR-045)는 `polls` AFTER UPDATE 트리거(`finalize_closed_poll`)가 담당한다 — 이 트리거는
 * 트리거②③(아래·`cast-vote.ts`, 여전히 `decideAndClosePoll` 경유)의 UPDATE에도 똑같이
 * 걸린다.
 *
 * 이 함수는 **걷어내지 않고 QA 단축 경로로 남겼다** — 5분 주기를 기다리지 않고 개발 중
 * 즉시 트리거①의 배선(판정→종료→Meetup→알림)을 확인하려는 목적이다. 실제 사용자 화면
 * (`PollPanel`) 어디에서도 이 함수를 호출하지 않는다 — 사용자는 트리거①을 버튼으로
 * 발화시킬 수 없고(트리거②만 사람이 누르는 버튼이다), `isPollAwaitingClosure`(D-024)가 그
 * 사이 창을 "결과 집계 중"으로 표시만 할 뿐이다. `/sample`의 `PollAutoCloseSimulatorPreview`가
 * 유일한 호출부다.
 */
export async function simulateScheduledPollClosureAction(
  input: SimulateScheduledPollClosureInput,
): Promise<DataResult<Poll>> {
  const poll = await getPollById(input.pollId);
  if (!poll) {
    return err("not_found", `poll ${input.pollId} 를 찾을 수 없다.`);
  }
  if (poll.status !== "open") {
    return err("conflict", strings.vote.earlyClose.alreadyClosed);
  }
  const nowIso = new Date().toISOString();
  if (!isPollExpired(poll.closesAt, nowIso)) {
    return err("validation_failed", "아직 마감 시각이 지나지 않았다 — 트리거①은 마감 후에만 발화한다.");
  }

  const result = await decideAndClosePoll(input.pollId, null);
  if (result.ok) {
    refresh();
  }
  return result;
}
