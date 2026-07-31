import Link from "next/link";

import { getBoardListHref } from "@/components/board/board-links";
import { getCrewChatHref, getCrewMembersHref, getCrewSettingsHref } from "@/components/crews/crew-links";
import { CrewColorDot } from "@/components/crews/CrewColorDot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { strings, t } from "@/lib/strings";
import type { CrewVisibility, Id } from "@/lib/types";

export interface CrewHomeProps {
  crewId: Id;
  name: string;
  description: string;
  category: string;
  colorIndex: number;
  visibility: CrewVisibility;
  memberCount: number;
  /** 임원 이상만 크루 설정 탭이 보인다(3.3절 `crew:update_info` — 일반 크루원은 불가). */
  canManageSettings: boolean;
}

/**
 * 크루 홈 — 소속(활성 멤버십) 회원이 보는 "전체" 화면(D-007·FR-012 4분기 중 `member` 칸,
 * public/private 무관하게 동일하다 — 이미 크루원이면 공개 범위는 이 화면의 모습을 바꾸지
 * 않는다). 표현 컴포넌트(D-030 ①) — 데이터는 전부 props로만 받고, 하위 라우트(게시판·채팅·
 * 멤버 관리·설정) 링크는 리소스 ID 기준으로 조립한다(R-016, `crew-links.ts`).
 */
export function CrewHome({
  crewId,
  name,
  description,
  category,
  colorIndex,
  visibility,
  memberCount,
  canManageSettings,
}: CrewHomeProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CrewColorDot colorIndex={colorIndex} />
          <h1 className="font-heading text-lg font-medium text-foreground">{name}</h1>
          <Badge variant="outline">{category}</Badge>
          {/* 공개 범위 배지 — 코드값을 키로 라벨을 꺼낸다(`CrewCreateForm`의 라디오와 같은
              소스). 삼항으로 두 갈래를 적어 두면 공개 범위가 늘 때 이 자리가 조용히
              틀린 라벨을 보여준다. */}
          <Badge variant="secondary">{strings.crew.create.visibilityOptions[visibility].label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">{t((s) => s.crew.home.memberCount, { count: memberCount })}</p>
      </header>

      <nav aria-label={name} className="flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={getBoardListHref(crewId)} />}>
          {strings.nav.board}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={getCrewChatHref(crewId)} />}>
          {strings.nav.chat}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={getCrewMembersHref(crewId)} />}>
          {strings.crew.members.title}
        </Button>
        {canManageSettings && (
          <Button variant="outline" nativeButton={false} render={<Link href={getCrewSettingsHref(crewId)} />}>
            {strings.crew.settings.title}
          </Button>
        )}
      </nav>
    </div>
  );
}
