import { formatDateRangeLabelKo } from "@/components/calendar/date-grid";
import type {
  CrewActivityEntry,
  CrewActivityStats,
  CrewActivityThumbnail,
} from "@/components/crews/crew-activity-view-models";
import { CrewActivityTimeline } from "@/components/crews/CrewActivityTimeline";
import {
  countCrewPhotos,
  countUpcomingMeetupsForCrew,
  createCrewPhotoSignedUrls,
  listCrewPhotos,
  listPastMeetupsForCrew,
} from "@/lib/data";
import type { CrewPhoto, Id, ISODateString } from "@/lib/types";

/** 타임라인 한 줄에 붙는 썸네일 최대 개수. 넘는 만큼은 "사진 N장" 문구로 센다. */
const THUMBNAILS_PER_ENTRY = 3;

/** 활동내역이 거슬러 올라가는 모임 수. 크루 홈 한 탭 분량이라 페이지네이션을 두지 않는다. */
const TIMELINE_LIMIT = 50;

/**
 * 크루 활동내역 컨테이너(팀장 요청, D-030 ①) — 지난 모임 타임라인과 요약 지표를 조립한다.
 *
 * **새 이벤트 로그 테이블을 만들지 않았다.** 활동내역의 원천은 `meetups`(이미 끝난 모임)와
 * `crew_photos`뿐이다 — "모임이 지나갔다"는 사실은 이미 `meetups` 행에 다 들어 있고, 그것을
 * 별도 로그로 한 번 더 적으면 두 기록이 어긋날 때 어느 쪽이 맞는지 판단할 근거가 없어진다.
 *
 * **`attendanceCount`는 `attending_count` 합이다** — 참석 응답 행(`meetup_attendances`)을
 * 모임마다 세지 않는다. 모임 50개면 조회가 50번 늘어나는데, 그 합계와 `meetups.attending_count`
 * 합은 같은 값을 가리킨다(`respond_meetup_attendance` RPC가 두 값을 한 트랜잭션에서 맞춘다).
 *
 * **크루원 게이트는 호출자가 이미 통과시켰다** — 이 컨테이너는 `CrewHomeContainer`의 활성
 * 멤버십 분기에서만 렌더된다. 그래도 RLS가 2차 방어선으로 남아 있어, 혹시 비크루원이 도달하면
 * 조회가 0건이 된다(오류가 아니라 빈 화면).
 */
export async function CrewActivityContainer({
  crewId,
  colorIndex,
}: {
  crewId: Id;
  colorIndex: number;
}) {
  const today = new Date().toISOString().slice(0, 10) as ISODateString;

  const [pastMeetups, upcomingCount, photoCount, photos] = await Promise.all([
    listPastMeetupsForCrew(crewId, { before: today, limit: TIMELINE_LIMIT }),
    countUpcomingMeetupsForCrew(crewId, today),
    countCrewPhotos(crewId),
    // 타임라인 썸네일용 — 모임에 연결된 사진만 필요하지만, 모임마다 따로 조회하면 N+1이 된다.
    // 최근 사진을 한 번에 가져와 메모리에서 모임별로 묶는다.
    listCrewPhotos(crewId, { limit: 120 }),
  ]);

  const photosByMeetup = new Map<Id, CrewPhoto[]>();
  for (const photo of photos) {
    if (!photo.meetupId) continue;
    const bucket = photosByMeetup.get(photo.meetupId);
    if (bucket) bucket.push(photo);
    else photosByMeetup.set(photo.meetupId, [photo]);
  }

  // 서명은 실제로 화면에 나갈 썸네일만 한 번에 발급한다(요청 1회, `createSignedUrls` 일괄).
  const thumbnailPaths = [...photosByMeetup.values()].flatMap((bucket) =>
    bucket.slice(0, THUMBNAILS_PER_ENTRY).map((photo) => photo.storagePath),
  );
  const signedUrls = await createCrewPhotoSignedUrls(thumbnailPaths);

  const entries: CrewActivityEntry[] = pastMeetups.map((meetup) => {
    const meetupPhotos = photosByMeetup.get(meetup.id) ?? [];
    const thumbnails: CrewActivityThumbnail[] = meetupPhotos
      .slice(0, THUMBNAILS_PER_ENTRY)
      .flatMap((photo) => {
        const url = signedUrls.get(photo.storagePath);
        // 서명에 실패한 사진은 빈 자리를 남기지 않고 뺀다(`createCrewPhotoSignedUrls` docstring).
        if (!url) return [];
        return [{ photoId: photo.id, url, alt: photo.caption ?? meetup.title }];
      });

    return {
      meetupId: meetup.id,
      title: meetup.title,
      dateLabel: formatDateRangeLabelKo(meetup.date, meetup.endDate),
      dateIso: meetup.date,
      place: meetup.place,
      attendingCount: meetup.attendingCount,
      isCancelled: meetup.status === "cancelled",
      photoThumbnails: thumbnails,
      photoCount: meetupPhotos.length,
    };
  });

  const stats: CrewActivityStats = {
    // 취소된 모임은 "함께한 모임"에 세지 않는다 — 타임라인에는 남지만 실제로 모이지는 않았다.
    meetupCount: pastMeetups.filter((m) => m.status === "confirmed").length,
    attendanceCount: pastMeetups
      .filter((m) => m.status === "confirmed")
      .reduce((sum, m) => sum + m.attendingCount, 0),
    photoCount,
  };

  return (
    <CrewActivityTimeline
      entries={entries}
      stats={stats}
      colorIndex={colorIndex}
      upcomingCount={upcomingCount}
    />
  );
}
