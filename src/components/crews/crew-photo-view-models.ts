import type { Id } from "@/lib/types";

/**
 * 갤러리 한 칸 — `CrewPhotoGalleryContainer`가 사진 행·업로더 프로필·서명 URL을 조인해
 * 만든다(D-030 ①). 전부 직렬화 가능한 원시값이다(NFR-037).
 *
 * `url`이 null이면 서명 URL 발급에 실패한 사진이다 — 칸을 빼지 않고 "불러올 수 없어요"로
 * 남긴다. 목록에서 조용히 사라지면 사용자는 자기가 올린 사진이 지워진 줄 안다.
 */
export interface CrewPhotoView {
  photoId: Id;
  url: string | null;
  caption: string | null;
  uploaderName: string;
  /** 사람이 읽는 업로드 시각 문구 — 컨테이너가 이미 포맷팅해 내려준다. */
  uploadedAtLabel: string;
  /** `photo:delete_own`(본인) 또는 `photo:delete_any`(임원 이상) 판정 결과. */
  canDelete: boolean;
  /** 연결된 모임 제목. 없으면 null. */
  meetupTitle: string | null;
}

/** 업로드 폼의 "관련 모임" 선택지. */
export interface CrewPhotoMeetupOption {
  meetupId: Id;
  label: string;
}
