import Link from "next/link";

import type { CrewHomeTab } from "@/components/crews/crew-home-tabs";
import { getCrewSettingsHref } from "@/components/crews/crew-links";
import { CrewColorDot } from "@/components/crews/CrewColorDot";
import { CrewHomeTabs } from "@/components/crews/CrewHomeTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { strings, t } from "@/lib/strings";
import type { CrewVisibility, Id } from "@/lib/types";

import type { ReactNode } from "react";

export interface CrewHomeProps {
  crewId: Id;
  name: string;
  description: string;
  category: string;
  colorIndex: number;
  visibility: CrewVisibility;
  memberCount: number;
  /** 임원 이상만 크루 설정 버튼이 보인다(3.3절 `crew:update_info` — 일반 크루원은 불가). */
  canManageSettings: boolean;
  activeTab: CrewHomeTab;
  /** 선택된 탭의 내용. 컨테이너가 탭에 맞는 컨테이너를 조립해 넘긴다. */
  children: ReactNode;
}

/**
 * 크루 홈 — 소속(활성 멤버십) 회원이 보는 "전체" 화면(D-007·FR-012 4분기 중 `member` 칸,
 * public/private 무관하게 동일하다). 표현 컴포넌트(D-030 ①) — 데이터는 전부 props로만 받는다.
 *
 * **팀장 요청으로 링크 모음에서 탭 셸이 됐다.** 이전에는 게시판·채팅·크루원·설정으로 나가는
 * 버튼 네 개가 전부였다 — 크루에 들어와도 크루가 뭘 해 왔는지, 지금 무슨 투표가 도는지 알 수
 * 없고 매번 다른 화면으로 나갔다 돌아와야 했다. 이제 모임투표·게시판·활동내역·활동사진·
 * 크루원·채팅이 이 한 화면의 탭이고, 헤더(크루 이름·소개·인원)는 탭을 바꿔도 그대로 있다.
 *
 * **크루 설정만 탭이 아니라 바깥 링크로 남는다** — 나머지 여섯이 "이 크루를 보는" 방법인 데
 * 비해 설정은 "이 크루를 고치는" 자리이고, 임원 이상에게만 보인다. 탭 줄에 조건부로 나타났다
 * 사라지는 항목이 있으면 탭 순서가 사람마다 달라진다.
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
  activeTab,
  children,
}: CrewHomeProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CrewColorDot colorIndex={colorIndex} />
              <h1 className="font-heading text-lg font-medium text-foreground">{name}</h1>
              <Badge variant="outline">{category}</Badge>
              {/* 공개 범위 배지 — 코드값을 키로 라벨을 꺼낸다(`CrewCreateForm`의 라디오와 같은
                  소스). 삼항으로 두 갈래를 적어 두면 공개 범위가 늘 때 이 자리가 조용히
                  틀린 라벨을 보여준다. */}
              <Badge variant="secondary">{strings.crew.create.visibilityOptions[visibility].label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
            <p className="text-xs text-muted-foreground">
              {t((s) => s.crew.home.memberCount, { count: memberCount })}
            </p>
          </div>
          {canManageSettings && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              className="shrink-0"
              render={<Link href={getCrewSettingsHref(crewId)} />}
            >
              {strings.crew.settings.title}
            </Button>
          )}
        </div>
      </header>

      <CrewHomeTabs crewId={crewId} activeTab={activeTab} />

      {/* 탭 내용. 채팅 탭이 남은 높이를 다 쓰는 스크롤 영역이라 `min-h-0`가 필요하다 —
          없으면 flex 자식의 기본 `min-height: auto` 때문에 컨테이너가 늘어나 페이지 전체가
          두 번 스크롤된다. */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
