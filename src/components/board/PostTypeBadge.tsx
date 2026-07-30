import { Badge } from "@/components/ui/badge";
import { strings } from "@/lib/strings";
import type { PostType } from "@/lib/types";

const LABEL: Record<PostType, string> = {
  general: strings.board.postType.free,
  meetup_proposal: strings.board.postType.proposal,
  // I-079/FR-065 AC2(26일차) — 일반 제안과 구분되는 배지. `variant`도 아래에서 별도로 준다.
  meetup_reschedule_proposal: strings.board.postType.reschedule,
};

/** 게시글 유형 배지(FR-031 AC3, I-079/FR-065 AC2). 순수 표현 — props만 받는다(D-030 ①). */
export function PostTypeBadge({ type }: { type: PostType }) {
  const variant = type === "general" ? "secondary" : "default";
  return <Badge variant={variant}>{LABEL[type]}</Badge>;
}
