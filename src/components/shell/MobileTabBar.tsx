"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { strings, t } from "@/lib/strings";
import { cn } from "@/lib/utils";

import { getAccountNavItems, getPrimaryNavItems, type NavItem } from "./nav-items";

import type { AuthSession } from "./auth-session";

/**
 * 360px 뷰포트(NFR-026)의 1차 내비게이션. `md` 이상에서는 `HeaderNav`가 같은 정보를 인라인
 * 링크로 이미 보여주므로 숨긴다(`md:hidden`) — 항목을 두 군데서 중복 렌더링하지 않는다.
 * 그 `md:`는 이제 **뷰포트가 아니라 앱 프레임 폭** 기준이다(`globals.css`의 `@custom-variant`
 * 블록) — 프레임이 430px로 묶여 있는 한 이 탭바는 넓은 화면에서도 계속 보이고, `HeaderNav`의
 * 인라인 링크는 계속 숨는다. 즉 대화면에서도 내비게이션은 한 벌만 남는다.
 *
 * **`fixed`라서 폭을 직접 프레임에 맞춰야 한다.** `fixed`의 containing block은 뷰포트다. 프레임의
 * `@container/appframe`이 이걸 바꿔 주지 않는다 — `container-type: inline-size`가 fixed 자손의
 * containing block이 된다고 기대하기 쉬우나, **그렇지 않다**(1440px 실측: 프레임 안에 넣은
 * `position:fixed; inset:0` 요소의 폭이 프레임 430px이 아니라 뷰포트 1425px로 나온다). 그래서
 * `inset-x-0`을 쓰면 탭바만 프레임을 뚫고 여백면 위로 늘어난다.
 *
 * `left-1/2` + `-translate-x-1/2` + `max-w-app`으로 뷰포트 중앙에 프레임과 같은 폭으로 세워
 * 맞춘다 — `AppShell`이 `mx-auto`로 프레임을 중앙에 두므로 두 중심선이 일치한다. 폭 상한을
 * 프레임과 같은 토큰(`max-w-app`)에서 가져오므로 프레임 폭을 바꾸면 탭바도 함께 따라간다.
 *
 * 프레임에 `transform`을 걸어 containing block을 만드는 우회는 **쓰면 안 된다**. 그러면 이 탭바가
 * 뷰포트가 아니라 프레임에 고정돼, 스크롤할 때 화면에 머무르지 않고 문서와 함께 흘러간다.
 *
 * 게스트는 홈·크루 탐색·로그인·회원가입 4항목, 로그인 사용자는 홈·크루 탐색·캘린더·알림·
 * 계정 설정 5항목이다(계정 메뉴 전체를 담을 팝오버 컴포넌트가 아직 없어 — Task 013 — 계정
 * 진입점으로 계정 설정 하나만 노출한다).
 *
 * 터치 대상은 44×44 CSS px 권장(NFR-027)을 만족하도록 `min-h-11`을 준다.
 *
 * **디자인 개편에서 바뀐 것**
 * - 스켈레톤·배지를 shadcn 프리미티브로 교체하고, 배지 개수를 스크린 리더에 문장으로 전달한다.
 * - 활성 표시를 **상단 잉크 바**로 세웠다(`HeaderNav`의 하단 바와 대칭 — 둘 다 화면 바깥쪽
 *   가장자리에 붙는다). 색 면적을 크루 팔레트에 남겨 두려는 같은 이유다.
 * - iOS 홈 인디케이터 영역을 피하도록 `env(safe-area-inset-bottom)`만큼 아래 여백을 준다.
 *   이게 없으면 실제 아이폰에서 마지막 탭의 라벨이 제스처 바에 가린다. `AppShell`의 콘텐츠
 *   하단 여백도 같은 값을 더해 맞춰 놨다.
 */
export function MobileTabBar({ session }: { session: AuthSession }) {
  const pathname = usePathname();

  if (session.status === "loading") {
    return (
      <nav
        aria-hidden="true"
        className="fixed bottom-0 left-1/2 z-40 flex h-14 w-full max-w-app -translate-x-1/2 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-1 items-center justify-center">
            <Skeleton className="size-6 rounded-full" />
          </div>
        ))}
      </nav>
    );
  }

  const primaryItems = getPrimaryNavItems(session);
  const accountItems = getAccountNavItems(session);
  const items =
    session.status === "authenticated"
      ? [...primaryItems, accountItems[0]]
      : [...primaryItems, ...accountItems];

  return (
    <nav
      aria-label={strings.common.a11y.primaryNav}
      className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-app -translate-x-1/2 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => (
        <TabLink key={item.key} item={item} active={pathname === item.href} />
      ))}
    </nav>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const count = item.badgeCount ?? 0;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
        // 활성 표시는 탭 상단 가장자리의 잉크 바.
        "before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-full before:bg-foreground before:opacity-0 before:transition-opacity",
        active ? "text-foreground before:opacity-100" : "text-muted-foreground",
      )}
    >
      <span className="relative">
        <Icon aria-hidden="true" className="size-5" />
        {count > 0 && (
          <Badge
            aria-hidden="true"
            variant="destructive"
            className="absolute -top-1.5 -right-2 h-3.5 min-w-3.5 px-1 font-mono text-[9px] leading-none tnum"
          >
            {count > 9 ? "9+" : count}
          </Badge>
        )}
      </span>
      {item.label}
      {count > 0 && (
        <span className="sr-only">{t((s) => s.common.a11y.unreadCount, { n: count })}</span>
      )}
    </Link>
  );
}
