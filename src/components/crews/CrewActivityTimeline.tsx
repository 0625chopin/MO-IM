import { CalendarCheck, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type {
  CrewActivityEntry,
  CrewActivityStats,
} from "@/components/crews/crew-activity-view-models";
import { getMeetupDetailHref } from "@/components/meetup/meetup-links";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { crewCertaintyVars } from "@/lib/crew-palette";
import { strings, t } from "@/lib/strings";
import { cn } from "@/lib/utils";

import type { CSSProperties } from "react";

export interface CrewActivityTimelineProps {
  entries: CrewActivityEntry[];
  stats: CrewActivityStats;
  /** 이 크루의 팔레트 인덱스 — 타임라인 점의 채움색. */
  colorIndex: number;
  /** 0이면 안내 자체를 그리지 않는다. */
  upcomingCount: number;
}

/**
 * 크루 활동내역 타임라인(팀장 요청). 표현 컴포넌트 — `lib/data`를 참조하지 않는다(D-030 ①).
 *
 * **시각 장치: 지나온 선.** 왼쪽에 세로 잉크 선을 하나 긋고 모임마다 점을 찍는다. 흔한
 * "01 / 02 / 03" 번호 대신 선을 고른 이유는, 이 목록에서 실제로 정보인 것이 **순번이 아니라
 * 시간의 연속성**이기 때문이다 — 번호는 몇 번째인지만 알려주고 "이 크루가 계속 움직여 왔다"는
 * 것은 못 알려준다. 점은 이 앱의 확정성 스케일을 그대로 쓴다(디자인 언어 §2): 실제로 열린
 * 모임은 크루색 채움(`certainty-confirmed`), 취소된 모임은 무채 — 취소를 목록에서 빼지 않는
 * 이유는 그것도 있었던 일이기 때문이고, 형태(채움/빈 원)가 색과 함께 가므로 색만으로 상태를
 * 전달하지 않는다(WCAG 1.4.1).
 *
 * 사진이 붙은 모임은 그 줄에 썸네일이 따라온다 — "활동내역"과 "활동사진"을 두 개의 남남인
 * 탭으로 두지 않고 여기서 한 번 이어 준다. 사진 탭은 전체를 모아 보는 자리다.
 */
export function CrewActivityTimeline({
  entries,
  stats,
  colorIndex,
  upcomingCount,
}: CrewActivityTimelineProps) {
  const s = strings.crew.activity;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-medium text-foreground">{s.title}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{s.description}</p>
      </div>

      {/* 요약 지표. 숫자가 주인공이라 tnum(고정폭 숫자)으로 자릿수가 흔들리지 않게 둔다. */}
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <StatCell label={s.stats.meetupCount} value={t((x) => x.crew.activity.stats.unitCount, { count: stats.meetupCount })} />
        <StatCell label={s.stats.attendanceCount} value={t((x) => x.crew.activity.stats.unitPeople, { count: stats.attendanceCount })} />
        <StatCell label={s.stats.photoCount} value={t((x) => x.crew.activity.stats.unitPhotos, { count: stats.photoCount })} />
      </dl>

      {upcomingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t((x) => x.crew.activity.upcomingNotice, { count: upcomingCount })}
        </p>
      )}

      {entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarCheck aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{s.empty}</EmptyTitle>
            <EmptyDescription>{s.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry, index) => (
            <TimelineRow
              key={entry.meetupId}
              entry={entry}
              colorIndex={colorIndex}
              isLast={index === entries.length - 1}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tnum font-heading text-lg font-medium text-foreground">{value}</dd>
    </div>
  );
}

function TimelineRow({
  entry,
  colorIndex,
  isLast,
}: {
  entry: CrewActivityEntry;
  colorIndex: number;
  isLast: boolean;
}) {
  const s = strings.crew.activity;
  const vars = crewCertaintyVars(colorIndex) as CSSProperties;

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* 세로 선 — 마지막 행에서는 끊는다(선이 허공으로 이어지면 "더 있다"로 읽힌다). */}
      {!isLast && (
        <span aria-hidden="true" className="absolute top-4 bottom-0 left-[5px] w-px bg-border" />
      )}

      {/* 점. 취소된 모임은 크루색을 쓰지 않는다 — 채움 여부가 곧 상태다. */}
      {entry.isCancelled ? (
        <span
          aria-hidden="true"
          className="relative mt-1 size-2.5 shrink-0 rounded-full border border-muted-foreground/50 bg-background"
        />
      ) : (
        <span
          aria-hidden="true"
          className="certainty-confirmed relative mt-1 size-2.5 shrink-0 rounded-full"
          style={vars}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <time dateTime={entry.dateIso} className="tnum text-xs text-muted-foreground">
            {entry.dateLabel}
          </time>
          {entry.isCancelled && (
            <Badge variant="outline" className="text-[11px]">
              {s.cancelledBadge}
            </Badge>
          )}
        </div>

        <Link
          href={getMeetupDetailHref(entry.meetupId)}
          className={cn(
            "font-medium text-foreground underline-offset-4 hover:underline",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            entry.isCancelled && "text-muted-foreground line-through decoration-1",
          )}
        >
          {entry.title}
        </Link>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="tnum">{t((x) => x.crew.activity.attendees, { count: entry.attendingCount })}</span>
          {entry.place && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{entry.place}</span>
            </span>
          )}
        </div>

        {entry.photoThumbnails.length > 0 && (
          <div className="flex items-center gap-1.5">
            {entry.photoThumbnails.map((photo) => (
              <span
                key={photo.photoId}
                className="relative size-12 overflow-hidden rounded-md border border-border bg-muted"
              >
                <Image
                  src={photo.url}
                  alt={photo.alt}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </span>
            ))}
            {entry.photoCount > entry.photoThumbnails.length && (
              <span className="tnum text-xs text-muted-foreground">
                {t((x) => x.crew.activity.photoLink, { count: entry.photoCount })}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
