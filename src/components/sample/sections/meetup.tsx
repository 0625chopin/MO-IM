import type { RouteErrorKind } from "@/components/errors/route-error-kind";
import { RouteErrorBoundaryPreview } from "@/components/errors/RouteErrorBoundaryPreview";
import type {
  MeetupDetailViewModel,
  MeetupParticipantGroupsView,
  MeetupParticipantView,
  MeetupScheduleChangeView,
} from "@/components/meetup/meetup-view-models";
import { MeetupAttendanceActions } from "@/components/meetup/MeetupAttendanceActions";
import { MeetupDetail } from "@/components/meetup/MeetupDetail";
import { MeetupDetailSkeleton } from "@/components/meetup/MeetupDetailSkeleton";
import { MeetupLifecycleActions } from "@/components/meetup/MeetupLifecycleActions";
import { MeetupRescheduleConflict } from "@/components/meetup/MeetupRescheduleConflict";
import { MeetupRescheduleForm } from "@/components/meetup/MeetupRescheduleForm";
import { MeetupRescheduleSkeleton } from "@/components/meetup/MeetupRescheduleSkeleton";
import { MeetupScheduleHistory } from "@/components/meetup/MeetupScheduleHistory";
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
 * `MeetupAttendanceActions`의 몫이다) 아래 도메인 오류 전용 항목으로 각각 등록했다
 * (`sections/board.tsx`의 `DOMAIN_ERROR_ITEMS` 패턴과 같다, D-030 ③). 이 문단이 실제 등록과
 * 어긋나면 R-006 재발이니 등록을 바꿀 때 함께 고친다(`MeetupDetail.tsx` 모듈 docstring도
 * 같은 서술을 갖고 있어 둘 다 고쳐야 한다).
 *
 * **I-079/FR-065 AC2(26일차, BOARD) 추가** — "일정 변경 제안" 전용 화면(`MeetupRescheduleForm`,
 * `/meetups/[meetupId]/reschedule`)과 "일정 변경 이력"(`MeetupScheduleHistory`), 참석 응답
 * 무효화 안내를 이 섹션에 더했다. 21일차(Task 041)의 임시 경로("일정 변경" 클릭 →
 * `cancelMeetupAction` → 새 제안글 작성 안내)는 완전히 대체됐다 — `MeetupLifecycleActions`의
 * "일정 변경" 확인 Dialog·전용 문구는 더 이상 없다(그 항목 note 참고).
 *
 * **I-130(27일차, BOARD) 추가** — 같은 Meetup을 겨냥한 open 일정 변경 제안 상호 배제
 * (사용자 결정, D-079: "트리거로 DB에서 차단하고, UI는 도달 전에 사전 안내한다"). 전용
 * 도메인 오류 컴포넌트 `MeetupRescheduleConflict`(기존 제안글로 가는 링크 포함)를 라우트
 * 진입 시점(전체 화면)·폼 제출 시점(인라인, TOCTOU) 두 자리에 등록했다.
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
  // FR-065 — 제안자·임원·오너 시점 데모(취소 버튼). `MeetupLifecycleActions`가
  // `canCancelOrUpdate`·`canProposeReschedule` 두 값을 각각 보고 판단한다.
  canCancelOrUpdate: true,
  // I-079/FR-065 AC2 — "일정 변경 제안" 버튼은 활성 크루원 전원에게 보인다(`poll:create_proposal`
  // 권한, `canCancelOrUpdate`보다 넓다).
  canProposeReschedule: true,
  attendanceInvalidated: false,
  // AC2 빈 상태 — "MeetupDetail" 기본 데모 자체는 이력이 없는 Meetup으로 둔다. populated
  // 예시는 아래 별도 `MeetupScheduleHistory` 항목에서 보여준다.
  scheduleChanges: [],
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

const DEMO_SCHEDULE_CHANGES: MeetupScheduleChangeView[] = [
  {
    id: "sample-schedule-change-1",
    changedAtLabel: "2026.07.28",
    previousDateLabel: "8월 14일 금요일",
    previousStartTimeLabel: "오전 7:00",
    previousPlace: "한강공원 반포지구",
    previousCapacity: 15,
    newDateLabel: "8월 21일 금요일",
    newStartTimeLabel: "오후 7:00",
    newPlace: "한강공원 잠원지구",
    newCapacity: 20,
  },
];

const DOMAIN_ERROR_ITEMS: Array<{ kind: RouteErrorKind; name: string; note: string }> = [
  {
    kind: "forbidden",
    name: "Meetup 상세 — 크루원 아님 (FR-064 AC2, I-073 해소·D-048)",
    note: "FR-064 AC2 — 비소속 회원의 Meetup 상세 접근은 403이 반환돼야 한다. MeetupDetailContainer가 (app)/crews/[crewId]/layout.tsx(D-039)와 같은 방식(getCrewMembership + isActiveMembership)으로 다시 판정해 20일차부터 cause:{code:'forbidden'}을 던지지 않고 <RouteErrorBoundary kind=\"forbidden\"/>을 값으로 직접 반환한다(I-069 근본 해결). 20일차엔 meetups 테이블 RLS(meetups_select_members)가 비소속자에게 행 자체를 0건으로 숨겨 getMeetupById가 먼저 notFound()를 던지는 바람에 이 분기가 실제로는 도달하지 않았다(I-073) — 21일차에 getMeetupById가 getCrewById와 같은 '원본 0행 → private 최소정보 RPC(meetup_directory_summary) 폴백' 패턴을 갖추면서 해소됐다(D-048). 이제 비소속자는 이 forbidden 분기에 정상 도달한다. 상세: docs/prioritization-and-risks.md D-048, docs/decisions/domain-error-channel-069.md §6(경위 보존).",
  },
];

/** I-079/FR-065 AC2(26일차) — "일정 변경 제안" 라우트(`MeetupRescheduleContainer`) 진입 시점
 *  도메인 오류. `RouteErrorBoundaryPreview`로 실제 라우트 오류 화면과 같은 모양을 보여준다 —
 *  "권한 없음"·"취소된 Meetup 대상" 두 가지는 컨테이너가 페이지를 여는 시점에 막는다. 나머지
 *  두 가지("다른 크루 Meetup 대상"·"이미 처리됨")는 액션 레벨(`createPostAction`) 검증이라
 *  아래 `MeetupRescheduleForm — 제출 시점 오류` 항목에 별도로 있다. */
const RESCHEDULE_ROUTE_ERROR_ITEMS: Array<{ kind: RouteErrorKind; name: string; note: string }> = [
  {
    kind: "forbidden",
    name: "일정 변경 제안 — 권한 없음 (FR-065 AC2)",
    note: "MeetupRescheduleContainer가 라우트 진입 시점에 판정한다 — 비소속 크루원이거나(활성 멤버십 아님), poll:create_proposal이 거부되거나(system_admin 등), 크루가 해산됐을 때(I-066과 같은 정책, 쓰기 전용 라우트는 아예 막는다) 이 분기로 떨어진다. 버튼을 거치지 않은 직접 URL 접근을 방어하는 자리라 실제로는 거의 도달하지 않는다(PostWriteContainer와 같은 사정).",
  },
  {
    kind: "conflict",
    name: "일정 변경 제안 — 취소된 Meetup 대상 (FR-065 AC2·AC3)",
    note: "대상 Meetup이 이미 취소됐거나 예정일이 지난 상태로 이 페이지에 직접 접근하면(isMeetupAttendanceOpen이 false) 이 분기로 떨어진다 — cancelMeetupAction의 'conflict' 의미와 같다. 정상 흐름에서는 Meetup 상세가 canProposeReschedule로 버튼 자체를 숨기므로 직접 URL 접근 방어 목적이 크다.",
  },
];

export const meetupSection = defineSection({
  id: "meetup",
  label: "Meetup 상세",
  title: "Meetup 상세 · 참석/불참 · 일정 변경 제안 — MeetupDetail · MeetupAttendanceActions · MeetupRescheduleForm",
  description: (
    <>
      Meetup 상세(SC-17, FR-064·066~068, Task 022) — 정보·투표 결과 요약·정원 카운트·참석/불참
      응답·참석자 3구분 목록·일정 변경 이력을 다룹니다. 정원 마감·참석 가능 여부 판정은{" "}
      <code>lib/rules/meetup-attendance-*.ts</code>의 순수 함수 몫입니다. &ldquo;일정 변경
      제안&rdquo;(I-079/FR-065 AC2, 26일차)은 별도 화면(<code>MeetupRescheduleForm</code>)으로
      분리했습니다 — 대상 Meetup이 특정돼야 하는 전용 진입점이라 일반 FR-034 제안 글쓰기
      (<code>PostWriteForm</code>)와 구분됩니다.
    </>
  ),
  items: [
    {
      name: "MeetupDetail",
      note: "정원 12/20 · 참석 3명 · 불참 1명 · 미응답 2명 예시입니다. '빈 상태'는 아직 아무도 응답하지 않은 경우(참석/불참 목록이 비어 '아직 없어요'가 표시됩니다) + 일정 변경 이력도 없는 경우입니다(AC2 빈 상태). FR-064 AC1 — 시각·장소는 값이 있을 때만 표시되고(placeholder 없음), 정원 없는 Meetup은 '(정원 제한 없음)'으로 표시됩니다(default에서는 늘 정원이 있는 예시만 보여 이 분기는 코드로만 확인 가능 — capacity: null 케이스는 MeetupDetailViewModel 타입 참고).",
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
    {
      name: "MeetupDetail — 참석 응답 무효화 안내 (I-079/FR-065 AC2)",
      note: "일정 변경 제안이 가결되면 기존 참석 응답이 전부 무효화된다(팀장 결정 — '7/1에 간다'가 '7/8에 간다'를 의미하지 않는다). MeetupAttendance.invalidatedAt이 채워진 조회자에게는 status 값과 무관하게 '미응답'으로 취급하고(groupMeetupParticipantIds), 이 배너로 재확인을 유도한다 — 무효화가 조용히 일어나면 사용자는 자신이 여전히 참석자인 줄 안다.",
      panels: {
        default: (
          <PreviewFrame height={680}>
            <div className="mx-auto w-full max-w-md p-4">
              <MeetupDetail
                meetup={{ ...DEMO_MEETUP, attendanceInvalidated: true }}
                participants={DEMO_PARTICIPANTS}
                attendanceState={{ kind: "open" }}
              />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "MeetupScheduleHistory",
      note: "I-079/FR-065 AC2 '이력이 남는다'의 표시 컴포넌트. 일정 변경 제안이 가결될 때마다 이전값 → 새값이 한 행씩 쌓인다(최신순). '빈 상태'는 아직 한 번도 일정이 변경되지 않은 경우 — AC2가 요구하는 빈 상태입니다.",
      panels: {
        default: (
          <div className="max-w-md rounded-lg border border-border bg-background p-4">
            <MeetupScheduleHistory changes={DEMO_SCHEDULE_CHANGES} />
          </div>
        ),
        empty: (
          <div className="max-w-md rounded-lg border border-border bg-background p-4">
            <MeetupScheduleHistory changes={[]} />
          </div>
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
      // I-079/FR-065 AC2(26일차) — 재작성. "일정 변경"은 더 이상 cancelMeetupAction을 부르지
      // 않는다 — 전용 화면(getMeetupRescheduleHref)으로 이동하는 평범한 링크로 바뀌었다
      // (파괴적 동작이 아니라 확인 Dialog가 없다). "모임 취소"만 여전히 Dialog로 확인한다.
      // canCancelOrUpdate·canProposeReschedule을 둘 다 true로 주면 두 버튼이 함께 보인다.
      name: "MeetupLifecycleActions",
      note: "실제 컴포넌트를 그대로 등록했습니다 — meetupId가 실재하지 않는 값이라 '모임 취소' 확인 다이얼로그를 열고 실행해도 Mock 데이터는 바뀌지 않고 '모임을 찾을 수 없어요' 오류만 안전하게 보여줍니다. '일정 변경 제안'은 이제 /meetups/sample-.../reschedule로 이동을 시도하는 링크일 뿐입니다(실재하지 않는 경로라 이 데모에서는 클릭하지 않는 것을 권장). '오류' 상태는 취소 실패 시(권한 없음·이미 취소됨) ErrorState가 어떻게 보이는지 정적으로 보여줍니다(컴포넌트 내부 상태를 강제로 만들 수 없어 board.tsx의 도메인 오류 패턴처럼 별도 정적 렌더로 재현).",
      panels: {
        default: (
          <MeetupLifecycleActions
            crewId="sample-crew"
            meetupId="sample-meetup-lifecycle"
            canCancelOrUpdate
            canProposeReschedule
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
    ...RESCHEDULE_ROUTE_ERROR_ITEMS.map(({ kind, name, note }) => ({
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
      name: "MeetupRescheduleForm",
      note: "I-079/FR-065 AC2 전용 글쓰기 화면(/meetups/[meetupId]/reschedule) — 유형 토글 없이 meetup_reschedule_proposal로 고정, targetMeetupId를 항상 함께 보냅니다. 필드 구성은 PostWriteForm의 모임 제안 필드 세트와 같습니다. crewId·targetMeetupId가 실재하지 않는 값이라 제출해도 Mock 데이터는 바뀌지 않고 '대상 모임을 찾을 수 없어요' 오류만 안전하게 보여줍니다.",
      panels: {
        default: (
          <PreviewFrame height={760}>
            <div className="mx-auto w-full max-w-md p-4">
              <MeetupRescheduleForm
                crewId="sample-crew"
                targetMeetupId="sample-meetup-reschedule"
                currentSchedule={{
                  dateLabel: "8월 14일 금요일",
                  startTimeLabel: "오전 7:00",
                  place: "한강공원 반포지구",
                  capacity: 20,
                }}
              />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={760}>
            <div className="mx-auto w-full max-w-md p-4">
              <MeetupRescheduleSkeleton />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "MeetupRescheduleConflict — 이미 진행 중인 제안 (I-130)",
      note: "같은 Meetup을 겨냥한 open 일정 변경 제안이 이미 있을 때 MeetupRescheduleContainer가 폼 대신 반환하는 전체 화면 도메인 오류입니다(직접 URL 접근 방어, D-079). RouteErrorBoundary의 고정 카탈로그를 쓰지 않고 전용 컴포넌트를 새로 둔 이유는 이 상태가 '기존 제안글로 가는 링크'를 반드시 함께 보여줘야 하기 때문입니다(팀장 지시 — 막다른 길로 느끼지 않게). conflictingPostId가 실재하지 않는 값이라 링크를 눌러도 '게시글을 찾을 수 없어요'로 안전하게 끝납니다.",
      panels: {
        error: (
          <PreviewFrame height={360}>
            <MeetupRescheduleConflict crewId="sample-crew" conflictingPostId="sample-post-reschedule-conflict" />
          </PreviewFrame>
        ),
      },
    },
    {
      name: "MeetupRescheduleForm — 제출 시점 도메인 오류",
      note: "createPostAction(kind:'denied')이 대상 Meetup 사전 검증에서 반환하는 나머지 코드들입니다. '다른 크루 Meetup 대상'은 targetMeetupId가 가리키는 Meetup이 요청의 crewId와 다른 크루 소속일 때(not_found로 합쳐 반환 — cancelMeetupAction과 같은 관례, 크루 경계 정보를 굳이 노출하지 않는다) — 이 페이지는 crewId를 대상 Meetup에서 그대로 유도하므로 정상 UI로는 거의 도달하지 않는 방어적 코드입니다(PostWriteContainer의 도달성 낮은 throw와 같은 사정). '이미 처리됨'은 이 폼을 연 뒤 대상 Meetup이 취소되거나 예정일이 지나는 등 상태가 바뀐 채로 제출했을 때(TOCTOU) — 위 라우트 레벨 'conflict'(페이지를 여는 시점)와 코드는 같지만 등장 시점이 다릅니다. **I-130(27일차) 추가** — 맨 아래는 폼을 연 뒤 다른 사람이 먼저 같은 Meetup에 제안을 등록했을 때(code: 'duplicate_proposal') 실제 MeetupRescheduleForm이 보여주는 것과 같은 컴포넌트(MeetupRescheduleConflict, className으로 폼 인라인 카드로 좁힘)입니다 — ErrorState 두 개와 다르게 고정 문구가 아니라 기존 제안글 링크를 함께 보여줍니다.",
      panels: {
        error: (
          <div className="flex flex-col gap-3">
            <ErrorState
              title={strings.meetup.reschedule.errors.submitFailed}
              description={strings.meetup.reschedule.errors.notFound}
            />
            <ErrorState
              title={strings.meetup.reschedule.errors.submitFailed}
              description={strings.meetup.reschedule.errors.conflict}
            />
            <MeetupRescheduleConflict
              crewId="sample-crew"
              conflictingPostId="sample-post-reschedule-conflict"
              className="min-h-0 items-start gap-3 rounded-lg border border-solid border-destructive/40 bg-destructive/5 p-4 text-left"
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
