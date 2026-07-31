import { MessageSquarePlus } from "lucide-react";
import Link from "next/link";

import type { BoardPostSummary } from "@/components/board/board-view-models";
import { BoardListItem } from "@/components/board/BoardListItem";
import { BoardPagination } from "@/components/board/BoardPagination";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { strings, t } from "@/lib/strings";
import type { Id } from "@/lib/types";

/**
 * 이 목록이 어느 갈래인지 — 빈 상태·쓰기 버튼 문구가 갈린다. 컴포넌트가 문자열을 직접 고르지
 * 않고 props로 받는 이유는 `strings.board` docstring 참고(같은 컴포넌트를 두 벌로 복제하지
 * 않으려고). 기본값은 두 갈래가 섞여 있던 원래 목록(`/crews/{id}/board`)의 문구다.
 */
export interface BoardListLabels {
  empty: string;
  writeButton: string;
}

const DEFAULT_LABELS: BoardListLabels = {
  empty: strings.board.list.empty,
  writeButton: strings.board.list.writeButton,
};

export interface BoardListProps {
  crewId: Id;
  posts: BoardPostSummary[];
  totalCount: number;
  page: number;
  totalPages: number;
  /** `post:create`(FR-030) 허용 여부 — 순수 판정 결과를 props로만 받는다(D-030 ①). */
  canWrite: boolean;
  writeHref: string;
  labels?: BoardListLabels;
  /**
   * 페이지네이션 링크의 기준 경로. 크루 홈 탭 안에서는 `/crews/{id}?tab=posts` 같은 값이
   * 들어와 페이지를 넘겨도 탭이 유지된다. 생략하면 게시판 라우트(`/crews/{id}/board`)다.
   */
  paginationBaseHref?: string;
}

/**
 * 게시판 목록(SC-10, FR-031). 순수 표현 컴포넌트 — `lib/data`를 참조하지 않고 컨테이너가 이미
 * 조회·조인한 값만 받는다. 0건이면 빈 상태(AC1)를, 그 외에는 목록 + 페이지네이션(AC2)을 그린다.
 *
 * **같은 컴포넌트가 "모임투표"와 "게시판" 두 목록을 그린다**(팀장 요청) — 다른 것은 어떤
 * `type`의 글을 담았는가와 라벨뿐이고, 행 모양·페이지네이션·빈 상태 구조는 완전히 같다.
 */
export function BoardList({
  crewId,
  posts,
  totalCount,
  page,
  totalPages,
  canWrite,
  writeHref,
  labels = DEFAULT_LABELS,
  paginationBaseHref,
}: BoardListProps) {
  if (posts.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquarePlus aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{labels.empty}</EmptyTitle>
        </EmptyHeader>
        {canWrite && (
          <EmptyContent>
            {/* `render`가 <a>를 만들므로 nativeButton={false}. 기본값(true)이면 Base UI가
                네이티브 <button>을 기대해 개발 모드에서 경고하고, 링크에 button 시맨틱을
                덧씌워 role·aria 속성이 어긋난다. 이동 동작이므로 링크가 맞는 자리다. */}
            <Button size="sm" nativeButton={false} render={<Link href={writeHref} />}>
              {labels.writeButton}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="tnum text-sm text-muted-foreground">
          {t((s) => s.board.list.totalCount, { count: totalCount })}
        </p>
        {canWrite && (
          <Button size="sm" nativeButton={false} render={<Link href={writeHref} />}>
            {labels.writeButton}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {posts.map((post) => (
          <BoardListItem key={post.id} crewId={crewId} post={post} />
        ))}
      </div>

      {totalPages > 1 && (
        <BoardPagination
          crewId={crewId}
          page={page}
          totalPages={totalPages}
          baseHref={paginationBaseHref}
        />
      )}
    </div>
  );
}
