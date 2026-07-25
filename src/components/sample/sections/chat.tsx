import { AlertTriangleIcon, SendIcon } from "lucide-react";

import type { ChatTimelineItem } from "@/components/chat/message-view-models";
import { MessageListSkeleton } from "@/components/chat/MessageListSkeleton";
import type { PostLinkCardViewModel } from "@/components/chat/post-link-card-view-models";
import { PostLinkCard } from "@/components/chat/PostLinkCard";
import type { RouteErrorKind } from "@/components/errors/route-error-kind";
import { RouteErrorBoundaryPreview } from "@/components/errors/RouteErrorBoundaryPreview";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { ChatMessageListPreview } from "@/components/sample/sections/ChatMessageListPreview";
import { ConnectionBannerPreview } from "@/components/sample/sections/ConnectionBannerPreview";
import { MessageBubblePreview } from "@/components/sample/sections/MessageBubblePreview";
import { RealtimeAuthErrorDemoContainer } from "@/components/sample/sections/RealtimeAuthErrorDemoContainer";
import { defineSection } from "@/components/sample/showcase-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/rules/chat-message-validation";
import { strings, t } from "@/lib/strings";

/**
 * 채팅 MessageList/Bubble/Composer(FR-050·051, Task 020A) + 낙관적 렌더·재전송·ConnectionBanner
 * (FR-051 정상 흐름 ③④·E1·E2, Task 020B). `MessageList`·`MessageBubble`·`ConnectionBanner`는
 * 순수 표현 컴포넌트라 `lib/data`를 참조하지 않으므로 실제 컴포넌트를 그대로 렌더링한다(아래
 * 고정 데이터는 `MessageListContainer`가 만드는 조인 결과 모양을 손으로 채운 것이다, `board.tsx`
 * 와 같은 패턴). **`MessageList`는 `ChatMessageListPreview`, `ConnectionBanner`는
 * `ConnectionBannerPreview`, `MessageBubble`은 `MessageBubblePreview`(모두 `/sample` 전용
 * 클라이언트 래퍼)를 거쳐 렌더한다** — `onLoadMore`·`onRetry`가 필수/선택 함수 prop인데 이
 * 파일(서버 컴포넌트)은 클로저를 직접 넘길 수 없다(RSC는 함수를 직렬화하지 않는다,
 * `BoardErrorStatePreview.tsx`와 같은 이유 — DESIGN 020A 교차검증 BLOCKER 2로 드러나 고쳤다).
 * **`MessageBubblePreview`는 8일차 DESIGN Task 022 교차검증에서 새로 드러난 BLOCKER**였다 —
 * 말풍선 자체는 함수 prop이 없어(`isOwn`·`message`만 받는다) 이 파일이 이전에는 그대로
 * 렌더링해도 문제가 없었지만, "전송 실패" 변형이 `onRetry`를 받으면서 같은 위반이 됐다. 다음에
 * `MessageBubble`처럼 함수 prop이 없던 컴포넌트에 함수 prop이 새로 생기면 이 파일에서 그 항목만
 * 놓치기 쉬우니 등록을 바꿀 때마다 이 문단을 함께 확인한다.
 *
 * **`Composer`만 예외** — 실제 앱에서는 `MessageRoomContainer.submitMessage`(Server Action 호출)
 * 로 이어지는 `onSubmit`을 받는데(`auth.tsx`의 `SignupForm` 등과 같은 이유, 실제 부작용이 있는
 * 흐름이라 그대로 렌더링하지 않는다) 여기서 그대로 렌더링하면 쇼케이스를 둘러보다 실수로
 * 제출해 공용 Mock 스토어의 `room-1`에 실제 메시지가 쌓인다. 그래서 `Composer`는 같은 UI
 * 원자·같은 문구를 쓰는 정적 프리뷰만 둔다.
 *
 * **`ConnectionBanner`는 `/sample` 전용 prop을 쓰지 않는다** — `status`가 실제 프로덕션
 * 컨테이너(`MessageRoomContainer`)도 그대로 넘기는 값이라, `/sample`도 다른 리터럴을 넣기만
 * 하면 3상태를 보여줄 수 있다(`DayDetailPanel`류의 escape hatch와 다른 이유는
 * `ConnectionBanner.tsx` 모듈 docstring 참고 — 020B 팀장 특별 지시에 대한 판단).
 *
 * "오류"는 네 층으로 나눠 등록한다(D-030 ③): **방 접근 자체의 거부**(`chat:send_message` 판정
 * 실패 — `MessageListContainer`가 던지고 `error.tsx`가 받는다, 게시판의 `board:read` 거부와
 * 같은 패턴) · **연결 상태**(`ConnectionBanner`의 "disconnected" — 브라우저 오프라인 또는 구독
 * 자체의 실패) · **메시지별 전송 실패**(`MessageBubble`의 "failed" 말풍선 — 재전송 버튼 포함) ·
 * **게시글 카드의 도메인 오류**(`PostLinkCard`의 삭제됨·다른 크루, FR-052 E1·E2 — 아래 참고).
 *
 * **`PostLinkCard`(FR-052·053, Task 020C)는 함수 prop이 없다** — `Link`만 쓰는 순수 표현
 * 컴포넌트라(`BoardListItem.tsx`와 같은 이유) `/sample` 전용 클라이언트 래퍼 없이 이 서버
 * 컴포넌트에서 바로 렌더한다. 일반글·제안글(투표 상태·남은 시간, AC3)은 "게시글 공유 카드"
 * 항목의 `default` 패널에, 삭제됨·다른 크루(D-030 ③ 도메인 오류)는 같은 항목의 `error` 패널에
 * 나눠 둔다 — `loading`·`empty`는 이 컴포넌트에 해당 개념이 없어 비운다(`ConnectionBanner`
 * 항목이 이미 `empty`를 비우는 것과 같은 전례).
 */

const VIEWER_PROFILE_ID = "profile-1";

/** `resolvePostLinkCard`가 실제로 만드는 모양을 손으로 채운 것(`fixtures.ts`의 post-1과 같은
 *  일반글) — 아래 "게시글 공유 카드" 항목과 "메시지 목록"/"말풍선 변형" 양쪽이 공유한다. */
const SAMPLE_POST_LINK_GENERAL: PostLinkCardViewModel = {
  kind: "post",
  crewId: "crew-1",
  postId: "post-1",
  postType: "general",
  title: "이번 주 코스 공지",
  authorDisplayName: "서지훈",
  authorAvatarUrl: null,
  poll: null,
};

/** `fixtures.ts`의 post-2(진행 중인 모임 제안)와 같은 값 — 투표 상태·남은 시간(FR-052 AC3)을
 *  함께 보여준다. `remainingMs`는 고정 데모값이다 — `/sample`은 정적 데이터라 렌더 시각을
 *  계산하지 않는다(`PollCountdown`이 소비하는 값이지 이 파일이 갱신하는 값이 아니다). */
const SAMPLE_POST_LINK_PROPOSAL: PostLinkCardViewModel = {
  kind: "post",
  crewId: "crew-1",
  postId: "post-2",
  postType: "meetup_proposal",
  title: "8/1(토) 아침 러닝 어때요?",
  authorDisplayName: "김유나",
  authorAvatarUrl: null,
  poll: {
    status: "open",
    closesAt: "2026-07-31T23:59:59.000Z",
    remainingMs: 7 * 24 * 60 * 60 * 1000,
    isAwaitingClosure: false,
  },
};

const SAMPLE_MESSAGES: ChatTimelineItem[] = [
  {
    id: "sample-message-1",
    roomId: "room-1",
    senderId: "profile-2",
    senderDisplayName: "김유나",
    senderAvatarUrl: null,
    type: "text",
    body: "다들 코스 확인해주세요~",
    refPostId: null,
    postLinkCard: null,
    clientKey: "sample-message-1",
    createdAt: "2026-07-20T09:05:00.000Z",
    deletedAt: null,
    deliveryStatus: "sent",
  },
  {
    id: "sample-message-2",
    roomId: "room-1",
    senderId: VIEWER_PROFILE_ID,
    senderDisplayName: "서지훈",
    senderAvatarUrl: null,
    type: "text",
    body: "넵! 확인했습니다. 이번 주도 화이팅이에요 🙌",
    refPostId: null,
    postLinkCard: null,
    clientKey: "sample-message-2",
    createdAt: "2026-07-20T09:07:00.000Z",
    deletedAt: null,
    deliveryStatus: "sent",
  },
  {
    id: "sample-message-3",
    roomId: "room-1",
    senderId: "profile-2",
    senderDisplayName: "김유나",
    senderAvatarUrl: null,
    type: "post_link",
    body: null,
    refPostId: "post-2",
    postLinkCard: SAMPLE_POST_LINK_PROPOSAL,
    clientKey: "sample-message-3",
    createdAt: "2026-07-22T10:01:00.000Z",
    deletedAt: null,
    deliveryStatus: "sent",
  },
  {
    id: "sample-message-4",
    roomId: "room-1",
    senderId: "profile-2",
    senderDisplayName: "김유나",
    senderAvatarUrl: null,
    type: "text",
    body: "(이 메시지는 삭제됐어요)",
    refPostId: null,
    postLinkCard: null,
    clientKey: "sample-message-4",
    createdAt: "2026-07-22T10:03:00.000Z",
    deletedAt: "2026-07-22T10:04:00.000Z",
    deliveryStatus: "sent",
  },
];

/** Task 020B — 낙관적 렌더(FR-051 정상 흐름 ③) 데모용. `createOptimisticTimelineItem`이 만드는
 *  실제 모양을 손으로 채운 것 — `senderDisplayName`은 본인 메시지라 화면에 나타나지 않는다. */
const SAMPLE_PENDING_MESSAGE: ChatTimelineItem = {
  id: "sample-pending-clientkey",
  roomId: "room-1",
  senderId: VIEWER_PROFILE_ID,
  senderDisplayName: "",
  senderAvatarUrl: null,
  type: "text",
  body: "지금 전송 중인 메시지예요",
  refPostId: null,
  postLinkCard: null,
  clientKey: "sample-pending-clientkey",
  createdAt: "2026-07-22T10:05:00.000Z",
  deletedAt: null,
  deliveryStatus: "pending",
};

/** Task 020B — 재전송(FR-051 E1) 데모용. */
const SAMPLE_FAILED_MESSAGE: ChatTimelineItem = {
  id: "sample-failed-clientkey",
  roomId: "room-1",
  senderId: VIEWER_PROFILE_ID,
  senderDisplayName: "",
  senderAvatarUrl: null,
  type: "text",
  body: "네트워크가 끊겨서 보내지 못한 메시지예요",
  refPostId: null,
  postLinkCard: null,
  clientKey: "sample-failed-clientkey",
  createdAt: "2026-07-22T10:06:00.000Z",
  deletedAt: null,
  deliveryStatus: "failed",
};

const DOMAIN_ERROR_ITEMS: Array<{ kind: RouteErrorKind; name: string; note: string }> = [
  {
    kind: "forbidden",
    name: "채팅방 접근 권한 없음 (RLS 403)",
    note: "chat:send_message 판정 거부 — 비소속 크루의 채팅방에 접근하면 이 화면이 뜬다(lib/rules/permission.ts, MessageListContainer가 던지고 error.tsx가 받는다). FR-050 AC3(탈퇴한 사용자 403)도 같은 경로다.",
  },
];

export const chatSection = defineSection({
  id: "chat",
  label: "채팅",
  title: "채팅 — MessageList · MessageBubble · PostLinkCard · Composer · ConnectionBanner",
  description:
    "FR-050~053. 최신 50건 + 위로 이어 로드(윈도잉, D-023)와 lib/realtime 구독(Task 008 인터페이스 → Task 033 실 Supabase Broadcast)을 소비하는 첫 화면이자, 낙관적 렌더·재전송·연결 상태(Task 020B), 게시글 공유 카드·클라이언트 라우팅 이동·스크롤 복원(Task 020C)까지 갖춘 완성형입니다.",
  items: [
    {
      name: "메시지 목록 (MessageList)",
      note: "0건이면 빈 상태로 전환된다(FR-050 AC1). 연결 상태(끊김·재연결)는 이 항목이 아니라 아래 'ConnectionBanner' 항목에서 확인한다 — Task 020B에서 인라인 배너를 방 상단 배너 하나로 합쳤다. 스크롤 위치·읽음 지점 복원(FR-053 AC2)은 이 프리뷰에서 직접 재현하기 어렵다 — 실제 채팅방(/crews/[crewId]/chat)에서 게시글 카드를 눌러 상세로 갔다가 뒤로 가기로 확인하세요.",
      panels: {
        default: (
          <PreviewFrame height={440}>
            <div className="flex h-full flex-col">
              <ChatMessageListPreview
                roomId="room-1"
                messages={SAMPLE_MESSAGES}
                viewerProfileId={VIEWER_PROFILE_ID}
                hasMore
              />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={360}>
            <div className="flex h-full flex-col">
              <MessageListSkeleton rows={5} />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={220}>
            <div className="flex h-full flex-col">
              <ChatMessageListPreview roomId="room-1" messages={[]} viewerProfileId={VIEWER_PROFILE_ID} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "메시지 목록 — 차단한 사용자 포함 (FR-081 AC1, Task 042A)",
      note: "blockedProfileIds에 '김유나'(profile-2)를 넣은 데모입니다 — 그가 보낸 텍스트·게시글 공유 메시지 둘 다 접혀서 보입니다. 실시간으로 새로 도착하는 메시지도 같은 blockedProfileIds를 참조하는 동일한 렌더 경로를 타므로 구조적으로 동일하게 접힙니다(MessageRoomContainer.tsx 모듈 docstring — 다만 실 브라우저 소켓으로 확인하지는 못했습니다).",
      panels: {
        default: (
          <PreviewFrame height={440}>
            <div className="flex h-full flex-col">
              <ChatMessageListPreview
                roomId="room-1"
                messages={SAMPLE_MESSAGES}
                viewerProfileId={VIEWER_PROFILE_ID}
                blockedProfileIds={new Set(["profile-2"])}
              />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "연결 상태 배너 (ConnectionBanner)",
      note: "FR-051 E2, NFR-009. 상태는 MessageRoomContainer가 브라우저 online/offline + 구독 onError를 lib/rules/chat-connection-state.ts 상태 기계로 판정해 내려주는 실제 prop이라 /sample 전용 escape hatch 없이 리터럴만 바꿔 넣었다(ConnectionBanner.tsx 모듈 docstring 참고).",
      panels: {
        default: (
          <PreviewFrame height={80}>
            <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center text-xs text-muted-foreground">
              <ConnectionBannerPreview status="connected" />
              <span>연결이 정상이면 배너 자체가 렌더링되지 않습니다.</span>
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={80}>
            <ConnectionBannerPreview status="reconnecting" />
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={120}>
            <ConnectionBannerPreview status="disconnected" />
          </PreviewFrame>
        ),
      },
    },
    {
      name: "Realtime 구독 인가 (Broadcast Authorization)",
      note: "D-030 ③, Task 033. Mock으로 흉내 낸 오류가 아니라 존재하지 않는 크루 토픽을 실제로 subscribeToRoom()해 realtime.messages RLS(029B)가 실측으로 거부하는 응답을 그대로 보여줍니다 — 로그인 여부와 무관하게 항상 거부됩니다. 19일차 Node E2E 스크립트로 같은 정규식 패턴이 CHANNEL_ERROR로 거부됨을 먼저 확인했습니다(docs/decisions/realtime-broadcast-033.md).",
      panels: {
        default: (
          <PreviewFrame height={140}>
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              인가된 크루 토픽(crew:&#123;id&#125;:chat)을 구독하면 이 알림 없이 조용히 연결됩니다 — 아래
              &apos;오류&apos; 패널에서 거부 사례를 확인하세요.
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <RealtimeAuthErrorDemoContainer />
            </div>
          </PreviewFrame>
        ),
      },
    },
    ...DOMAIN_ERROR_ITEMS.map(({ kind, name, note }) => ({
      name,
      note,
      panels: {
        error: (
          <PreviewFrame height={280}>
            <RouteErrorBoundaryPreview kind={kind} />
          </PreviewFrame>
        ),
      },
    })),
    {
      name: "게시글 공유 카드 (PostLinkCard)",
      note: "FR-052·053, Task 020C. 카드 클릭은 getPostDetailHref(crewId, postId)로 클라이언트 라우팅 이동한다(R-016 — 경로 문자열이 아니라 리소스 ID 기준). '기본'은 일반글·모임 제안글(투표 상태·남은 시간 포함, AC3) 두 성공 분기, '오류'는 삭제된 게시글(FR-052 E2)·다른 크루 게시글(FR-052 E1, D-030 ③ 도메인 오류) 두 분기다.",
      panels: {
        default: (
          <PreviewFrame height={320}>
            <div className="flex flex-col gap-3 p-4">
              <PostLinkCard state={SAMPLE_POST_LINK_GENERAL} />
              <PostLinkCard state={SAMPLE_POST_LINK_PROPOSAL} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={200}>
            <div className="flex flex-col gap-3 p-4">
              <PostLinkCard state={{ kind: "deleted" }} />
              <PostLinkCard state={{ kind: "forbidden" }} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "말풍선 변형 (MessageBubble)",
      note: "본인/상대 · 텍스트/게시글 공유(실제 PostLinkCard, Task 020C) · 삭제된 메시지 · 전송 중(낙관적 렌더) · 전송 실패(재전송 버튼, FR-051 E1) 6가지 모양.",
      content: (
        <PreviewFrame height={420}>
          <MessageBubblePreview
            items={[
              { message: SAMPLE_MESSAGES[1], isOwn: true },
              { message: SAMPLE_MESSAGES[0], isOwn: false },
              { message: SAMPLE_MESSAGES[2], isOwn: false },
              { message: SAMPLE_MESSAGES[3], isOwn: false },
              { message: SAMPLE_PENDING_MESSAGE, isOwn: true },
              { message: SAMPLE_FAILED_MESSAGE, isOwn: true },
            ]}
          />
        </PreviewFrame>
      ),
    },
    {
      name: "말풍선 — 차단한 사용자의 메시지 (FR-081 AC1, Task 042A)",
      note: "isSenderBlocked=true인 상대 메시지는 BlockedContentNotice로 감싸져 말풍선 내용만 접힙니다 — 아바타·이름·시각은 그대로 보입니다(누구 메시지인지 알아야 신고·차단 판단이 가능하므로). 본인 메시지(isOwn)는 자기 자신을 차단할 수 없으므로 이 변형이 적용되지 않습니다.",
      content: (
        <PreviewFrame height={200}>
          <MessageBubblePreview
            items={[
              { message: SAMPLE_MESSAGES[0], isOwn: false, isSenderBlocked: true },
              { message: SAMPLE_MESSAGES[2], isOwn: false, isSenderBlocked: true },
            ]}
          />
        </PreviewFrame>
      ),
    },
    {
      name: "말풍선 — 삭제 가능 (FR-054, Task 041)",
      note: "canDelete=true면 타임스탬프 옆에 삭제 아이콘 버튼이 붙는다 — 본인 메시지는 항상, 타인 메시지는 임원·오너·관리자(chat:delete_any_message)일 때만 MessageList가 이 값을 계산해 내려준다. 클릭하면 확인 다이얼로그(PostActions·CommentItem과 같은 패턴)가 뜬다. 전송 중(pending)·실패(failed) 메시지에는 애초에 삭제 버튼이 뜨지 않는다(MessageBubble.tsx의 showDelete 판정) — 아래 예시엔 그래서 포함하지 않았다.",
      content: (
        <PreviewFrame height={200}>
          <MessageBubblePreview
            items={[
              { message: SAMPLE_MESSAGES[1], isOwn: true, canDelete: true },
              { message: SAMPLE_MESSAGES[0], isOwn: false, canDelete: true },
            ]}
          />
        </PreviewFrame>
      ),
    },
    {
      name: "입력창 (Composer)",
      note: "실제 컴포넌트는 onSubmit을 통해 MessageRoomContainer.submitMessage(Server Action 호출 + 낙관적 렌더)로 이어져(auth.tsx의 SignupForm과 같은 이유) 여기서는 같은 UI 원자로 만든 정적 프리뷰만 둡니다 — 실제 전송은 /crews/[crewId]/chat에서 확인하세요. Task 020B부터 전송 자체는 낙관적이라(결과를 기다리지 않고 입력을 비운다) 이 컴포넌트 자체에는 더 이상 '전송 중' 상태가 없습니다 — 그 피드백은 위 MessageBubble의 '전송 중'/'전송 실패' 변형이 대신합니다.",
      panels: {
        default: (
          <PreviewFrame height={120}>
            <div className="flex items-end gap-2 border-t border-border p-3">
              <Textarea placeholder={strings.chat.message.inputPlaceholder} rows={1} className="max-h-40" />
              <Button size="icon" aria-label={strings.chat.message.send}>
                <SendIcon aria-hidden="true" />
              </Button>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={160}>
            <div className="flex flex-col gap-2 border-t border-border p-3">
              <Alert variant="destructive">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertDescription>
                  {t((s) => s.chat.message.errors.tooLong, { max: CHAT_MESSAGE_MAX_LENGTH })}
                </AlertDescription>
              </Alert>
              <div className="flex items-end gap-2">
                <Textarea placeholder={strings.chat.message.inputPlaceholder} rows={1} className="max-h-40" />
                <Button size="icon" aria-label={strings.chat.message.send}>
                  <SendIcon aria-hidden="true" />
                </Button>
              </div>
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
