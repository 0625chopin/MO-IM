import {
  formatShortDateRangeLabelKo,
  formatTimeRangeKo,
} from "@/components/calendar/date-grid";
import { getCrewHomeHref } from "@/components/crews/crew-links";
import type { HotMeetupItem } from "@/components/meetup/hot-meetup-types";
import { HotMeetupList } from "@/components/meetup/HotMeetupList";
import { listHotPublicMeetups } from "@/lib/data";

/** 메인에 보여줄 항목 수. RPC 자체도 상한(20)을 걸지만 화면 정책은 여기서 정한다. */
const HOT_MEETUP_LIMIT = 5;

/**
 * "지금 활발한 모임" 컨테이너 (D-109, D-030 ①) — 랜딩(`/`)과 홈(`/home`)이 모두 쓴다.
 *
 * **인증을 확인하지 않는다.** 다른 컨테이너(`HomeCalendarSummaryContainer` 등)가 `(app)`
 * 안에서만 호출된다는 전제로 `isAuthenticated` 조기 반환을 두는 것과 다르다 — 이 목록은
 * 공개 데이터이고 **게스트(랜딩)가 주 소비자**라 세션 유무로 결과가 달라지지 않는다.
 * 노출 경계는 전부 `public.hot_public_meetups` RPC가 강제한다.
 *
 * **오류를 삼켜 섹션만 비운다.** 이 섹션은 두 화면 모두에서 부차적인 소개 영역이라, 조회가
 * 실패했다고 랜딩·홈 전체를 오류 화면으로 바꾸면 안 된다 — `ErrorState`(인라인 오류)가 정확히
 * 이 경우를 위한 것이다(그 모듈 docstring: "섹션 하나가 실패했을 때 그 자리만 채운다").
 * 원본 오류는 서버 로그로만 남긴다(NFR-014·D-030 ③ — 사용자에게 원문을 노출하지 않는다).
 *
 * **정규화는 여기서 한다.** `intensity`(1위 대비 상대 활동량)는 목록 전체를 봐야 계산되므로
 * 행 단위 표현 컴포넌트가 할 수 없다. RPC가 이미 `activity_score desc`로 정렬해 주므로 첫
 * 항목이 최댓값이다 — 다시 정렬하지 않는다(정렬 규칙을 두 곳에 두지 않는다, NFR-036과 같은
 * 이유).
 */
export async function HotMeetupsContainer({
  showBrowseCta,
  hideHeading,
}: {
  showBrowseCta?: boolean;
  /** 홈에서는 접기 셸이 제목을 갖는다 — `HotMeetupList`의 같은 prop으로 그대로 흘려보낸다. */
  hideHeading?: boolean;
}) {
  let items: HotMeetupItem[];

  try {
    const rows = await listHotPublicMeetups(HOT_MEETUP_LIMIT);
    // RPC가 내림차순으로 주므로 첫 항목이 최댓값이다. 전부 0점이면(활동이 아예 없는 주)
    // 0으로 나누지 않도록 1로 떨어뜨린다 — 그 경우 모든 막대가 같은 폭이 되는데, "다섯 다
    // 조용했다"는 사실을 그대로 보여주는 것이라 맞는 표현이다.
    const topScore = Math.max(1, rows[0]?.activityScore ?? 1);

    items = rows.map((row) => ({
      id: row.id,
      crewHref: getCrewHomeHref(row.crewId),
      crewName: row.crewName,
      crewCategory: row.crewCategory,
      colorIndex: row.crewColorKey,
      title: row.title,
      // 기간 모임이면 "8월 4일(화) ~ 8월 6일(목)"로 나온다(2026-07-31). RPC가
      // `end_date >= current_date`로 거르므로 이 목록에는 진행 중인 기간 모임도 들어온다.
      dateLabel: formatShortDateRangeLabelKo(row.date, row.endDate),
      timeLabel: formatTimeRangeKo(row.startTime, row.endTime),
      attendingCount: row.attendingCount,
      capacity: row.capacity,
      intensity: row.activityScore / topScore,
    }));
  } catch (error) {
    console.error("[home] failed to load hot public meetups", error);
    return <HotMeetupList items={[]} error showBrowseCta={showBrowseCta} hideHeading={hideHeading} />;
  }

  return <HotMeetupList items={items} showBrowseCta={showBrowseCta} hideHeading={hideHeading} />;
}
