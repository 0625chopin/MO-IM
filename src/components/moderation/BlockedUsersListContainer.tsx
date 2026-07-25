import { getProfileById, listMyBlockedProfileIds } from "@/lib/data";
import { strings } from "@/lib/strings";

import { BlockedUsersList, type BlockedUserRowViewModel } from "./BlockedUsersList";

/**
 * FR-081 계정 설정 "차단한 사용자" 컨테이너(Task 042A, D-030 ① — 조회를 소유하고 표현
 * 컴포넌트에 props로 내려준다). `AccountSettingsPage`(`/settings`)가 조립한다.
 *
 * 세션은 이 컨테이너가 직접 확인하지 않는다 — `listMyBlockedProfileIds`가 이미 세션(RLS
 * `blocks_select_self`)으로 필터링된 값만 반환하므로(모듈 docstring), 인증되지 않은 상태로는
 * 애초에 도달하지 않는다(`(app)/layout.tsx`가 이 라우트 트리 전체를 가드한다, D-030 ④).
 *
 * **NFR-013 필드 최소화(I-058 교훈)** — 차단 목록에 사용자 정보를 붙일 때 `getProfileById`
 * (타인 행은 `get_profile_public_by_id` RPC로 자동 폴백, `profile.ts` 모듈 docstring)만 쓴다.
 * 이 함수가 반환하는 필드 중 `handle`·`displayName`·`avatarUrl` 3개만 뷰모델에 옮긴다 — `bio`
 * 등 나머지는 애초에 이 RPC가 채우지 않는다.
 */
export async function BlockedUsersListContainer() {
  const blockedIds = await listMyBlockedProfileIds();

  const blockedUsers: BlockedUserRowViewModel[] = (
    await Promise.all(
      blockedIds.map(async (id) => {
        const profile = await getProfileById(id);
        if (!profile) return null;
        return {
          id,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        };
      }),
    )
  ).filter((row): row is BlockedUserRowViewModel => row !== null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-medium text-foreground">
          {strings.block.manage.title}
        </h2>
        <p className="text-sm text-muted-foreground">{strings.block.manage.description}</p>
      </div>
      <BlockedUsersList blockedUsers={blockedUsers} />
    </section>
  );
}
