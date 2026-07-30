/**
 * 게시글 수정 가능 필드 판정 — Task 018A (FR-032 AC2, D-035).
 *
 * PRD 검증(§5.5 m-4)이 확정한 대로: 모임 제안글(`type: "meetup_proposal"`)의 투표는 게시글과
 * **동시에** `open` 상태로 생성된다(FR-034 정상 흐름 ④). 따라서 "투표 시작 후에는 날짜·조건이
 * 잠긴다"는 조건절이 참조하는 "투표 시작 전"이라는 시간 구간 자체가 존재하지 않는다 — 잠금은
 * 조건부가 아니라 **무조건**이다(등록 순간부터 영구히 잠김). 제목·본문은 유형과 무관하게 항상
 * 수정 가능하다(AC2 "제목·본문 설명은 수정 가능").
 *
 * 이 판정을 컴포넌트에 인라인하지 않는다 — 화면(편집 폼이 어떤 필드를 보여줄지)과 Server
 * Action(어떤 필드를 실제로 반영할지) 양쪽이 이 함수만 호출한다(NFR-036, R-015).
 *
 * React·Next·데이터 레이어를 import하지 않는다(zone 1, `eslint.config.mjs`).
 */

import type { PostType } from "@/lib/types";

/**
 * 게시글 수정 화면·Server Action이 다루는 필드 전부. `meetupDate`는 `meetup_proposal`에서만 의미 있다.
 *
 * **`startTime`·`place`·`capacity`(D-013, Task 018B가 `Post`에 추가한 선택 입력 3종)는 의도적으로
 * 뺐다** — 이 유니온은 "잠금 대상이 될 수 있는 필드"를 열거하는데, 이 3필드는 애초에 편집 경로
 * 자체가 없다. `UpdatePostInput`(`lib/data/mock/board.ts`)이 `title`·`body`만 받고,
 * `PostActions.tsx`(018A 인라인 편집 폼)도 이 셋을 다루지 않는다 — 작성 후에 시작 시각·장소·
 * 정원을 바꾸는 화면 자체가 아직 없다(가결 전 변경은 FR-032 범위 밖, 가결 후 변경은 FR-065
 * `meetup:cancel_or_update`로 별개 액션·별개 대상(`Meetup`, `Post` 아님)이다). "잠글 대상"이
 * 없으니 "잠갔다/안 잠갔다"를 표현할 필요도 없다 — 유니온에 추가하면 아무도 호출하지 않는
 * `isPostFieldEditable(type, "startTime")` 같은 죽은 조합만 늘어난다. 이 3필드를 다루는 편집
 * 화면이 생기면(가결 전 정정 등) 그때 유니온에 추가하고 `getLockedPostFields`의 규칙도 함께
 * 정한다 — 지금은 "제외"가 "누락"이 아니라는 근거만 여기 남긴다(7일차 CREW·CORE 교차검증 동시
 * 지적).
 */
export type PostEditableField = "title" | "body" | "meetupDate";

/**
 * 유형별로 **잠긴**(수정 불가) 필드 목록. `general` 게시글은 애초에 `meetupDate`가 없으므로
 * 잠글 대상이 없고, `meetup_proposal`·`meetup_reschedule_proposal`은 `meetupDate`가 항상
 * 잠긴다 — I-079/FR-065 AC2(26일차)가 추가한 후자도 등록과 동시에 poll이 `open`으로 생성되는
 * 같은 파이프라인을 타므로(§4.1) 위 문단의 근거가 그대로 적용된다.
 */
export function getLockedPostFields(type: PostType): readonly PostEditableField[] {
  return type === "meetup_proposal" || type === "meetup_reschedule_proposal" ? ["meetupDate"] : [];
}

/** 특정 필드가 이 유형의 게시글에서 수정 가능한지. */
export function isPostFieldEditable(type: PostType, field: PostEditableField): boolean {
  return !getLockedPostFields(type).includes(field);
}

/** 이 게시글 유형에 잠긴 필드가 하나라도 있는지 — 잠금 안내 문구를 보여줄지 결정하는 데 쓴다. */
export function hasLockedFields(type: PostType): boolean {
  return getLockedPostFields(type).length > 0;
}
