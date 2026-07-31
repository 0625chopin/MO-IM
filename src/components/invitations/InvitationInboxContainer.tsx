import type { InvitationRowViewModel } from "@/components/invitations/invitation-view-models";
import { InvitationList } from "@/components/invitations/InvitationList";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewById, getProfileById, listInvitationsForProfile } from "@/lib/data";
import { strings } from "@/lib/strings";
import type { Invitation } from "@/lib/types";

/**
 * 받은 초대함 컨테이너(SC-20, FR-021·028, D-030 ①, Task 017B) — 로그인 사용자가 받은 대기 중
 * 크루 초대 목록을 조립하는 단일 지점이다.
 *
 * `(app)/invitations`는 이미 `(app)/layout.tsx`가 인증을 보장하는 트리 안이라
 * `isAuthenticated` 조기 반환으로 타입만 좁힌다(`NotificationCenterContainer`와 같은 패턴,
 * 실제 리다이렉트는 하지 않는다).
 *
 * **24일차(I-095)** — 원래 throw 기반 `assertAuthenticatedSession`을 썼다. 경위·대체 패턴
 * 근거는 `@/components/shell/auth-session.ts` 모듈 docstring 참고.
 *
 * **대기 중(`pending`)만 보여준다** — 응답 완료(`accepted`·`declined`)·만료(`expired`) 건은
 * "받은 초대함"이 답할 목록이 아니다(FR-021이 정의하는 이 화면의 역할은 지금 응답이 필요한
 * 초대뿐이다). 크루가 이미 삭제됐거나(방어적 케이스, Mock에서는 발생하지 않는다) 초대를 보낸
 * 프로필을 찾을 수 없는 항목은 조용히 건너뛴다 — 고아 레코드를 화면에 반쪽짜리로 보여주는
 * 것보다 안전하다.
 */
export async function InvitationInboxContainer() {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095).
    return null;
  }

  const pendingInvitations = await listInvitationsForProfile(session.profileId, "pending");

  const rows = (
    await Promise.all(pendingInvitations.map((invitation) => toInvitationRowViewModel(invitation)))
  ).filter((row): row is InvitationRowViewModel => row !== null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{strings.invitation.inbox.description}</p>
      <InvitationList invitations={rows} />
    </div>
  );
}

async function toInvitationRowViewModel(invitation: Invitation): Promise<InvitationRowViewModel | null> {
  const [crew, inviter] = await Promise.all([
    getCrewById(invitation.crewId),
    getProfileById(invitation.inviterId),
  ]);
  if (!crew) return null;

  return {
    id: invitation.id,
    crewId: crew.id,
    crewName: crew.name,
    crewColorIndex: isCrewColorKnown(crew) ? crew.colorKey : null,
    inviterDisplayName: inviter?.displayName ?? strings.common.profile.unknownAuthor,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * **I-158 처분(33일차)** — 이 컨테이너는 `getCrewById`의 private+비소속 폴백을 실제로 탈 수
 * 있는 소비자다(`src/lib/data/supabase/crew.ts` `getCrewById` docstring이 정확히 이 상황을
 * 예고했었다). 초대함은 정의상 아직 그 크루의 활성 멤버가 아닌 사람에게 보여주는 화면이라,
 * `crews_select_authenticated` RLS(활성 멤버십·오너·public만 direct select 통과, D-007)가
 * private 크루에서 항상 막혀 그 폴백으로 떨어진다 — 폴백은 `colorKey`를 `0`으로 하드코딩한다.
 *
 * **왜 `crew.visibility`가 아니라 `ownerId`로 판정하는가**: "private이면 폴백이다"는 오늘은
 * 맞지만 *이 컨테이너가 항상 비소속자에게만 불린다*는 전제에 기대는 간접 추론이다. 폴백
 * 객체는 `ownerId`도 `""`로 채운다(같은 하드코딩) — **`crews.owner_id`가 `uuid` 타입이라
 * `""`가 애초에 그 컬럼에 담길 수 있는 값이 아니다**(33일차 CREW 교차검증 지적·팀장 독립
 * 재확인: `information_schema.columns`로 `data_type=uuid`, `select ... where owner_id=''`는
 * `22P02 invalid input syntax for type uuid`로 즉시 거부됨을 실측). **`NOT NULL`만으로는 이
 * 논증이 서지 않는다** — 예를 들어 `description`도 `crews.owner_id`와 마찬가지로 폴백이
 * `""`로 채우는 필드지만, 실제 컬럼은 `text NOT NULL DEFAULT ''::text`라 **정상 크루도
 * 설명을 비워 두면 진짜로 `description === ""`일 수 있다** — `description`을 센티넬로
 * 썼다면 설명 없는 정상 크루의 색까지 "미확인"으로 오탐했을 것이다. `ownerId`가 안전한
 * 이유는 "비어 있을 수 없어서"(NOT NULL, `description`도 마찬가지)가 아니라 **"타입상 빈
 * 문자열이 유효한 값 자체가 아니어서"**다. 그래서 `ownerId === ""`는 "이 `Crew`가 폴백에서
 * 왔다"를 직접 관측하는 신호이고, 호출 맥락(누가 언제 부르는가)이 바뀌어도 깨지지 않는다.
 *
 * **이 판정은 이 파일에만 있다 — 강제력이 없다.** `getCrewById`의 다음 새 소비자가 같은
 * 함정(I-154·I-158 계통)을 또 밟지 않으려면 이 판정을 복사하거나(휘발성 높음), 데이터
 * 계층이 타입으로 "모를 수 있음"을 드러내야 한다(후속 후보 ①, 이번엔 채택하지 않음 — 근거는
 * `docs/DECISIONS.draft.DESIGN.md` 참고).
 */
function isCrewColorKnown(crew: { ownerId: string }): boolean {
  return crew.ownerId !== "";
}
