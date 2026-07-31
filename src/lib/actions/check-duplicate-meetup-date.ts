"use server";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewMembership, listMeetupsByCrews } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import type { Id } from "@/lib/types";

export interface CheckDuplicateMeetupDateInput {
  crewId: Id;
  /** 모임 시작일 ISODateString(YYYY-MM-DD). */
  date: string;
  /**
   * 모임 종료일(선택). 비면 하루짜리로 보고 `date`만 확인한다. 값이 있으면 **그 기간과
   * 하루라도 겹치는** 확정 모임이 있는지 본다(다일 모임 지원, 2026-07-31) — 기간 제안에서
   * 시작일만 비교하면 "8/1~8/5 제안 vs 8/3 확정 모임"을 놓친다.
   */
  endDate?: string | null;
}

/**
 * FR-034 E4 "동일 날짜 제안이 이미 가결됨 → 경고 후 진행 허용"의 **비차단** 사전 확인
 * (Task 018B). `PostWriteForm`이 모임 예정일 필드를 벗어날 때 호출해 안내 배너를 켠다.
 *
 * "경고 후 진행 허용"은 등록을 막지 않는다는 뜻이라 `createPostAction`은 이 검사를
 * 반복하지 않는다 — 여기서 실패(guest·비크루원 등)해도 `duplicate: false`로 조용히
 * 안내를 생략할 뿐, 등록 자체를 막는 판정이 아니므로 fail-closed가 아니라 fail-quiet로
 * 충분하다(정보 노출 범위도 "그 날짜에 이미 확정된 모임이 있다/없다"뿐이라 낮다).
 */
export async function checkDuplicateMeetupDateAction(
  input: CheckDuplicateMeetupDateInput,
): Promise<{ duplicate: boolean }> {
  if (!input.date) return { duplicate: false };

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { duplicate: false };
  }

  const membership = await getCrewMembership(input.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  if (!checkPermission({ role, action: "board:read" }).allowed) {
    return { duplicate: false };
  }

  // 종료일이 시작일보다 앞서는 잘못된 입력이면 조회 구간이 뒤집혀 항상 0건이 된다 —
  // 그 경우는 하루짜리로 좁혀 확인한다(어차피 등록 시점에 `scheduledEndDate` 검증이 막는다).
  const to = input.endDate && input.endDate >= input.date ? input.endDate : input.date;
  const meetups = await listMeetupsByCrews({
    crewIds: [input.crewId],
    from: input.date,
    to,
  });
  return { duplicate: meetups.length > 0 };
}
