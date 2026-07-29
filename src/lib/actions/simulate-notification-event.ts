"use server";

import { createNotification } from "@/lib/data";
import type { Notification, NotificationType } from "@/lib/types";

/**
 * `/sample` 전용 데모 액션(Task 023) — 실제 알림 생성 파이프라인(Task 034, pg_cron)이 아직
 * 없어 "이런 유형의 알림이 오면 어떻게 보이는가"를 눈으로 확인할 자리가 필요하다(`poll.tsx`의
 * "투표 종료 트리거 시뮬레이션"과 같은 성격 — Mock인 것은 **발화 방식**뿐이고, 이 액션이
 * 호출하는 `createNotification`은 100% 프로덕션 코드다).
 *
 * 수신자는 실 프로필 UUID로 고정한다 — `CLAUDE.md` "테스트계정" `chopin0625@gmail.com`의
 * profile id(`docs/decisions/auth-integration-030.md` §6). **19일차(Task 033) 수정**: 이전에는
 * Mock 시드 id `"profile-1"`을 그대로 썼는데, `createNotification`은 이미 Task 032부터 실
 * Supabase(`notifications.recipient_id`, uuid 컬럼)에 쓰고 있어 `"profile-1"`은 `22P02 invalid
 * input syntax for type uuid`로 **항상 실패했다**(19일차 실측 확인, 이 버튼을 누르면 예외가
 * 났다는 뜻 — CORE·DESIGN 교차검증 범위 밖이라 이번에 처음 발견됐다). `/sample`은 인증 세션과
 * 무관하게 열리므로 "지금 로그인한 사용자"를 알 수 없어 특정 계정으로 고정할 수밖에 없다 —
 * 이 값과 다른 계정으로 `/sample`을 보고 있으면 알림 행은 실제로 생성되지만(DB에 남는다),
 * Realtime Authorization이 `auth.uid() = recipientId`를 요구하므로(029B §6.2) 이 미리보기
 * 세션에서는 실시간 벨·토스트가 갱신되지 않는다 — `NotificationSimulatorPreviewContainer.tsx`
 * 모듈 docstring에 같은 설명을 남겼다. payload는 `fixtures.ts` 시드에 실재하는
 * id(crew-1·crew-2·post-3·meetup-1 등)를 손으로 채워, 실제로 `notification-routing.ts`가
 * 계산하는 링크가 살아있는 경로로 이어지는지까지 함께 보인다 — 이 부분은 실 시드 데이터와
 * 일치하지 않을 수 있어(Mock 픽스처 id) 링크 자체는 참고용이다.
 */
const SAMPLE_RECIPIENT_ID = "30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a";

const SAMPLE_PAYLOAD_BY_TYPE: Record<NotificationType, Record<string, unknown>> = {
  poll_closed: { pollId: "poll-2", outcome: "passed", crewId: "crew-1", postId: "post-3" },
  join_request_received: { crewId: "crew-1", joinRequestId: "join-request-1" },
  join_request_approved: { crewId: "crew-2", joinRequestId: "join-request-1" },
  join_request_rejected: { crewId: "crew-2", joinRequestId: "join-request-1" },
  invitation_received: { crewId: "crew-2", invitationId: "invitation-1" },
  staff_appointed: { crewId: "crew-1" },
  member_removed: { crewId: "crew-2", reason: "규칙 위반" },
  meetup_created: { crewId: "crew-1", meetupId: "meetup-1" },
  meetup_cancelled: { crewId: "crew-1", meetupId: "meetup-1" },
  post_commented: { crewId: "crew-1", postId: "post-3" },
  // FR-025·FR-013(Task 040) — 오너 이양·크루 해산.
  ownership_transferred: { crewId: "crew-1", crewName: "테스트크루" },
  crew_disbanded: { crewId: "crew-2", crewName: "테스트크루" },
  // FR-046(Task 044) — 제안 철회.
  poll_withdrawn: { crewId: "crew-1", postId: "post-3" },
};

export async function simulateNotificationEventAction(type: NotificationType): Promise<Notification> {
  return createNotification({
    recipientId: SAMPLE_RECIPIENT_ID,
    type,
    channel: "in_app",
    payload: SAMPLE_PAYLOAD_BY_TYPE[type],
  });
}
