import type { Id } from "@/lib/types";

/**
 * 활동내역 타임라인 한 줄 — `CrewActivityContainer`가 Meetup·사진을 조인해 만든다(D-030 ①).
 * 전부 직렬화 가능한 원시값이다(NFR-037). 날짜 포맷팅은 컨테이너에서 이미 끝난다 —
 * 표현 컴포넌트가 `Intl`을 다시 부르면 같은 문구가 두 곳에서 갈라진다.
 */
export interface CrewActivityEntry {
  meetupId: Id;
  title: string;
  /** 사람이 읽는 날짜 문구(기간이면 "…~…"). */
  dateLabel: string;
  /** `<time dateTime>`에 그대로 넣는 원본 시작일. */
  dateIso: string;
  place: string | null;
  attendingCount: number;
  isCancelled: boolean;
  /** 이 모임에 연결된 사진 썸네일(최대 3장). 없으면 빈 배열. */
  photoThumbnails: CrewActivityThumbnail[];
  /** 이 모임에 연결된 사진 총 장수 — 썸네일보다 많을 수 있다. */
  photoCount: number;
}

export interface CrewActivityThumbnail {
  photoId: Id;
  /** 서명 URL. 발급에 실패한 사진은 컨테이너가 아예 목록에서 뺀다. */
  url: string;
  alt: string;
}

/** 타임라인 위 요약 지표 3종. */
export interface CrewActivityStats {
  meetupCount: number;
  attendanceCount: number;
  photoCount: number;
}
