import { CrewColorDot } from "@/components/crews/CrewColorDot";
import { JoinRequestButton } from "@/components/crews/JoinRequestButton";
import { Badge } from "@/components/ui/badge";
import type { JoinRequestButtonState } from "@/lib/rules/join-request-button-state";
import { t } from "@/lib/strings";
import type { Id } from "@/lib/types";

export interface CrewIntroPreviewProps {
  crewId: Id;
  name: string;
  description: string;
  category: string;
  colorIndex: number;
  memberCount: number;
  joinState: JoinRequestButtonState;
}

/**
 * `public` 크루를 보는 비소속자의 크루 홈(D-007·FR-012 AC3, D-030 ①). 소개(이름·설명·
 * 카테고리·멤버 수)까지만 보이고 게시판·채팅·멤버 목록·캘린더로 가는 링크는 아예 그리지
 * 않는다 — `CrewHome`(소속자용)과 이 파일을 하나로 합치지 않은 이유가 이것이다: 조건부로
 * 숨기는 것과 애초에 존재하지 않는 것은 "URL을 안다고 우회할 수 있는가"에서 의미가 다르다
 * (이 컴포넌트 자체에 그 링크들의 href를 만드는 코드가 없다).
 */
export function CrewIntroPreview({
  crewId,
  name,
  description,
  category,
  colorIndex,
  memberCount,
  joinState,
}: CrewIntroPreviewProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CrewColorDot colorIndex={colorIndex} />
          <h1 className="font-heading text-lg font-medium text-foreground">{name}</h1>
          <Badge variant="outline">{category}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">{t((s) => s.crew.home.memberCount, { count: memberCount })}</p>
      </header>

      <JoinRequestButton crewId={crewId} state={joinState} />
    </div>
  );
}
