import { CalendarCheck, Images, MessageSquare, NotebookPen, Users, Vote } from "lucide-react";
import Link from "next/link";

import { CREW_HOME_TABS, type CrewHomeTab } from "@/components/crews/crew-home-tabs";
import { getCrewHomeTabHref } from "@/components/crews/crew-links";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";
import { cn } from "@/lib/utils";

import type { ComponentType, SVGProps } from "react";

const TAB_ICONS: Record<CrewHomeTab, ComponentType<SVGProps<SVGSVGElement>>> = {
  activity: CalendarCheck,
  votes: Vote,
  posts: NotebookPen,
  photos: Images,
  members: Users,
  chat: MessageSquare,
};

/**
 * 크루 홈 탭 내비(팀장 요청). **`components/ui/tabs`(Base UI)를 쓰지 않는다** — 그 프리미티브는
 * 패널을 클라이언트 상태로 전환하므로 모든 탭의 내용을 미리 렌더해 들고 있어야 한다. 여기서는
 * 탭마다 서버에서 다른 데이터를 조회하므로(채팅 한 방, 사진 60장, 지난 모임 전부) 링크 이동이
 * 맞다 — 보고 있지 않은 탭의 데이터를 조회할 이유가 없고, 탭 상태가 URL에 남아 공유·새로고침에
 * 살아남는다.
 *
 * 그래서 시맨틱도 `role="tablist"`가 아니라 **링크 목록**이다. 화살표 키 이동을 알리고 구현하지
 * 않는 위젯을 만드느니(디자인 언어 문서 §0의 4번 문제와 같은 함정) 링크가 링크처럼 동작하게
 * 둔다 — 활성 항목은 `aria-current="page"`로 알린다.
 *
 * 활성 표시는 하단 **잉크 바**다(`HeaderNav`와 같은 표현) — 크루색을 쓰지 않는다. 디자인 언어
 * 규칙 ① "채도는 데이터만 쓴다": 이 화면에서 크루색은 이미 헤더의 색 점 하나가 가져갔고,
 * 탭까지 물들이면 색 면적이 크루 식별이 아니라 장식으로 새어 나간다.
 */
export function CrewHomeTabs({
  crewId,
  activeTab,
}: {
  crewId: Id;
  activeTab: CrewHomeTab;
}) {
  return (
    <nav
      aria-label={strings.crew.home.tabsLabel}
      // 모바일에서 6개 탭이 한 줄에 안 들어간다. 줄바꿈 대신 가로 스크롤을 쓴다 — 두 줄이 되면
      // 헤더와 내용 사이 간격이 탭 개수에 따라 들쭉날쭉해진다.
      className="-mx-4 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max min-w-full items-stretch gap-1">
        {CREW_HOME_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          const active = tab === activeTab;
          return (
            <li key={tab}>
              <Link
                href={getCrewHomeTabHref(crewId, tab)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-t-md px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  "after:pointer-events-none after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity",
                  active
                    ? "text-foreground after:opacity-100"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {strings.crew.home.tabs[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
