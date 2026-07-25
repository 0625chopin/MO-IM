"use server";

import { refresh } from "next/cache";

import { todayIsoUtc } from "@/components/calendar/date-grid";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import {
  cancelMeetup,
  createNotification,
  getCrewMembership,
  getMeetupById,
  getPollById,
  getPostById,
  listCrewMembers,
} from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { deriveUserRoleForPermissionCheck, isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { isMeetupAttendanceOpen } from "@/lib/rules/meetup-attendance-eligibility";
import { checkPermission } from "@/lib/rules/permission";
import type { Id, Meetup } from "@/lib/types";

export interface CancelMeetupActionInput {
  crewId: Id;
  meetupId: Id;
}

/**
 * Meetup 취소(FR-065 AC1·AC3) Server Action. `meetup:cancel_or_update` 권한 매트릭스 행 —
 * 임원·오너는 항상, 일반 크루원은 각주⁵(제안 작성자 본인만) 조건부다(`lib/rules/permission.ts`).
 *
 * **"일정 변경"(AC2)도 이 액션 하나를 재사용한다** — `docs/decisions/community-expansion-041.md`
 * §3이 정리한 대로, D-003 확정("가결된 Meetup의 날짜 변경은 재투표를 요구한다")이 있어 날짜
 * 필드를 직접 고치는 액션을 따로 만들지 않는다. `MeetupLifecycleActions`(표현 컴포넌트)가
 * "취소"·"일정 변경(재투표)" 두 버튼을 보여주지만 서버에서 실행되는 동작은 동일한 취소이고,
 * 다만 감사 로그의 `action` 값을 호출부가 `intent`로 골라 구분한다 — "일정 변경" 클릭은 취소
 * 직후 클라이언트가 글쓰기 화면(`getBoardWriteHref`)으로 안내한다(별도 재투표 트리거 로직은
 * 없다 — 새 모임 제안글 작성 자체가 이미 FR-034·FR-040의 기존 파이프라인이다).
 */
export interface CancelMeetupActionOptions {
  /** 감사 로그·알림 문구 구분용. 실제 DB 변경은 두 값이 동일하다. */
  intent?: "cancel" | "reschedule";
}

export async function cancelMeetupAction(
  input: CancelMeetupActionInput,
  options: CancelMeetupActionOptions = {},
): Promise<DataResult<Meetup>> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return err("forbidden", "로그인 후 이용할 수 있다.");
  }

  const meetup = await getMeetupById(input.meetupId);
  if (!meetup || meetup.crewId !== input.crewId) {
    return err("not_found", `Meetup ${input.meetupId} 를 찾을 수 없다.`);
  }

  const membership = await getCrewMembership(input.crewId, session.profileId);
  if (!membership || !isActiveMembership(membership.status)) {
    return err("forbidden", "이 크루의 크루원만 취소할 수 있다.");
  }

  const poll = await getPollById(meetup.pollId);
  const post = poll ? await getPostById(poll.postId) : null;
  const isProposalAuthor = post?.authorId === session.profileId;

  const permission = checkPermission({
    role: deriveUserRoleForPermissionCheck(membership),
    action: "meetup:cancel_or_update",
    context: { isProposalAuthor },
  });
  if (!permission.allowed) {
    return err("forbidden", "이 모임을 취소할 권한이 없다 — 임원·오너 또는 제안자 본인만 가능하다.");
  }

  // AC3 — 과거 Meetup은 취소·변경 시도 자체를 거부한다. `isMeetupAttendanceOpen`은 원래
  // FR-066 사전조건("확정 상태 + 예정일 미경과")을 위해 만든 판정이지만, FR-065 AC3가 요구하는
  // 조건과 문자 그대로 같아 재사용한다(NFR-036 — 같은 판정을 다시 쓰지 않는다).
  if (!isMeetupAttendanceOpen(meetup, todayIsoUtc(new Date()))) {
    return err("conflict", "이미 취소됐거나 예정일이 지난 모임이다.");
  }

  const result = await cancelMeetup(input.meetupId);
  if (!result.ok) {
    return result;
  }

  // NFR-015 감사 로그 — 본인 여부와 무관하게 항상 기록한다(`audit-log.ts`의 `meetup.cancelled`
  // 값 docstring 참고 — Meetup 취소는 이미 캘린더에 확정 노출된 일정을 뒤집는 행위라 흔한
  // CRUD로 보지 않는다).
  await recordAuditLog({
    actorId: session.profileId,
    crewId: input.crewId,
    action: "meetup.cancelled",
    targetId: input.meetupId,
  });

  // FR-065 AC1 "크루원에게 알림이 간다". 취소한 본인에게는 보내지 않는다(다른 알림 발송부와
  // 같은 관례, `create-comment.ts` docstring 참고).
  const members = (await listCrewMembers(input.crewId)).filter(
    (m) => isActiveMembership(m.status) && m.profileId !== session.profileId,
  );
  await Promise.all(
    members.map((member) =>
      createNotification({
        recipientId: member.profileId,
        type: "meetup_cancelled",
        channel: "in_app",
        payload: { crewId: input.crewId, meetupId: input.meetupId, intent: options.intent ?? "cancel" },
      }).catch((error) => console.error("[cancel-meetup] 크루원 알림 실패", member.profileId, error)),
    ),
  );

  refresh();
  return result;
}
