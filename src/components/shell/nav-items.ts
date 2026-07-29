import {
  Bell,
  CalendarDays,
  Home,
  LogIn,
  Mail,
  Search,
  UserRound,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { strings } from "@/lib/strings";

import { isAuthenticated, type AuthSession } from "./auth-session";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** 알림처럼 미확인 개수를 배지로 보여줘야 하는 항목만 채운다. */
  badgeCount?: number;
}

/**
 * PRD §5 "메뉴 구조 — 헤더(전역 공통)"의 홈·크루 탐색·통합 캘린더·알림 4항목.
 * 캘린더·알림은 로그인 필요(PRD §2.2 접근 표에서 비회원 "−")라 게스트에게는 내려주지 않는다.
 *
 * `error`·`loading` 상태는 안전하게 게스트와 동일히 취급한다 — 세션 조회가 불확실할 때
 * 로그인 전용 항목을 노출하지 않는 쪽이 안전하다(D-030 ③, fail-closed).
 */
export function getPrimaryNavItems(session: AuthSession): NavItem[] {
  const items: NavItem[] = [
    {
      key: "home",
      label: strings.nav.home,
      href: isAuthenticated(session) ? "/home" : "/",
      icon: Home,
    },
    {
      key: "crew-explore",
      // PRD §5 헤더 항목 "크루 탐색"과 /crews 페이지 제목이 완전히 같은 뜻이라
      // crew.explore.title을 그대로 재사용한다(strings/README.md §4 "동일하게 쓰이면
      // 공유" 원칙). 한때 있던 strings.nav.crews("내 크루")는 3일차 교차검증에서 CREW·팀장
      // 판정으로 삭제됐다 — PRD에 "내 크루"라는 독립 nav 항목이 없었다.
      label: strings.crew.explore.title,
      href: "/crews",
      icon: Search,
    },
  ];

  if (isAuthenticated(session)) {
    items.push(
      {
        key: "calendar",
        label: strings.nav.calendar,
        href: "/calendar",
        icon: CalendarDays,
      },
      {
        key: "notifications",
        label: strings.nav.notifications,
        href: "/notifications",
        icon: Bell,
        badgeCount: session.unreadNotificationCount,
      },
    );
  }

  return items;
}

/**
 * PRD §5 "계정 메뉴" 하위 항목. 로그인 여부로 완전히 다른 목록이다(로그인/회원가입 ↔ 계정
 * 설정/받은 초대함).
 *
 * **로그아웃은 여기 없다** — Task 030에서 실제 세션 종료 로직(`logoutAction`)이 생긴 뒤에도
 * `NavItem`으로 만들지 않았다. 이 목록의 항목은 전부 `href`를 가진 링크인데 로그아웃은 이동이
 * 아니라 POST(세션 폐기)라 모양이 맞지 않는다. 대신 `LogoutButton`(`components/auth/`)을 폼
 * 버튼으로 두 자리에 세운다 — `HeaderNav`의 계정 내비, 그리고 `/settings`의 로그아웃 섹션.
 * 후자가 지금 실제로 보이는 유일한 진입점이다(그 컴포넌트 docstring의 프레임 폭 설명 참고).
 */
export function getAccountNavItems(session: AuthSession): NavItem[] {
  if (isAuthenticated(session)) {
    return [
      {
        key: "account-settings",
        label: strings.account.settings.title,
        href: "/settings",
        icon: UserRound,
      },
      {
        key: "invitations",
        label: strings.invitation.inbox.title,
        href: "/invitations",
        icon: Mail,
      },
    ];
  }

  return [
    { key: "login", label: strings.auth.login.title, href: "/login", icon: LogIn },
    { key: "signup", label: strings.auth.signup.title, href: "/signup", icon: UserPlus },
  ];
}
