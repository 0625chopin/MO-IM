import { Loader2Icon } from "lucide-react";


import { BlockButton } from "@/components/moderation/BlockButton";
import { BlockedContentNotice } from "@/components/moderation/BlockedContentNotice";
import { BlockedUsersList } from "@/components/moderation/BlockedUsersList";
import { BlockedUsersListSkeleton } from "@/components/moderation/BlockedUsersListSkeleton";
import { ReportDialog } from "@/components/moderation/ReportDialog";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { defineSection } from "@/components/sample/showcase-types";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";

import type { ReactNode } from "react";

/** `invitations.tsx`의 `LabeledDemo`와 같은 패턴 — "오류" 패널 하나에 도메인 오류 여러 종을
 *  나란히 보여준다. */
function LabeledDemo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const SAMPLE_BLOCKED_USERS = [
  { id: "profile-block-1", handle: "spam_bot_01", displayName: "탈퇴 예정 계정", avatarUrl: null },
  { id: "profile-block-2", handle: "loud_user", displayName: "시끄러운 사용자", avatarUrl: null },
];

/**
 * FR-080·081 신고·차단(Task 042A). 실제 사용처는 `MemberList`(크루원 목록 행별 신고·차단
 * 버튼)와 `/settings`(차단한 사용자 관리, `BlockedUsersListContainer`)다.
 *
 * **`BlockedContentNotice`는 Task 041(21일차)에 게시판·댓글·채팅에 배선됐다** — `board.tsx`·
 * `chat.tsx`의 "차단한 사용자" 항목들 참고. 이 섹션에는 컴포넌트 자체의 최소 동작 확인용
 * 데모(펼치기/접기)만 남겨 둔다.
 *
 * **`ReportDialog`는 25일차(I-117 해소)에 `PostActions`(게시글)·`CommentItem`(댓글)·
 * `MessageBubble`(채팅 메시지, `triggerVariant="icon"`)에 실제로 배선됐다** — 이전에는
 * 컴포넌트 자체는 4종(post·comment·chat_message·profile)을 지원했지만 렌더하는 호출부가
 * `MemberList` 하나뿐이었다(백엔드 4종은 이미 완비, 순수 UI 배선 누락). 이 섹션은 여전히
 * `ReportDialog` 자신의 기본·로딩·오류 3상태를 대표로 보여준다 — 다른 세 호출부는 같은
 * 컴포넌트를 재사용하므로 상태를 여기서 한 번만 자세히 보여주고, `board.tsx`·`chat.tsx`
 * 쪽에는 "이 화면에도 신고 버튼이 있다"는 배선 확인만 남긴다(중복 등록 회피).
 *
 * **`ReportDialog`·`BlockButton`은 게스트 세션에서 제출하면 `sessionExpired`/`notAllowed`류
 * 폼 오류로 안전하게 막힌다** — `InviteMemberDialog`와 같은 근거(`checkPermission`이 실제로
 * 작동한다는 증거).
 */
export const moderationSection = defineSection({
  id: "moderation",
  label: "신고·차단",
  title: "신고·차단",
  description:
    "FR-080·081(D-008·D-014, NFR-015). 신고는 post·comment·chat_message·profile 4종 대상을 사유와 함께 접수하고 같은 대상 재신고는 1건으로 병합됩니다(create_report RPC). 차단은 상대를 크루에 초대할 수 없게 막고(FR-081 AC2, RLS), 상대 콘텐츠는 접힘 처리됩니다(AC1, BlockedContentNotice — 아직 게시판·채팅 미배선).",
  items: [
    {
      name: "ReportDialog",
      note: "실제 컴포넌트입니다. targetType·targetId만 넘기면 post·comment·chat_message·profile 어디서든 재사용됩니다(25일차부터 넷 다 실제로 배선 — board.tsx의 PostActions(post)·CommentItem(comment), chat.tsx의 MessageBubble(chat_message), MemberList(profile, 아래 참고)). 아래 데모는 profile 대상입니다. '오류' 패널은 create_report RPC의 reason_code 3종을 나란히 보여줍니다.",
      panels: {
        default: (
          <PreviewFrame height={140}>
            <div className="mx-auto w-full max-w-sm p-4">
              <ReportDialog targetType="profile" targetId="profile-sample-1" />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={100}>
            <div className="mx-auto w-full max-w-sm p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.report.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={220}>
            <div className="flex flex-col gap-3 p-4">
              <LabeledDemo label="사유 미입력(reason_required)">
                <ErrorState title={strings.report.errors.reason_required} />
              </LabeledDemo>
              <LabeledDemo label="자기 프로필 신고(cannot_report_self)">
                <ErrorState title={strings.report.errors.cannot_report_self} />
              </LabeledDemo>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "BlockButton",
      note: "실제 컴포넌트입니다. MemberList 행별 차단 버튼과 동일합니다. initialBlocked=true면 '차단됨'으로 비활성 표시됩니다(멱등 — 이미 차단한 사용자를 다시 눌러도 already_blocked=true로 성공).",
      panels: {
        default: (
          <PreviewFrame height={80}>
            <div className="flex gap-3 p-4">
              <BlockButton blockedId="profile-sample-2" />
              <BlockButton blockedId="profile-sample-3" initialBlocked />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={80}>
            <div className="p-4">
              <Button disabled size="sm" variant="outline">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.block.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={120}>
            <div className="p-4">
              <ErrorState title={strings.block.errors.cannot_block_self} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "BlockedContentNotice",
      note: "FR-081 AC1 — 차단한 사용자의 콘텐츠 접힘 표시입니다. 펼치기를 누르면 실제로 children이 드러납니다(내부 상태, 이 프리뷰 안에서 직접 눌러 확인할 수 있습니다).",
      panels: {
        default: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <BlockedContentNotice>
                <p className="text-sm text-foreground">
                  차단한 사용자가 작성한 게시글 본문 예시입니다.
                </p>
              </BlockedContentNotice>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "BlockedUsersList (설정 > 차단 관리)",
      note: "실제 라우트는 /settings. BlockedUsersListContainer가 listMyBlockedProfileIds + getProfileById(I-058 안전 폴백)로 조립합니다.",
      panels: {
        default: (
          <PreviewFrame height={220}>
            <div className="p-4">
              <BlockedUsersList blockedUsers={SAMPLE_BLOCKED_USERS} />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <div className="p-4">
              <BlockedUsersListSkeleton />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <BlockedUsersList blockedUsers={[]} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <ErrorState
                title={strings.error.unknown.title}
                description={strings.error.unknown.description}
              />
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
