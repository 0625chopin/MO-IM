"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { logoutAction } from "@/lib/actions/logout";
import { strings, t } from "@/lib/strings";
import { cn } from "@/lib/utils";

import { isAuthenticated } from "./auth-session";
import { getAccountNavItems, getPrimaryNavItems, type NavItem } from "./nav-items";

import type { AuthSession } from "./auth-session";
import type { ReactNode } from "react";

/**
 * 전역 헤더 내비게이션(PRD §5 "헤더 — 전역 공통"). 표현 컴포넌트 — 세션은 props로만 받는다
 * (D-030 ①). 인증 상태 판정·조회는 `src/app/layout.tsx`가 `getAuthSession()`으로 수행한다.
 *
 * 데스크톱(md 이상)에서만 링크 목록을 인라인으로 보여준다. 360px 뷰포트(NFR-026)에서는 로고만
 * 남기고 나머지는 `MobileTabBar`가 맡는다 — 같은 항목을 두 군데 중복 렌더링하지 않기 위해서다.
 *
 * `usePathname`(클라이언트 전용 훅)을 쓰므로 `'use client'`가 필요하다. 이건 `lib/data`·
 * `lib/realtime` 같은 도메인 데이터 조회가 아니라 순수 내비게이션 UI 상태라 D-030 ①이 금지하는
 * "표현 컴포넌트의 데이터 조회"에 해당하지 않는다.
 *
 * **디자인 개편에서 바뀐 것**
 * - 손으로 짠 스켈레톤 `div`와 배지 `span`을 `Skeleton`·`Badge`(shadcn)로 교체했다.
 * - 활성 표시를 배경 칠(`bg-muted`)에서 **하단 잉크 바**로 바꿨다. 배경 칠은 화면에 색 면적을
 *   늘리는데, 이 앱에서 색 면적은 크루 식별(`--crew-*`)에 배정된 자원이다 — 크롬이 면을
 *   차지할수록 캘린더의 크루색이 상대적으로 약해진다. 밑줄은 "지금 여기"라는 위치 정보를
 *   면적 없이 전달한다.
 * - 워드마크를 모노 서체로 세웠다. `mo_im`은 소문자와 언더스코어로 된 식별자꼴 이름이라
 *   모노가 그 성격을 그대로 읽어 준다.
 *
 * **`notificationBell`(Task 023)**: `nav-items.ts`가 만드는 정적 "알림" 항목(세션의
 * `unreadNotificationCount` 배지) 대신, 그 자리에 실시간 구독을 갖는
 * `NotificationBellServerContainer`(서버에서 조립돼 슬롯으로 내려온 노드)를 끼워 넣는다.
 * `HeaderNav` 자신은 여전히 `'use client'`라 그 컨테이너를 직접 import할 수 없으므로(RSC
 * 경계), 부모(`AppShell`, 서버 컴포넌트)가 조립해 prop으로 넘기는 합성 패턴을 쓴다. 슬롯이
 * 없으면(예: `/sample`에서 `AppShell`을 데모로 그릴 때, 또는 게스트라 `null`이 내려온 경우)
 * 기존 정적 `NavLink`로 안전하게 폴백한다.
 */
export function HeaderNav({
  session,
  notificationBell,
}: {
  session: AuthSession;
  notificationBell?: ReactNode;
}) {
  const pathname = usePathname();
  const homeHref = session.status === "authenticated" ? "/home" : "/";

  if (session.status === "loading") {
    return (
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-6 px-4" aria-busy="true">
          <Skeleton className="h-5 w-20" />
          <div className="hidden flex-1 items-center gap-3 md:flex">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-16" />
            ))}
          </div>
          {/* 테마 토글은 세션 상태와 무관하므로 로딩 중에도 항상 조작할 수 있게 둔다. */}
          <div className="ml-auto md:ml-0">
            <ThemeToggle />
          </div>
        </div>
      </header>
    );
  }

  const primaryItems = getPrimaryNavItems(session);
  const accountItems = getAccountNavItems(session);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
      {session.status === "error" && (
        <p
          role="alert"
          className="border-b border-destructive/20 bg-destructive/8 px-4 py-1.5 text-center text-xs text-destructive"
        >
          {session.reason === "forbidden"
            ? strings.error.forbidden.title
            : strings.error.network.title}
        </p>
      )}
      <div className="flex h-14 items-center gap-6 px-4">
        <Link
          href={homeHref}
          className="shrink-0 rounded-md font-mono text-base font-medium tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {strings.common.appName}
        </Link>

        <nav
          aria-label={strings.common.a11y.primaryNav}
          className="hidden flex-1 items-center gap-1 md:flex"
        >
          {primaryItems.map((item) =>
            item.key === "notifications" && notificationBell ? (
              <span key={item.key}>{notificationBell}</span>
            ) : (
              <NavLink key={item.key} item={item} active={pathname === item.href} />
            ),
          )}
        </nav>

        <nav
          aria-label={strings.common.a11y.accountNav}
          className="hidden items-center gap-1 md:flex"
        >
          {accountItems.map((item) => (
            <NavLink key={item.key} item={item} active={pathname === item.href} />
          ))}
          {/* FR-002 로그아웃(Task 030) — 세션 폐기는 Server Action 하나로 충분해 별도
              nav-items.ts 항목(링크)이 아니라 폼 버튼으로 둔다. */}
          {isAuthenticated(session) && (
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {strings.auth.logout}
              </button>
            </form>
          )}
        </nav>

        {/* 데스크톱에서는 flex-1 주 내비가 이 묶음을 오른쪽으로 밀어 계정 메뉴 옆에 붙는다.
            모바일에서는 주·계정 내비가 숨겨져 `ml-auto`가 토글을 오른쪽 끝으로 보낸다. */}
        <div className="ml-auto md:ml-0">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const count = item.badgeCount ?? 0;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        // 활성 표시는 하단 잉크 바 — 위 컴포넌트 주석의 "색 면적" 근거 참고.
        "after:pointer-events-none after:absolute after:inset-x-2.5 after:-bottom-[9px] after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity",
        active
          ? "text-foreground after:opacity-100"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {item.label}
      {count > 0 && (
        <>
          {/* 숫자는 시각 장식이라 가리고, 개수는 링크 이름에 문장으로 덧붙인다.
              배지가 "9+"로 줄여 표시해도 스크린 리더에는 실제 개수가 간다. */}
          <Badge
            aria-hidden="true"
            variant="destructive"
            className="ml-0.5 h-4 min-w-4 px-1 font-mono text-[10px] tnum"
          >
            {count > 9 ? "9+" : count}
          </Badge>
          <span className="sr-only">{t((s) => s.common.a11y.unreadCount, { n: count })}</span>
        </>
      )}
    </Link>
  );
}
