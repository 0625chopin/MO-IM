import { GitCompare } from "lucide-react";
import Link from "next/link";

import { getPostDetailHref } from "@/components/board/board-links";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MeetupRescheduleConflictProps {
  crewId: Id;
  /** 이미 진행 중인 일정 변경 제안 post — R-016·FR-052, 리소스 ID로만 받는다(경로 문자열을
   *  저장하지 않는다). 렌더 시점에 `getPostDetailHref`로 경로를 계산한다. */
  conflictingPostId: Id;
  className?: string;
}

/**
 * I-130(27일차, BOARD) — 같은 Meetup을 겨냥한, 아직 종료되지 않은(open) 일정 변경 제안이
 * 이미 있을 때의 도메인 오류(D-030③). 사용자 결정(27일차, D-079): **"트리거로 DB에서
 * 차단하고, UI는 도달 전에 사전 안내한다"** — `posts_guard_reschedule_target_scope` 트리거가
 * 최종 방어선이지만 그 앞에서 이 컴포넌트가 사용자를 막는다.
 *
 * `RouteErrorBoundary`(범용 `RouteErrorKind` 카탈로그, 고정 문구)를 쓰지 않고 전용 컴포넌트를
 * 새로 둔 이유 — 이 상태는 고정 문구만으로 끝내면 안 되고 **기존 제안글로 가는 링크**를 반드시
 * 함께 보여줘야 한다(팀장 지시 — "이미 진행 중인 제안이 있어 새 제안을 만들 수 없다"는 상태를
 * 막다른 길로 느끼지 않게, 기존 제안으로 갈 길을 함께 제시한다). `RouteErrorBoundary`의
 * `homeHref`는 모든 kind가 공유하는 "홈으로" 버튼 자리라 이 리소스별 링크를 담을 수 없다.
 *
 * 두 자리에서 재사용한다(같은 사실을 다른 시점에 보여준다):
 * 1. `MeetupRescheduleContainer` — 라우트 진입 시점(직접 URL 접근), 기본 `className`
 *    (전체 화면, `RouteErrorBoundary`와 같은 `min-h-[50vh]`)으로 쓴다.
 * 2. `MeetupRescheduleForm` — 제출 시점 TOCTOU(폼을 연 뒤 다른 사람이 먼저 제안), `className`
 *    으로 `min-h-[50vh]`를 좁혀 폼 안쪽 인라인 카드로 쓴다.
 */
export function MeetupRescheduleConflict({ crewId, conflictingPostId, className }: MeetupRescheduleConflictProps) {
  return (
    <Empty className={cn("min-h-[50vh]", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <GitCompare aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{strings.meetup.duplicateProposal.title}</EmptyTitle>
        <EmptyDescription>{strings.meetup.duplicateProposal.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href={getPostDetailHref(crewId, conflictingPostId)} className={buttonVariants({ size: "sm" })}>
          {strings.meetup.duplicateProposal.linkLabel}
        </Link>
      </EmptyContent>
    </Empty>
  );
}
