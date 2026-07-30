import type { InvitationRowViewModel } from "@/components/invitations/invitation-view-models";
import { InvitationList } from "@/components/invitations/InvitationList";
import { InvitationListSkeleton } from "@/components/invitations/InvitationListSkeleton";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { defineSection } from "@/components/sample/showcase-types";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";

import type { ReactNode } from "react";

/** `poll.tsx`의 `LabeledDemo`와 같은 패턴 — "오류" 패널 하나에 도메인 오류 여러 종을
 *  나란히 보여줄 때 각 예시에 짧은 캡션을 붙인다. */
function LabeledDemo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** `InvitationList` 데모용 고정 데이터(Task 017B) — `CrewInboxContainer`가 만드는 조인 결과
 *  모양을 손으로 채운 것이다(`crews.tsx`의 `SAMPLE_CREW_CARDS`와 같은 패턴).
 *
 *  **세 번째 항목(`invitation-3`) — 33일차, I-158 처분.** `crewColorIndex: null`은
 *  `getCrewById`의 private+비소속 폴백이 실제 크루 색을 모르는 상태(`InvitationInboxContainer`
 *  docstring 참고)를 재현한다. 이 항목이 없으면 다음 사람이 "크루 색 미확인" 상태를 화면에서
 *  볼 방법이 없다(팀장 배정 지시). */
const SAMPLE_INVITATIONS: InvitationRowViewModel[] = [
  {
    id: "invitation-1",
    crewId: "crew-1",
    crewName: "주말 러닝 크루",
    crewColorIndex: 0,
    inviterDisplayName: "서지훈",
    expiresAt: "2026-08-07T00:00:00.000Z",
  },
  {
    id: "invitation-2",
    crewId: "crew-7",
    crewName: "IT 커리어 스터디",
    crewColorIndex: 7,
    inviterDisplayName: "김유나",
    expiresAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "invitation-3",
    crewId: "crew-private-unknown-color",
    crewName: "비공개 독서 모임",
    crewColorIndex: null,
    inviterDisplayName: "박서연",
    expiresAt: "2026-08-10T00:00:00.000Z",
  },
];

/**
 * SC-20 받은 초대함(FR-021·028, Task 017B). 실제 라우트는 `/invitations`. 수락·거절 버튼은
 * 실제 `respondToInvitationAction`을 호출한다 — `/sample`은 게스트 세션이라 눌러도
 * `sessionExpired` 폼 오류로 안전하게 막힌다(`InviteMemberDialog`와 같은 근거). "오류" 패널은
 * 버튼 클릭이 아니라 `ErrorState` 원자로 재현한다 — `useActionState`의 폼 오류는 실제 제출
 * 후에만 생기는 값이라 `/sample`이 그 자리를 미리 채울 수 없기 때문이다(`JoinRequestPanel`의
 * "오류" 패널과 같은 이유). **10일차 접근성 QA 이슈 C 해소** — `evaluateInvitationResponseEligibility`
 * (`lib/rules/invitation-response-eligibility.ts`)의 도메인 오류 3종(이미 응답함·크루 해산·
 * 만료)을 전부 나란히 보여준다(D-030 ③, `PollBallot`이 여러 대상자 부적격 사유를 나란히
 * 보여주는 것과 같은 패턴) — 만료 1종만 있던 이전 버전은 완결성이 부족했다.
 */
export const invitationsSection = defineSection({
  id: "invitations",
  label: "받은 초대함",
  title: "받은 초대함",
  description:
    "FR-021·028(D-002·D-016). 실제 라우트는 /invitations — 크루명·초대자·만료일을 카드로 보여주고, 수락하면 즉시 크루원(active)이 되어 크루 홈으로 이동하며 거절해도 재초대가 가능합니다(InvitationList). 세 번째 카드(비공개 독서 모임)는 크루 색을 모를 때(I-158, getCrewById private 폴백)의 중립 표시를 보여줍니다.",
  items: [
    {
      name: "InvitationList",
      panels: {
        default: (
          <PreviewFrame height={280}>
            <div className="p-4">
              <InvitationList invitations={SAMPLE_INVITATIONS} />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <div className="p-4">
              <InvitationListSkeleton />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={160}>
            <div className="p-4">
              <InvitationList invitations={[]} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={340}>
            <div className="flex flex-col gap-3 p-4">
              <LabeledDemo label="이미 응답한 초대(already_responded)">
                <ErrorState title={strings.invitation.inbox.errors.already_responded} />
              </LabeledDemo>
              <LabeledDemo label="크루가 해산됨(crew_unavailable, FR-021 E2)">
                <ErrorState title={strings.invitation.inbox.errors.crew_unavailable} />
              </LabeledDemo>
              <LabeledDemo label="만료된 초대(expired, FR-021 E1)">
                <ErrorState title={strings.invitation.inbox.errors.expired} />
              </LabeledDemo>
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
