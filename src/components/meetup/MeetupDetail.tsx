import Link from "next/link";

import { CrewLegend } from "@/components/calendar/CrewLegend";
import { formatStartTimeKo } from "@/components/calendar/date-grid";
import type {
  MeetupDetailViewModel,
  MeetupParticipantGroupsView,
  MeetupParticipantView,
} from "@/components/meetup/meetup-view-models";
import { MeetupAttendanceActions } from "@/components/meetup/MeetupAttendanceActions";
import { MeetupLifecycleActions } from "@/components/meetup/MeetupLifecycleActions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { MeetupAttendanceButtonState } from "@/lib/rules/meetup-attendance-button-state";
import { isMeetupFull } from "@/lib/rules/meetup-attendance-eligibility";
import { strings, t } from "@/lib/strings";

export interface MeetupDetailProps {
  meetup: MeetupDetailViewModel;
  participants: MeetupParticipantGroupsView;
  attendanceState: MeetupAttendanceButtonState;
}

/**
 * Meetup 상세(SC-17, FR-064·066~068) — Task 022. 순수 표현 컴포넌트(D-030 ①) — `lib/data`를
 * import하지 않는다. 크루원 여부 판정(FR-064 AC2, 403)은 `MeetupDetailContainer`가 라우트
 * 진입 시점에 이미 끝내 뒀으므로(비소속이면 이 컴포넌트까지 도달하지 않는다), 여기서는
 * "이미 통과한 크루원에게 무엇을 보여줄까"만 다룬다.
 *
 * `/sample` 4상태 커버리지 — 이 컴포넌트 자신은 **기본·빈·로딩** 3상태만 등록돼 있다
 * ("빈"은 참석/불참 응답이 하나도 없는 경우, `MeetupDetailSkeleton`이 "로딩"). **"오류"는
 * 이 컴포넌트가 아니라 별도 항목으로 등록된다** — 크루원 아님(403)은 라우트 레벨
 * `RouteErrorBoundary`가 그리므로 이 컴포넌트가 렌더할 것이 없고(이 컴포넌트에 도달 자체가
 * 안 된다), 정원 마감 도메인 오류는 `MeetupAttendanceActions`가 `state.kind === "full"`로
 * 표현한다 — 두 도메인 오류 모두 `/sample`의 `meetup` 섹션에 별도 항목으로 등록돼 있다
 * (`src/components/sample/sections/meetup.tsx` 참고). 이 docstring이 실제 등록과 어긋나면
 * R-006 재발이니 등록을 바꿀 때 이 문단도 함께 고친다.
 */
export function MeetupDetail({ meetup, participants, attendanceState }: MeetupDetailProps) {
  const timeLabel = formatStartTimeKo(meetup.startTime);
  const capacityLabel =
    meetup.capacity !== null
      ? t((s) => s.meetup.detail.capacityLabel, {
          count: meetup.attendingCount,
          capacity: meetup.capacity,
        })
      : t((s) => s.meetup.detail.noCapacityLabel, { count: meetup.attendingCount });
  const isFull = isMeetupFull(meetup);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          <CrewLegend crewName={meetup.crewName} colorIndex={meetup.crewColorIndex} />
          {meetup.isCancelled && (
            <Badge variant="secondary">{strings.meetup.detail.cancelledBadge}</Badge>
          )}
          {!meetup.isCancelled && (
            <Badge variant={isFull ? "outline" : "secondary"}>
              {isFull ? strings.meetup.attendance.full : strings.meetup.attendance.recruiting}
            </Badge>
          )}
        </div>
        <CardTitle className="text-xl leading-snug">{meetup.title}</CardTitle>
        <div className="flex flex-col gap-1 pt-1 text-sm text-muted-foreground">
          <p className="tnum">
            <time dateTime={meetup.date}>{meetup.dateLabel}</time>
            {/* FR-064 AC1 — 시각은 입력된 경우에만 표시한다("미정" 플레이스홀더를 쓰지 않는다). */}
            {timeLabel && <> · {timeLabel}</>}
          </p>
          {/* FR-064 AC1 — 장소도 입력된 경우에만 그 줄 자체를 렌더링한다. */}
          {meetup.place && <p>{meetup.place}</p>}
          <p className="tnum">{capacityLabel}</p>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {meetup.description && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {meetup.description}
          </p>
        )}

        {meetup.pollTally && (
          <div className="rounded-lg border border-dashed border-border p-2.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{strings.meetup.detail.pollResult}</span>{" "}
            {t((s) => s.meetup.detail.voteTally, {
              for: meetup.pollTally.forCount,
              against: meetup.pollTally.againstCount,
              abstain: meetup.pollTally.abstainCount,
            })}
          </div>
        )}

        {meetup.postHref && (
          <Link
            href={meetup.postHref}
            className="inline-flex items-center py-1 text-sm text-primary underline-offset-2 hover:underline"
          >
            {strings.meetup.detail.goToPost}
          </Link>
        )}

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-foreground">
            {strings.meetup.detail.participants.title}
          </h3>
          <ParticipantGroup
            label={strings.meetup.detail.participants.attending}
            count={participants.attending.length}
            people={participants.attending}
          />
          <ParticipantGroup
            label={strings.meetup.detail.participants.absent}
            count={participants.absent.length}
            people={participants.absent}
          />
          <ParticipantGroup
            label={strings.meetup.detail.participants.noResponse}
            count={participants.noResponse.length}
            people={participants.noResponse}
          />
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3 border-t">
        <MeetupAttendanceActions meetupId={meetup.id} state={attendanceState} />
        {/* FR-065(Task 041) — 취소·일정 변경은 컨테이너가 이미 판정한 `canCancelOrUpdate`
         *  (임원·오너 또는 제안자 본인, AC3로 과거 Meetup은 이미 false)로만 노출한다. */}
        {meetup.canCancelOrUpdate && (
          <MeetupLifecycleActions
            crewId={meetup.crewId}
            meetupId={meetup.id}
            boardWriteHref={meetup.boardWriteHref}
          />
        )}
      </CardFooter>
    </Card>
  );
}

function ParticipantGroup({
  label,
  count,
  people,
}: {
  label: string;
  count: number;
  people: MeetupParticipantView[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {label} ({count})
      </p>
      {people.length === 0 ? (
        <p className="text-xs text-muted-foreground">{strings.meetup.detail.participants.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {people.map((person) => (
            <li key={person.profileId} className="flex items-center gap-2">
              <Avatar size="sm">
                {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
                <AvatarFallback>{person.displayName.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-foreground">{person.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
