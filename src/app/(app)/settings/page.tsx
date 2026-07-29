import { BlockedUsersListContainer } from "@/components/moderation/BlockedUsersListContainer";
import { NotificationPreferencesContainer } from "@/components/notifications/NotificationPreferencesContainer";
import { AccountSettingsContainer } from "@/components/profile/AccountSettingsContainer";
import { assertAuthenticatedSession } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { PageHeader } from "@/components/shell/PageHeader";
import { strings } from "@/lib/strings";

/**
 * 계정 설정 페이지 (SC-19, PRD §6 "계정 설정 페이지", FR-004·006, Task 015B). 경로는
 * requirements.md 5.1.1절 계획대로 `/settings`를 쓴다(`/crews/[crewId]/settings`(SC-15,
 * 크루 설정)와 세그먼트 깊이가 달라 경로 충돌이 없다).
 *
 * `page.tsx`는 얇은 껍데기다(`docs/CONVENTIONS.md` "src/app/은 라우팅과 조립만 한다") — 이
 * 화면의 범위는 프로필 조회·수정(FR-004: 표시 이름·핸들·소개·검색 노출)과 핸들 검색 필드
 * (FR-006)·알림 환경설정(FR-072)이다 — 탈퇴(FR-005)는 다른 Task(CREW의 Task 039 등) 몫이라
 * 이번 회차에 채우지 않는다.
 *
 * **20일차(Task 042A) 추가 — 차단 관리(FR-081)**. `BlockedUsersListContainer`를 이 페이지에
 * 직접 조립했다. 새 라우트를 만들지 않은 이유는 이 화면이 이미 "계정" 스코프 설정의 자연스러운
 * 연장이라서다(핸들 검색·프로필 수정과 같은 층위) — 새 세그먼트는 그만큼 배선을 늘린다.
 *
 * **22일차(Task 044) 추가 — 알림 환경설정(FR-072)**. `NotificationPreferencesContainer`를
 * `BlockedUsersListContainer`와 같은 자리·같은 이유로 이어 붙였다(로드맵 재배정으로 담당이
 * CORE로 옮겨 왔다 — 위 "Task 039 등이 072를 담당한다"던 이전 서술은 이번에 바로잡는다).
 *
 * **인증 가드는 더 이상 여기 없다** — 6일차부터 `(app)/layout.tsx`가 이 라우트 그룹 전체의
 * 가드를 한 곳에서 맡는다(D-030 ④, I-025 해소). 이 페이지가 렌더된다는 것 자체가 그 레이아웃을
 * 이미 통과했다는 뜻이다. `assertAuthenticatedSession`(`@/components/shell/auth-session.ts`,
 * 6일차 CORE 재검증 E-1로 공용화)은 리다이렉트용이 아니라 `AccountSettingsContainer`가
 * 요구하는 **좁혀진(narrowed) 세션 타입**을 만들기 위해서만 필요하다 — 그 함수 docstring이
 * `throw`를 고른 이유를 설명한다.
 */
export default async function AccountSettingsPage() {
  const session = await getAuthSession();
  assertAuthenticatedSession(session);

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={strings.account.settings.title}
        description={strings.account.settings.description}
      />
      <AccountSettingsContainer session={session} />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-6 sm:px-6">
        <NotificationPreferencesContainer session={session} />
        <BlockedUsersListContainer />
      </div>
    </main>
  );
}
