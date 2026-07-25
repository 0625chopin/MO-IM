import type { RouteErrorKind } from "@/components/errors/route-error-kind";
import { RouteErrorBoundaryPreview } from "@/components/errors/RouteErrorBoundaryPreview";
import type {
  MeetupDetailViewModel,
  MeetupParticipantGroupsView,
  MeetupParticipantView,
} from "@/components/meetup/meetup-view-models";
import { MeetupAttendanceActions } from "@/components/meetup/MeetupAttendanceActions";
import { MeetupDetail } from "@/components/meetup/MeetupDetail";
import { MeetupDetailSkeleton } from "@/components/meetup/MeetupDetailSkeleton";
import { MeetupLifecycleActions } from "@/components/meetup/MeetupLifecycleActions";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { defineSection } from "@/components/sample/showcase-types";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";

import type { ReactNode } from "react";

/**
 * Meetup 상세(SC-17, FR-064·066~068) — Task 022. `MeetupDetail`은 순수 표현 컴포넌트라
 * `lib/data`를 참조하지 않는다(D-030 ①) — 아래 고정 데이터는 실제 컨테이너
 * (`MeetupDetailContainer`)가 만드는 조인 결과 모양을 그대로 손으로 채운 것이다
 * (`sections/board.tsx`의 `SAMPLE_POSTS`와 같은 패턴). 실제 화면은 `/meetups/[meetupId]`.
 *
 * **"MeetupDetail" 항목 자체는 기본·빈·로딩 3상태만 등록돼 있다** — "오류"는 이 컴포넌트가
 * 렌더할 몫이 아니라(크루원이 아니면 이 컴포넌트에 도달 자체가 안 되고, 정원 마감은 하위
 * `MeetupAttendanceActions`의 몫이다) 아래 두 도메인 오류 전용 항목으로 각각 등록했다
 * (`sections/board.tsx`의 `DOMAIN_ERROR_ITEMS` 패턴과 같다, D-030 ③). 이 문단이 실제 등록과
 * 어긋나면 R-006 재발이니 등록을 바꿀 때 함께 고친다(`MeetupDetail.tsx` 모듈 docstring도
 * 같은 서술을 갖고 있어 둘 다 고쳐야 한다).
 */

function participant(id: string, displayName: string): MeetupParticipantView {
  return { profileId: id, displayName, avatarUrl: null };
}

const DEMO_MEETUP: MeetupDetailViewModel = {
  id: "sample-meetup-detail",
  crewId: "sample-crew",
  title: "한강 5km 정기런",
  description:
    "다음 주 토요일 아침 7시, 한강공원 반포지구에서 만나요. 준비운동은 각자 해오시고 현장에서 스트레칭만 같이 합니다.",
  crewName: "새벽 러닝 크루",
  crewColorIndex: 5,
  date: "2026-08-14",
  dateLabel: "8월 14일 금요일",
  startTime: "07:00",
  place: "한강공원 반포지구",
  capacity: 20,
  attendingCount: 12,
  isCancelled: false,
  postHref: "#",
  pollTally: { forCount: 9, againstCount: 2, abstainCount: 1 },
  // FR-065(Task 041) — 제안자·임원·오너 시점 데모. `MeetupDetail`이 `canCancelOrUpdate`일
  // 때만 `MeetupLifecycleActions`를 붙인다.
  canCancelOrUpdate: true,
  boardWriteHref: "#",
};

const DEMO_PARTICIPANTS: MeetupParticipantGroupsView = {
  attending: [
    participant("sample-p1", "서지훈"),
    participant("sample-p2", "김유나"),
    participant("sample-p3", "이민준"),
  ],
  absent: [participant("sample-p4", "박서연")],
  noResponse: [participant("sample-p5", "최도현"), participant("sample-p6", "정하윤")],
};

const EMPTY_PARTICIPANTS: MeetupParticipantGroupsView = {
  attending: [],
  absent: [],
  noResponse: [
    participant("sample-p1", "서지훈"),
    participant("sample-p2", "김유나"),
    participant("sample-p3", "이민준"),
    participant("sample-p4", "박서연"),
  ],
};

const DOMAIN_ERROR_ITEMS: Array<{ kind: RouteErrorKind; name: string; note: string }> = [
  {
    kind: "forbidden",
    name: "Meetup 상세 — 크루원 아님 (FR-064 AC2, I-073 해소·D-048)",
    note: "FR-064 AC2 — 비소속 회원의 Meetup 상세 접근은 403이 반환돼야 한다. MeetupDetailContainer가 (app)/crews/[crewId]/layout.tsx(D-039)와 같은 방식(getCrewMembership + isActiveMembership)으로 다시 판정해 20일차부터 cause:{code:'forbidden'}을 던지지 않고 <RouteErrorBoundary kind=\"forbidden\"/>을 값으로 직접 반환한다(I-069 근본 해결). 20일차엔 meetups 테이블 RLS(meetups_select_members)가 비소속자에게 행 자체를 0건으로 숨겨 getMeetupById가 먼저 notFound()를 던지는 바람에 이 분기가 실제로는 도달하지 않았다(I-073) — 21일차에 getMeetupById가 getCrewById와 같은 '원본 0행 → private 최소정보 RPC(meetup_directory_summary) 폴백' 패턴을 갖추면서 해소됐다(D-048). 이제 비소속자는 이 forbidden 분기에 정상 도달한다. 상세: docs/prioritization-and-risks.md D-048, docs/decisions/domain-error-channel-069.md §6(경위 보존).",
  },
];

export const meetupSection = defineSection({
  id: "meetup",
  label: "Meetup 상세",
  title: "Meetup 상세 · 참석/불참 — MeetupDetail · MeetupAttendanceActions",
  description: (
    <>
      Meetup 상세(SC-17, FR-064·066~068, Task 022) — 정보·투표 결과 요약·정원 카운트·참석/불참
      응답·참석자 3구분 목록을 다룹니다. 정원 마감·참석 가능 여부 판정은{" "}
      <code>lib/rules/meetup-attendance-*.ts</code>의 순수 함수 몫입니다.
    </>
  ),
  items: [
    {
      name: "MeetupDetail",
      note: "정원 12/20 · 참석 3명 · 불참 1명 · 미응답 2명 예시입니다. '빈 상태'는 아직 아무도 응답하지 않은 경우(참석/불참 목록이 비어 '아직 없어요'가 표시됩니다)입니다. FR-064 AC1 — 시각·장소는 값이 있을 때만 표시되고(placeholder 없음), 정원 없는 Meetup은 '(정원 제한 없음)'으로 표시됩니다(default에서는 늘 정원이 있는 예시만 보여 이 분기는 코드로만 확인 가능 — capacity: null 케이스는 MeetupDetailViewModel 타입 참고).",
      panels: {
        default: (
          <PreviewFrame height={640}>
            <div className="mx-auto w-full max-w-md p-4">
              <MeetupDetail
                meetup={DEMO_MEETUP}
                participants={DEMO_PARTICIPANTS}
                attendanceState={{ kind: "open" }}
              />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={520}>
            <div className="mx-auto w-full max-w-md p-4">
              <MeetupDetail
                meetup={DEMO_MEETUP}
                participants={EMPTY_PARTICIPANTS}
                attendanceState={{ kind: "open" }}
              />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={640}>
            <div className="mx-auto w-full max-w-md p-4">
              <MeetupDetailSkeleton />
            </div>
          </PreviewFrame>
        ),
      },
    },
    ...DOMAIN_ERROR_ITEMS.map(({ kind, name, note }) => ({
      name,
      note,
      panels: {
        error: (
          <PreviewFrame height={280}>
            <RouteErrorBoundaryPreview kind={kind} />
          </PreviewFrame>
        ),
      },
    })),
    {
      name: "MeetupAttendanceActions",
      note: "참석/불참 버튼 상태 기계(resolveMeetupAttendanceButtonState, lib/rules) 5종을 나란히 보여줍니다. 실제 컴포넌트를 그대로 등록했습니다(PostWriteForm과 같은 패턴) — meetupId가 실재하지 않는 값(sample-meetup-attendance-*)이라 '참석'/'불참'을 눌러도 Mock 데이터는 바뀌지 않고 '모임을 찾을 수 없어요' 오류만 안전하게 보여줍니다.",
      panels: {
        default: (
          <div className="flex flex-wrap items-start gap-4">
            <LabeledAction label="open (참석 가능)">
              <MeetupAttendanceActions
                meetupId="sample-meetup-attendance-open"
                state={{ kind: "open" }}
              />
            </LabeledAction>
            <LabeledAction label="attending (참석 중 → 불참 전환)">
              <MeetupAttendanceActions
                meetupId="sample-meetup-attendance-attending"
                state={{ kind: "attending" }}
              />
            </LabeledAction>
            <LabeledAction label="closed (예정일 경과)">
              <MeetupAttendanceActions
                meetupId="sample-meetup-attendance-closed"
                state={{ kind: "closed" }}
              />
            </LabeledAction>
            <LabeledAction label="cancelled (취소된 모임)">
              <MeetupAttendanceActions
                meetupId="sample-meetup-attendance-cancelled"
                state={{ kind: "cancelled" }}
              />
            </LabeledAction>
          </div>
        ),
      },
    },
    {
      name: "MeetupAttendanceActions — 정원 마감",
      note: "FR-066 E1 — 정원이 찬 Meetup에서 아직 응답하지 않은(또는 불참인) 크루원에게 보이는 모습입니다. 버튼이 비활성화되고 '마감되었습니다'로 바뀝니다(isMeetupFull, lib/rules/meetup-attendance-eligibility.ts). 참석 중인 사람은 정원과 무관하게 항상 불참으로 전환할 수 있습니다(FR-067) — 위 'attending' 예시가 그 경우입니다.",
      panels: {
        error: (
          <MeetupAttendanceActions
            meetupId="sample-meetup-attendance-full"
            state={{ kind: "full" }}
          />
        ),
      },
    },
    {
      // FR-065(Task 041) — 취소·일정 변경. 컨테이너가 `canCancelOrUpdate`로 노출 여부를 이미
      // 정했으므로(제안자·임원·오너만) 이 항목은 항상 노출된 상태로 보여준다. "일정 변경"은
      // D-003(가결된 Meetup의 날짜 변경은 재투표를 요구한다)에 따라 취소 + 새 제안글 작성
      // 안내이지 즉시 날짜 저장이 아니다 — `docs/decisions/community-expansion-041.md` §3.
      name: "MeetupLifecycleActions",
      note: "실제 컴포넌트를 그대로 등록했습니다 — meetupId가 실재하지 않는 값이라 버튼을 눌러 확인 다이얼로그를 열고 실행해도 Mock 데이터는 바뀌지 않고 '모임을 찾을 수 없어요' 오류만 안전하게 보여줍니다. '오류' 상태는 실제 실패 시(권한 없음·이미 취소됨·과거 Meetup) ErrorState가 어떻게 보이는지 정적으로 보여줍니다(컴포넌트 내부 상태를 강제로 만들 수 없어 board.tsx의 도메인 오류 패턴처럼 별도 정적 렌더로 재현).",
      panels: {
        default: (
          <MeetupLifecycleActions
            crewId="sample-crew"
            meetupId="sample-meetup-lifecycle"
            boardWriteHref="#"
          />
        ),
        error: (
          <div className="flex flex-col gap-3">
            <ErrorState
              title={strings.meetup.lifecycle.errors.submitFailed}
              description={strings.meetup.lifecycle.errors.forbidden}
            />
            <ErrorState
              title={strings.meetup.lifecycle.errors.submitFailed}
              description={strings.meetup.lifecycle.errors.conflict}
            />
          </div>
        ),
      },
    },
  ],
});

function LabeledAction({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
