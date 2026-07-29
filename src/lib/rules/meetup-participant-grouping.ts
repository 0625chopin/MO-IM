import type { Id, MeetupAttendance } from "@/lib/types";

/**
 * 참석자 3구분 목록 판정(FR-068) — Task 022, 8일차. "참석/불참/미응답"으로 나누는 것은
 * 순수 포맷팅이 아니라 **판정**이다 — 응답 기록(`MeetupAttendance`)이 없는 크루원을
 * "미응답"으로 분류하려면 "누가 지금 이 모임에 응답할 자격이 있는 크루원인가"를 먼저
 * 정해야 하고(활성 크루원만, 탈퇴·강퇴자는 "미응답"에 넣지 않는다 — 이미 응답을 남긴
 * 탈퇴자는 그 응답 그룹에 그대로 남는다, D-010), 그 기준을 컴포넌트에 흩어 두면 목록이
 * 화면마다 갈리는 R-015 신호가 된다는 판단으로 `lib/rules/`에 뒀다(`docs/CONVENTIONS.md`
 * "판정이면 lib/rules, 순수 포맷팅·직렬화면 데이터/타입 모듈에 잔류" 기준, `README.md`
 * 참고). `groupMeetupParticipantIds`가 프로필 id만 반환하고, 표시용 프로필 정보(익명화된
 * displayName 포함)를 붙이는 것은 컨테이너 몫이다 — 이 파일은 `lib/data`를 참조하지 않는다.
 */

export interface MeetupParticipantGroups {
  attending: Id[];
  absent: Id[];
  /** 응답 기록이 없는 **현재 활성** 크루원. 탈퇴·강퇴자는 응답이 없었다면 여기 포함되지 않는다. */
  noResponse: Id[];
}

/**
 * @param activeMemberIds 현재 활성(`active`) 크루원의 profileId 목록 — "미응답" 후보군.
 * @param attendances 이 Meetup의 응답 기록 전체(활성 여부와 무관 — 탈퇴자의 과거 응답도 포함).
 *
 * **I-079/FR-065 AC2(26일차, BOARD) — `invalidatedAt` 무효화 반영.** 팀장이 사용자에게 받은
 * 결정("날짜가 바뀌면 기존 참석 응답을 전부 무효화하고 재확인을 요구한다")의 UI 반영 지점이
 * 여기다(`meetup-reschedule-079.md` §4.3). `invalidatedAt !== null`인 행은 `status` 값과
 * 무관하게 "미응답"으로 취급한다 — `responded` 집합에 넣지 않으므로 활성 크루원이면 자동으로
 * `noResponse`에 떨어진다. `status` 자체는 지우지 않는다(감사 이력, 이 함수는 그 값을 그냥
 * 무시할 뿐 변형하지 않는다).
 */
export function groupMeetupParticipantIds(
  activeMemberIds: readonly Id[],
  attendances: readonly Pick<MeetupAttendance, "profileId" | "status" | "invalidatedAt">[],
): MeetupParticipantGroups {
  const attending: Id[] = [];
  const absent: Id[] = [];
  const responded = new Set<Id>();

  for (const attendance of attendances) {
    if (attendance.invalidatedAt !== null) continue;
    responded.add(attendance.profileId);
    if (attendance.status === "attending") {
      attending.push(attendance.profileId);
    } else {
      absent.push(attendance.profileId);
    }
  }

  const noResponse = activeMemberIds.filter((profileId) => !responded.has(profileId));

  return { attending, absent, noResponse };
}
