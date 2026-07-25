import { AccountWithdrawSection } from "@/components/profile/AccountWithdrawSection";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { ProfileEditForm } from "@/components/profile/ProfileEditForm";
import { UserSearchField } from "@/components/profile/UserSearchField";
import type { AuthSession } from "@/components/shell/auth-session";
import { getProfileById, listCrewsByProfile } from "@/lib/data";
import { canChangeHandle } from "@/lib/rules/handle-validation";
import { strings } from "@/lib/strings";

/**
 * 계정 설정 컨테이너(SC-19, FR-004·006, Task 015B, D-030 ①). `page.tsx`가 이미
 * `getAuthSession()`으로 인증 가드를 통과시킨 `session`을 그대로 받는다(`OnboardingFormContainer`
 * 와 같은 이유 — 중복 쿠키 조회를 피한다).
 *
 * **핸들 변경 쿨다운 판정(FR-004 AC1)을 여기서 계산해 `ProfileEditForm`에 내려준다** —
 * `lib/rules/handle-validation.ts`의 `canChangeHandle`이 유일한 판정 지점이고, 표현
 * 컴포넌트는 그 결과만 받는다(팀장 지침 4번). 컨테이너가 `now`를 만들어 순수 함수에 인자로
 * 넘긴다 — 판정 함수 자신은 `Date.now()`를 직접 부르지 않는다(`canChangeHandle` docstring).
 *
 * `profile`이 null인 경우(세션은 있는데 프로필 레코드가 없는 Mock 경쟁 조건)는
 * `OnboardingFormContainer`가 이미 겪은 것과 같은 엣지 케이스다 — 예외를 던지지 않고
 * `ProfileCard`의 `empty` 상태로 표현한다(D-030 ③).
 */
export async function AccountSettingsContainer({
  session,
}: {
  session: Extract<AuthSession, { status: "authenticated" }>;
}) {
  const profile = await getProfileById(session.profileId);
  // FR-005 AC1(Task 039) — 탈퇴 섹션이 "오너로 있는 활성 크루" 목록을 보여주려면 미리
  // 조회해 둬야 한다. `listCrewsByProfile`은 소속 크루 전체를 반환하므로 오너·활성 조건은
  // 여기서(컨테이너) 거른다 — `lib/data`에 이 조합만을 위한 새 쿼리 함수를 추가하지 않았다
  // (DESIGN 소유 파일 최소 침습 원칙, `request_account_deactivation` RPC가 최종 판정을
  // 다시 하므로 이 필터링은 표시 전용이다).
  const ownedActiveCrews = (await listCrewsByProfile(session.profileId))
    .filter((crew) => crew.ownerId === session.profileId && crew.status === "active")
    .map((crew) => ({ id: crew.id, name: crew.name }));

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-lg p-4 sm:p-6">
        <ProfileCard
          handle=""
          displayName=""
          bio={null}
          avatarUrl={null}
          searchOptOut={false}
          status="empty"
        />
      </div>
    );
  }

  const now = new Date().toISOString();
  const handleEligibility = canChangeHandle(profile.handleChangedAt, now);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 p-4 sm:p-6">
      <ProfileCard
        handle={profile.handle}
        displayName={profile.displayName}
        bio={profile.bio}
        avatarUrl={profile.avatarUrl}
        searchOptOut={profile.searchOptOut}
      />

      <ProfileEditForm
        profile={{
          handle: profile.handle,
          displayName: profile.displayName,
          bio: profile.bio,
          searchOptOut: profile.searchOptOut,
        }}
        handleEligibility={handleEligibility}
      />

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-medium text-foreground">{strings.account.search.heading}</h2>
          <p className="text-sm text-muted-foreground">{strings.account.search.description}</p>
        </div>
        <UserSearchField />
      </section>

      <AccountWithdrawSection ownedActiveCrews={ownedActiveCrews} />
    </div>
  );
}
