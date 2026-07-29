import type { Crew, Id } from "@/lib/types";

/** 페이지당 20건(`BoardPagination`과 같은 페이지 크기 관례) — FR-014 AC3가 "50건 초과"를
 *  기준으로 들었을 뿐 정확한 값을 못박지 않아 실용적으로 골랐다. */
export const CREW_EXPLORE_PAGE_SIZE = 20;

/**
 * `CrewCard.tsx`(표현)가 받는 카드 한 장의 모양. `Crew`에 없는 두 값(`memberCount`·`isMember`)은
 * 컨테이너·Server Action이 `lib/data`·`lib/rules`를 조인해 미리 계산해 내려준다 — 표현 컴포넌트는
 * `lib/data`를 import할 수 없다(D-030 ①, zone 4). 전부 직렬화 가능한 원시값이다(NFR-037).
 */
export interface CrewCardViewModel {
  id: Id;
  name: string;
  description: string;
  category: string;
  colorIndex: number;
  memberCount: number;
  /** 조회자가 이미 활성 크루원인가(FR-014 AC2 "가입됨" 배지) — `isActiveMembership` 판정
   *  결과를 그대로 받는다. 새 판정을 만들지 않는다(R-015). */
  isMember: boolean;
  /** FR-055 AC1(Task 044) — 이 크루 채팅방의 읽지 않은 메시지 수. 비소속자는 채팅방 접근 권한이
   *  없어(FR-050 AC3) 항상 0이다 — `isMember=false`면 컨테이너가 조회 자체를 생략한다. */
  unreadMessageCount: number;
}

export function toCrewCardViewModel(
  crew: Crew,
  memberCount: number,
  isMember: boolean,
  unreadMessageCount: number,
): CrewCardViewModel {
  return {
    id: crew.id,
    name: crew.name,
    description: crew.description,
    category: crew.category,
    colorIndex: crew.colorKey,
    memberCount,
    isMember,
    unreadMessageCount,
  };
}
