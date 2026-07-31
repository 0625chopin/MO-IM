import type { Id, PostType } from "@/lib/types";

/**
 * 글쓰기 임시 저장·초안 복구(FR-030 E2, AC2, Task 018B) — `localStorage` 기반.
 *
 * 서버에 저장하지 않는다 — 이 초안은 "같은 브라우저에서 새로고침 후 재진입" 시나리오
 * (AC2 "Given 작성 중 새로고침, When 글쓰기 화면 재진입, Then 마지막 초안이 복구된다")
 * 하나만 요구하고, 기기 간 동기화나 서버 장애 시 복구는 요구하지 않는다 — 그 정도까지
 * 필요해지면 Server Action + `lib/data`로 옮기는 것이 맞고, 지금은 과설계다.
 *
 * 크루 하나당 초안 하나만 유지한다(동시에 여러 초안을 쓴다는 요구가 없다) — 같은
 * 크루의 글쓰기 화면을 다시 열면 이전 값을 덮어쓴다. 저장은 매 입력마다 동기 호출한다
 * (디바운스 없음) — `localStorage` 쓰기는 이 크기의 폼에서 렌더 성능에 영향을 줄 만큼
 * 비싸지 않고, `PostWriteForm.tsx`가 `useEffect` 없이(React가 비권장하는
 * `react-hooks/set-state-in-effect` 패턴을 피하려고) 이벤트 핸들러에서 직접 부르는 구조를
 * 택했다 — 디바운스를 넣으려면 타이머 정리를 effect로 감싸야 해서 이 구조와 다시 충돌한다.
 */

export interface PostDraftValue {
  type: PostType;
  title: string;
  body: string;
  /** 아래 6개는 문자열 그대로 보관한다 — input 값 그대로 왕복시키는 것이 목적이라
   *  숫자·날짜로 파싱해 되돌리는 변환 비용을 들일 이유가 없다. 빈 문자열이 곧 "미입력"이다
   *  (`meetupEndDate`가 비면 하루짜리 모임, `endTime`이 비면 종료 시각 미정). */
  meetupDate: string;
  meetupEndDate: string;
  voteDeadline: string;
  startTime: string;
  endTime: string;
  place: string;
  capacity: string;
}

export const EMPTY_POST_DRAFT: PostDraftValue = {
  type: "general",
  title: "",
  body: "",
  meetupDate: "",
  meetupEndDate: "",
  voteDeadline: "",
  startTime: "",
  endTime: "",
  place: "",
  capacity: "",
};

function draftKey(crewId: Id): string {
  return `mo_im:post-draft:${crewId}`;
}

function loadPostDraft(crewId: Id): PostDraftValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(crewId));
    if (!raw) return null;
    return JSON.parse(raw) as PostDraftValue;
  } catch {
    // 저장된 값이 손상됐거나(스키마 변경 등) localStorage 접근이 막혀 있으면(사파리 사생활
    // 보호 모드 등) 초안 없음과 동일하게 취급한다 — 임시 저장은 편의 기능이라 실패해도
    // 글쓰기 자체를 막지 않는다.
    return null;
  }
}

export function savePostDraft(crewId: Id, draft: PostDraftValue): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(draftKey(crewId), JSON.stringify(draft));
  } catch {
    // 용량 초과 등 — 조용히 무시한다(편의 기능, 위와 같은 이유).
  }
}

export function clearPostDraft(crewId: Id): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(crewId));
  } catch {
    // no-op
  }
}

export interface PostDraftSnapshot {
  /** false면 서버 렌더(또는 하이드레이션 이전)용 자리표시자다 — 아직 `localStorage`를
   *  읽지 않았다는 뜻이지 "초안 없음"이 확정된 것이 아니다. */
  resolved: boolean;
  /** true면 `values`가 실제로 저장된 초안에서 왔다(복구 안내 문구를 보여줄 조건). */
  restored: boolean;
  values: PostDraftValue;
}

/** `useSyncExternalStore`의 `getServerSnapshot`이 반환할 고정 참조 — 서버·하이드레이션
 *  이전 클라이언트 첫 렌더가 항상 이 값을 써야 두 렌더 결과가 일치한다(hydration mismatch
 *  방지). 매 호출 새 객체를 만들면 참조 동등성이 깨져 무한 재렌더 경고가 난다. */
export const PENDING_POST_DRAFT_SNAPSHOT: PostDraftSnapshot = {
  resolved: false,
  restored: false,
  values: EMPTY_POST_DRAFT,
};

/**
 * `useSyncExternalStore`의 `getSnapshot`(클라이언트 전용)이 쓸 실제 조회. 초안이 없으면
 * `computeDefaultVoteDeadline`(호출부가 넘긴다 — 이 모듈은 시각을 직접 계산하지 않는
 * 순수 저장소 계층으로 남긴다)로 기본 투표 마감을 채운 빈 초안을 만든다.
 */
export function resolvePostDraftSnapshot(
  crewId: Id,
  computeDefaultVoteDeadline: () => string,
): PostDraftSnapshot {
  const stored = loadPostDraft(crewId);
  if (stored) {
    return { resolved: true, restored: true, values: stored };
  }
  return {
    resolved: true,
    restored: false,
    values: { ...EMPTY_POST_DRAFT, voteDeadline: computeDefaultVoteDeadline() },
  };
}
