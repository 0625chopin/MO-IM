import type { MeetupScheduleChangeView } from "@/components/meetup/meetup-view-models";
import { strings, t } from "@/lib/strings";

export interface MeetupScheduleHistoryProps {
  changes: MeetupScheduleChangeView[];
}

/**
 * I-079/FR-065 AC2(26일차, BOARD) — "일정 변경 이력" 표시. 순수 표현 컴포넌트(D-030 ①,
 * `MeetupDetail.tsx`의 `ParticipantGroup`과 같은 자리) — `MeetupDetailContainer`가
 * `listMeetupScheduleChanges`를 조회·가공한 `MeetupScheduleChangeView[]`를 그대로 받는다.
 *
 * 빈 배열이면 "이력 없음"(AC2 빈 상태)을 그린다 — 별도 컨테이너 분기 없이 이 컴포넌트가
 * 직접 처리한다(`ParticipantGroup.empty`와 같은 패턴).
 */
export function MeetupScheduleHistory({ changes }: MeetupScheduleHistoryProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">
        {strings.meetup.detail.scheduleHistory.title}
      </h3>
      {changes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{strings.meetup.detail.scheduleHistory.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {changes.map((change) => (
            <li
              key={change.id}
              className="rounded-lg border border-dashed border-border p-2.5 text-xs text-muted-foreground"
            >
              <p className="text-foreground">{change.changedAtLabel}</p>
              <p className="tnum">
                {t((s) => s.meetup.detail.scheduleHistory.change, {
                  previousDate: change.previousStartTimeLabel
                    ? `${change.previousDateLabel} ${change.previousStartTimeLabel}`
                    : change.previousDateLabel,
                  newDate: change.newStartTimeLabel
                    ? `${change.newDateLabel} ${change.newStartTimeLabel}`
                    : change.newDateLabel,
                })}
              </p>
              {(change.previousPlace || change.newPlace) && (
                <p>
                  {change.previousPlace ?? "—"} → {change.newPlace ?? "—"}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
