import type { ISODateString, Meetup } from "@/lib/types";

/**
 * 정원 마감·참석 가능 여부 판정 (FR-066·067, D-013·D-019) — Task 022, 8일차.
 *
 * **원자성 자체는 이 파일의 책임이 아니다** — 동시 요청에서 "정확히 0명만 추가"를
 * 보장하는 것은 `lib/data/mock/meetup.ts`의 `respondAttendance`(조건부 UPDATE와 동등한
 * 순차 실행, D-019)와 실데이터의 `attending_count < capacity` 조건부 UPDATE 몫이다. 이
 * 파일의 함수들은 **표시·버튼 활성화를 위한 낙관적 판정**만 한다 — 실제 신청 시점의
 * 정원 재검사는 데이터 레이어가 다시 한다(그래서 `respondAttendance`가 여전히
 * `{success:false, reason:"full"}`을 반환할 수 있다).
 *
 * `now`/`todayIso`를 인자로 받고 내부에서 `Date.now()`를 호출하지 않는다 — 순수 함수로
 * 유지해 테스트 가능하게 하기 위해서다(NFR-036, `lib/rules/poll-timezone.ts`와 같은 원칙).
 */

/** FR-066 AC1·E1 — 정원이 지정되어 있고 이미 다 찼는가. capacity가 null이면 항상 false. */
export function isMeetupFull(meetup: Pick<Meetup, "capacity" | "attendingCount">): boolean {
  return meetup.capacity !== null && meetup.attendingCount >= meetup.capacity;
}

/**
 * FR-066 사전조건 "Meetup이 확정(confirmed) 상태이고 예정일이 지나지 않았다" — FR-067 E1의
 * "예정일 경과 → 취소 불가"도 같은 판정을 공유한다. 날짜(YYYY-MM-DD) 문자열 사전순 비교이므로
 * `>= todayIso`면 아직 열려 있다(모임 당일까지는 응답 가능).
 *
 * **기준은 시작일이 아니라 종료일이다**(다일 모임 지원, 2026-07-31) — 8/1~8/5짜리 모임이
 * 8/2에 닫히면 아직 진행 중인 모임의 참석 응답·취소·일정 변경 제안이 전부 막힌다. 하루짜리
 * 모임에서는 `endDate === date`라 판정 결과가 이전과 같다.
 */
export function isMeetupAttendanceOpen(
  meetup: Pick<Meetup, "status" | "endDate">,
  todayIso: ISODateString,
): boolean {
  return meetup.status === "confirmed" && meetup.endDate >= todayIso;
}
