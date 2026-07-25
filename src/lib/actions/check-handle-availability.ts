"use server";

import { getProfileByHandle } from "@/lib/data";
import { validateHandleFormat, type HandleFormatCheckResult } from "@/lib/rules/handle-validation";

/**
 * FR-001 AC2 — 핸들 실시간 중복 검사. `SignupForm`이 핸들 입력란 blur마다 이 함수를 직접
 * 호출한다(폼 제출이 아니라 일반 함수 호출로 쓰는 Server Action — Next.js는 `'use server'`
 * 함수를 폼 action 밖에서도 클라이언트 컴포넌트가 그냥 호출할 수 있게 한다).
 *
 * **가입/핸들 변경 시 "유일성 중복 검사" 전용이다 — FR-006 핸들 검색에는 쓰지 않는다.**
 * `getProfileByHandle`은 `searchOptOut`과 무관하게 존재 여부를 그대로 반환한다(유일성은
 * 옵트아웃과 무관해야 하므로 여기서는 맞는 동작이다). 하지만 FR-006 핸들 검색은 옵트아웃
 * 사용자를 "존재하지 않는 핸들"과 구분 불가능하게 응답해야 한다(3.6절, D-005, R-012) — 이
 * 함수를 검색에 재사용하면 옵트아웃 사용자의 핸들 존재 여부가 새어 나간다. FR-006 검색은
 * `lib/data`의 `searchProfilesByHandle` 기반 별도 조회를 쓴다.
 *
 * **⚠️ 이 액션은 미인증(guest) 호출자도 부를 수 있고, 지금은 리밋이 없다(I-065, 19일차 팀장
 * 교차검증).** 회원가입 화면(세션 없음)에서 이 액션이 정상적으로 동작해야 하므로 인증 검사
 * 자체를 둘 수 없다 — `search-user-by-handle.ts`(FR-006, 로그인 필요·D-005 SQL 리밋)와 다른
 * 성격이다. 반환값이 `available: boolean`(그 핸들 하나의 존재 여부) 하나뿐이라 노출은
 * 제한적이지만(전체 회원 명부·PII 없음), 리밋이 없어 봇이 핸들 네임스페이스 전체를 저비용으로
 * 훑을 수 있는 것 자체는 R-012 우려에 해당한다. `getProfileByHandle`이 19일차부터 service-role
 * (RLS 완전 우회)로 조회하기 때문에 이전(═authenticated qual=true 시절에도 `anon`은 애초에
 * 접근 불가)과 달리 이제 이 경로가 실제로 동작한다 — 방어를 추가하지 않고 그대로 둔 판단
 * 근거·검토한 설계는 I-065에 있다.
 *
 * `excludeProfileId`를 주면 "본인의 현재 핸들"은 중복으로 치지 않는다(핸들 변경 화면에서
 * 저장 버튼을 누르지 않고 다시 blur만 해도 자기 핸들이 "이미 사용 중"으로 뜨는 오탐을
 * 막는다 — FR-004 AC1의 30일 쿨다운 판정은 `lib/rules/handle-validation.ts`의
 * `canChangeHandle`이 별도로 맡는다). 회원가입 경로(이 화면)는 항상 `excludeProfileId`를
 * 생략한다 — 아직 프로필이 없다.
 *
 * 형식이 틀리면 서버 조회 자체를 하지 않는다 — `available: null`로 "판단 보류"를 표현한다
 * (`false`를 쓰면 "중복"과 "형식 오류"가 같은 신호가 되어 `SignupForm`이 둘을 구분해
 * 다른 문구를 보여줄 수 없다).
 */
export interface HandleAvailability {
  format: HandleFormatCheckResult;
  available: boolean | null;
}

export async function checkHandleAvailabilityAction(
  handle: string,
  excludeProfileId?: string,
): Promise<HandleAvailability> {
  const format = validateHandleFormat(handle);
  if (!format.valid) {
    return { format, available: null };
  }

  const existing = await getProfileByHandle(handle);
  const available = existing === null || existing.id === excludeProfileId;
  return { format, available };
}
