import { AlertTriangleIcon, Loader2Icon, Trash2Icon } from "lucide-react";

import { formatMessageTime } from "@/components/chat/format-message-time";
import type { ChatTimelineItem } from "@/components/chat/message-view-models";
import { PostLinkCard } from "@/components/chat/PostLinkCard";
import { BlockedContentNotice } from "@/components/moderation/BlockedContentNotice";
import { ReportDialog } from "@/components/moderation/ReportDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

export interface MessageBubbleProps {
  message: ChatTimelineItem;
  /** 뷰어 본인이 보낸 메시지인지 — 컨테이너가 `viewerProfileId === message.senderId`로 미리
   *  판정해 내려준다(D-030 ①, 표현 컴포넌트는 세션을 모른다). */
  isOwn: boolean;
  /** `message.deliveryStatus === "failed"`일 때만 쓰인다(FR-051 E1 "실패 표시 + 재전송 버튼"). */
  onRetry?: () => void;
  /** FR-081 AC1(Task 042A) — 뷰어가 이 메시지의 발신자를 차단했는가. `isOwn`이면 항상 false로
   *  넘어온다(자기 자신을 차단할 수 없다 — `blocks_check` CHECK, `create_block` RPC). */
  isSenderBlocked?: boolean;
  /** FR-054(Task 041) — 본인 메시지이거나 임원·오너·관리자면 true(`MessageList`가 이미
   *  `isOwn || canDeleteAnyMessage`로 계산해 내려준다). `deliveryStatus !== "sent"`(낙관적
   *  렌더 중이거나 실패한 메시지)에는 이 값과 무관하게 삭제 버튼을 그리지 않는다 — 서버에
   *  아직 확정되지 않은 메시지는 지울 대상 자체가 없다. */
  canDelete?: boolean;
  onDelete?: () => void;
}

/**
 * 채팅 말풍선 하나(FR-051). 순수 표현 컴포넌트 — `lib/data`·`lib/realtime`을 참조하지 않는다.
 * 본인 메시지는 오른쪽 정렬 + `--primary` 채움, 상대 메시지는 왼쪽 정렬 + 발신자 아바타·이름 +
 * `--muted` 채움으로 구분한다(색만으로 구분하지 않는다 — 정렬·아바타 유무 자체가 이미 구조적
 * 차이다, WCAG 1.4.1). 말풍선 모서리를 발신 방향 쪽만 살짝 좁혀(`rounded-br-sm`/`rounded-bl-sm`)
 * 꼬리 없는 말풍선에도 방향성을 준다.
 *
 * **낙관적 렌더·재전송(Task 020B, FR-051 정상 흐름 ③④·E1)**: `deliveryStatus`가 `"pending"`이면
 * 말풍선을 옅게 칠하고 타임스탬프 자리에 스피너를 보여준다(전송 중임을 색 하나로만 전달하지
 * 않는다 — 애니메이션 자체가 이미 구조적 신호). `"failed"`면 말풍선 아래에 경고 아이콘 + 문구 +
 * `onRetry`를 호출하는 재전송 버튼을 덧붙인다. `deliveryStatus`는 항상 본인 메시지에서만
 * `"pending"`/`"failed"`가 되므로(다른 사용자의 메시지는 서버가 확정한 뒤에만 이 화면에
 * 도착한다) 상대 메시지 쪽 분기는 신경 쓰지 않는다.
 *
 * **`data-message-id`(Task 020C, FR-053 AC2)**: 두 루트 모두에 붙인다 — `MessageList`가
 * 스크롤 위치·읽음 지점을 복원할 때 이 속성으로 앵커 메시지를 찾는다(`chat-scroll-storage.ts`
 * 참고). 새 조건 분기를 추가할 때(예: 다른 삭제 표시 방식) 이 속성을 빠뜨리면 그 메시지 종류로
 * 스크롤이 복원되지 않는다.
 *
 * **FR-081 AC1(Task 042A, 20일차)**: `isSenderBlocked`면 말풍선 내용(`MessageContent`)만
 * `BlockedContentNotice`로 감싼다 — 아바타·이름·시각은 그대로 둔다(`PostDetail`과 같은 원칙:
 * 누구 메시지인지는 계속 보여야 신고·차단 판단이 가능하다). 말풍선이 `<Link>`로 감싸여 있지
 * 않으므로(`BoardListItem`과 달리) 상호작용 요소 중첩 문제가 없다.
 *
 * **FR-080(I-117 해소, 25일차)**: 삭제 버튼과 같은 자리(타임스탬프 옆)에 `ReportDialog`
 * (`triggerVariant="icon"`, `Trash2Icon`과 같은 크기의 `FlagIcon`)를 상대 메시지에만 붙인다.
 * `create_report` RPC는 `chat_message` 대상의 자기신고를 막지 않지만 `isOwn`이면 애초에
 * 노출하지 않는다 — `MemberList`의 `canReportOrBlock: !isSelf`와 같은 UI 정책.
 */
export function MessageBubble({
  message,
  isOwn,
  onRetry,
  isSenderBlocked = false,
  canDelete = false,
  onDelete,
}: MessageBubbleProps) {
  if (message.deletedAt) {
    return (
      <div data-message-id={message.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
        <p className="text-sm text-muted-foreground italic">{strings.chat.message.deleted}</p>
      </div>
    );
  }

  const isPending = message.deliveryStatus === "pending";
  const isFailed = message.deliveryStatus === "failed";
  const showDelete = canDelete && !isPending && !isFailed && onDelete;
  /** FR-080(I-117 해소, 25일차) — 상대 메시지에만 보여준다(자기 자신을 신고할 수 없다,
   *  `isSenderBlocked`와 같은 이유로 `isOwn`이면 항상 배제). `deliveryStatus`가
   *  `pending`/`failed`인 메시지는 위 docstring대로 항상 본인 메시지에서만 나타나므로
   *  `!isOwn`이 이미 그 두 상태를 배제한다 — 별도 prop 없이 컨테이너 게이트(크루원 전용
   *  채팅방, `report:create`는 로그인 회원 전체 allow)만으로 충분하다(`comment:create` 게이트를
   *  다시 하지 않는 `CommentListContainer`와 같은 원칙). */
  const showReport = !isOwn;

  return (
    <div
      data-message-id={message.id}
      className={cn(
        "flex flex-col gap-1 @sm:max-w-[75%]",
        isOwn ? "items-end self-end" : "items-start self-start",
      )}
    >
      <div className={cn("flex items-end gap-2", isOwn && "flex-row-reverse")}>
        {!isOwn && (
          <Avatar size="sm" className="mb-0.5 shrink-0">
            <AvatarImage src={message.senderAvatarUrl ?? undefined} alt="" />
            <AvatarFallback>{message.senderDisplayName.slice(0, 1)}</AvatarFallback>
          </Avatar>
        )}
        <div className={cn("flex min-w-0 flex-col gap-1", isOwn ? "items-end" : "items-start")}>
          {!isOwn && (
            <span className="px-0.5 text-xs text-muted-foreground">{message.senderDisplayName}</span>
          )}
          <div className={cn("flex items-end gap-1.5", isOwn && "flex-row-reverse")}>
            {isSenderBlocked && !isOwn ? (
              <BlockedContentNotice>
                <MessageContent message={message} isOwn={isOwn} pending={isPending} />
              </BlockedContentNotice>
            ) : (
              <MessageContent message={message} isOwn={isOwn} pending={isPending} />
            )}
            {isPending ? (
              <span
                className="mb-0.5 flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
                role="status"
              >
                <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
                <span className="sr-only">{strings.chat.message.sending}</span>
              </span>
            ) : (
              <time
                className="tnum shrink-0 text-[11px] text-muted-foreground"
                dateTime={message.createdAt}
              >
                {formatMessageTime(message.createdAt)}
              </time>
            )}
            {showDelete && (
              <Dialog>
                <DialogTrigger
                  render={
                    <button
                      type="button"
                      aria-label={strings.chat.message.delete.triggerLabel}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    />
                  }
                >
                  <Trash2Icon aria-hidden="true" className="size-3.5" />
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{strings.chat.message.delete.confirmTitle}</DialogTitle>
                    <DialogDescription>{strings.chat.message.delete.confirmDescription}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      {strings.chat.message.delete.cancelAction}
                    </DialogClose>
                    <Button variant="destructive" onClick={onDelete}>
                      {strings.chat.message.delete.confirmAction}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {showReport && (
              <ReportDialog targetType="chat_message" targetId={message.id} triggerVariant="icon" />
            )}
          </div>
        </div>
      </div>
      {isFailed && (
        <div className="flex items-center gap-1.5 pr-1 text-xs text-destructive">
          <AlertTriangleIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{strings.chat.message.sendFailedInline}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="font-medium underline underline-offset-2 hover:text-destructive/80"
            >
              {strings.chat.message.resend}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MessageContent({
  message,
  isOwn,
  pending,
}: {
  message: ChatTimelineItem;
  isOwn: boolean;
  pending: boolean;
}) {
  if (message.type === "post_link") {
    // postLinkCard가 null인 경우(방어적 분기 — 정상 경로에서는 sendMessage가 refPostId를
    // 강제하고 toMessageViewModel이 항상 조인한다)는 "삭제됨"과 같은 안전한 기본값으로 그린다.
    return <PostLinkCard state={message.postLinkCard ?? { kind: "deleted" }} />;
  }

  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
        isOwn
          ? "rounded-br-sm bg-primary text-primary-foreground"
          : "rounded-bl-sm bg-muted text-foreground",
        pending && "opacity-60",
      )}
    >
      {message.body}
    </div>
  );
}
