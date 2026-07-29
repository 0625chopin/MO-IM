import { getPostDetailHref } from "@/components/board/board-links";
import { CREW_EXPLORE_HREF, getCrewHomeHref, getCrewMembersHref } from "@/components/crews/crew-links";
import { getMeetupDetailHref } from "@/components/meetup/meetup-links";
import type { Notification, NotificationType } from "@/lib/types";

/**
 * 알림 유형 → 화면 라우팅 매핑(Task 023, R-015 "판정성 로직은 순수 함수/매핑 테이블로 분리,
 * 컴포넌트 인라인 금지"). 항상 알림 `payload`에 담긴 **리소스 ID**로부터 경로를 계산한다 —
 * 경로 문자열 자체를 저장하지 않는다(R-016·FR-052, `board-links.ts`·`meetup-links.ts`와 같은
 * 원칙). `lib/rules`가 아니라 여기 두는 이유는 각 도메인의 `*-links.ts`(컴포넌트 트리 아래
 * `.ts` 모듈)를 조합해야 하는데 `lib/rules/**`는 `@/components/*` import를 금지하기 때문이다
 * (`eslint.config.mjs` zone 1) — 이 파일은 zone 6(일반 규칙)에 속해 그 제약이 없다.
 *
 * 대상 10종은 `notification.types.ts`의 `NotificationType`(FR-070 "대상 이벤트" 목록)과 정확히
 * 1:1 대응한다 — 하나라도 빠지면 `Record<NotificationType, ...>`가 컴파일 에러로 잡는다.
 *
 * - `poll_closed`(FR-045 AC4 "해당 제안글 상세로 이동") — crewId·postId 둘 다 필요해
 *   `generate-notifications.ts`가 poll → post → board 조인으로 payload에 미리 채워 둔다.
 * - `join_request_received`는 처리자(오너/임원)가 받는 알림이라 승인/반려 UI가 있는 멤버
 *   관리 화면(`getCrewMembersHref`)으로 보낸다. `join_request_approved`는 이제 막 크루원이 된
 *   신청자가 받으므로 크루 홈으로, `join_request_rejected`·`member_removed`는 그 크루에 대한
 *   접근권이 없는 상태에서 받는 알림이라(private 크루면 D-017로 더 이상 보이지도 않는다) 특정
 *   크루가 아니라 크루 탐색 일반 목록으로 보낸다.
 * - `invitation_received`는 리소스 ID가 아니라 고정 인박스 경로(`/invitations`, SC-20)다 —
 *   R-016이 우려하는 것은 **리소스 딥링크**가 로케일 세그먼트 도입으로 깨지는 것이지, 이런
 *   고정 유틸리티 라우트는 애초에 ID를 담지 않아 해당하지 않는다(`/notifications`·`/settings`와
 *   같은 부류).
 * - `staff_appointed`는 임명 사실을 확인할 곳이 크루 홈이라 판단해 그리로 보낸다(설정 화면은
 *   변경 이력이 아니라 "지금 상태"만 보여줘 임명 알림의 목적과 맞지 않는다고 봤다 — 요구사항에
 *   명시가 없어 임의로 정한 지점이므로 보고에 남긴다).
 * - `post_commented`(v0.2, Comment 의존 — 이번 회차엔 발생하지 않지만 FR-070 대상 이벤트
 *   목록에 있으므로 매핑은 지금 정의해 둔다)도 게시글 상세로 보낸다.
 */

function readResourceId(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

type NotificationRouteResolver = (payload: Record<string, unknown>) => string | null;

const NOTIFICATION_ROUTE_RESOLVERS: Record<NotificationType, NotificationRouteResolver> = {
  poll_closed: (payload) => {
    const crewId = readResourceId(payload, "crewId");
    const postId = readResourceId(payload, "postId");
    return crewId && postId ? getPostDetailHref(crewId, postId) : null;
  },
  join_request_received: (payload) => {
    const crewId = readResourceId(payload, "crewId");
    return crewId ? getCrewMembersHref(crewId) : null;
  },
  join_request_approved: (payload) => {
    const crewId = readResourceId(payload, "crewId");
    return crewId ? getCrewHomeHref(crewId) : null;
  },
  join_request_rejected: () => CREW_EXPLORE_HREF,
  invitation_received: () => "/invitations",
  staff_appointed: (payload) => {
    const crewId = readResourceId(payload, "crewId");
    return crewId ? getCrewHomeHref(crewId) : null;
  },
  member_removed: () => CREW_EXPLORE_HREF,
  meetup_created: (payload) => {
    const meetupId = readResourceId(payload, "meetupId");
    return meetupId ? getMeetupDetailHref(meetupId) : null;
  },
  meetup_cancelled: (payload) => {
    const meetupId = readResourceId(payload, "meetupId");
    return meetupId ? getMeetupDetailHref(meetupId) : null;
  },
  post_commented: (payload) => {
    const crewId = readResourceId(payload, "crewId");
    const postId = readResourceId(payload, "postId");
    return crewId && postId ? getPostDetailHref(crewId, postId) : null;
  },
  // FR-025 오너 이양(Task 040) — 결과를 확인할 곳이 크루 홈(staff_appointed와 같은 이유).
  ownership_transferred: (payload) => {
    const crewId = readResourceId(payload, "crewId");
    return crewId ? getCrewHomeHref(crewId) : null;
  },
  // FR-013 크루 해산(Task 040) — member_removed와 같은 이유(해산된 크루로는 더 이상 갈 수
  // 없다, D-030 ③) 크루 탐색 일반 목록으로 보낸다.
  crew_disbanded: () => CREW_EXPLORE_HREF,
  // FR-046 철회(Task 044) — 철회된 제안글도 여전히 열람 가능하다(cancelled 상태로 상세에
  // 남는다, `poll_closed`와 같은 이유) 게시글 상세로 보낸다.
  poll_withdrawn: (payload) => {
    const crewId = readResourceId(payload, "crewId");
    const postId = readResourceId(payload, "postId");
    return crewId && postId ? getPostDetailHref(crewId, postId) : null;
  },
};

/**
 * 알림이 가리키는 경로. payload가 기대한 리소스 ID를 담고 있지 않으면(방어적 — 정상 경로에서는
 * 발생하지 않는다) `null`을 돌려주고, 소비자는 그 알림을 클릭 불가능한 행으로 렌더한다(D-030 ③
 * 도메인 오류를 조용히 죽이지 않고 상태로 표현하는 대신, 네비게이션 하나가 실패한다고 알림
 * 센터 전체를 오류로 만들 필요는 없어 항목 단위로 무해하게 낮춘다).
 */
export function resolveNotificationHref(notification: Pick<Notification, "type" | "payload">): string | null {
  return NOTIFICATION_ROUTE_RESOLVERS[notification.type](notification.payload);
}
