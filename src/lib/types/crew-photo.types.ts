import type { Id, ISODateTimeString } from "./common.types";

/**
 * 크루 활동 사진 — 크루원이 활동하며 찍은 사진의 **메타데이터**다. 실제 이미지 바이트는
 * private Storage 버킷(`crew-photos`)에 있고 이 타입의 `storagePath`가 그 오브젝트를 가리킨다.
 *
 * **URL 필드가 없는 것은 의도적이다.** 버킷이 private이라 열람은 항상 만료가 있는 서명 URL로
 * 나가는데, 서명 URL은 조회 시점마다 달라지는 값이라 엔티티의 일부가 아니다(같은 사진의 같은
 * 행이 조회할 때마다 다른 문자열을 갖게 된다). 표시용 URL은 화면 조립 시점에
 * `createCrewPhotoSignedUrls`가 별도로 계산해 뷰모델에 담는다.
 *
 * `meetupId`는 "어느 모임에서 찍었는가"다(선택). 모임과 무관한 일상 사진도 올릴 수 있어야
 * 해서 nullable이며, 모임이 삭제돼도 사진은 남는다(FK `on delete set null`).
 */
export interface CrewPhoto {
  id: Id;
  crewId: Id;
  meetupId: Id | null;
  uploaderId: Id;
  /** 버킷 안 오브젝트 경로. 규약은 `{crewId}/{uuid}.{ext}` — DB CHECK가 접두사를 강제한다. */
  storagePath: string;
  caption: string | null;
  createdAt: ISODateTimeString;
  /** 소프트 삭제(posts·comments·chat_messages와 같은 규약). */
  deletedAt: ISODateTimeString | null;
}
