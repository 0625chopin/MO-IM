/**
 * 크루명 형식·금칙어 검증 — 순수 함수 (NFR-036, R-015, Task 016B). FR-010 정상 흐름 ③이
 * "제출"에서 검사하고, E3("금칙어 포함 → 거부")가 이 판정의 근거다.
 *
 * **글자 수 상한(`CREW_NAME_MAX_LENGTH`)은 28일차 D-083으로 확정되고 29일차 DB CHECK
 * (`crews_name_check`)로 승격됐다 — 더 이상 잠정값이 아니다.** 금칙어 목록(`BANNED_WORDS`)은
 * **34일차 팀 재량 확정(A안, I-038)** — 사용자가 결정 권한을 팀에 위임했고(D-095가 좁힌 잔여
 * 범위), FR-010 원문이 요구하는 것은 "거부하는 예외 흐름의 존재"뿐 목록의 완전성·우회 표기
 * (초성 분해·유니코드 치환 등) 대응 수준이 아니라는 판단에 따라 **현재 데모 6단어 목록을
 * 그대로 동결하고 우회 표기 대응은 신설하지 않는다.** 근거: ① 운영 부담(사전을 실 운영
 * 수준으로 유지하려면 지속적 법무·운영 검토가 필요) ② 오탐 위험(사전이 넓을수록 정상 크루명이
 * 걸릴 위험 증가) ③ 사전 기반 필터는 우회 표기를 원리상 완결되게 막을 수 없다 — 더 큰 사전으로도
 * 해소되지 않는 구조적 한계다 ④ v0.2 신고(FR-080)·관리자 콘솔(FR-082)이 이미 사후 처리
 * 이중 방어선으로 존재한다. 상세: `docs/DECISIONS.draft.CREW.md`(병합 전), `docs/ISSUES.md`
 * I-038(해결됨).
 */

export const CREW_NAME_MIN_LENGTH = 1;
export const CREW_NAME_MAX_LENGTH = 30;

/**
 * 최소 금칙어 집합(대소문자 무시, 부분 일치). **34일차 팀 재량 확정(A안, I-038)으로 동결** —
 * 목록을 더 포괄적인 사전으로 확장하지 않고, 초성 분해·유니코드 치환 등 우회 표기 대응도
 * 신설하지 않는다(근거는 위 파일 docstring). 이 배열은 "검사 지점이 존재한다"는 것을 보이는
 * 최소 집합이며, 놓치는 우회는 v0.2 신고·관리자 콘솔이 사후 처리로 보완한다.
 */
const BANNED_WORDS: readonly string[] = ["씨발", "병신", "좆", "지랄", "fuck", "shit"];

export type CrewNameViolation = "required" | "too_long" | "banned_word";

export interface CrewNameCheckResult {
  valid: boolean;
  violations: CrewNameViolation[];
}

/** 앞뒤 공백은 트림 후 판정한다. 크루명 중복은 여기서 다루지 않는다 — D-008 E1이 "허용"으로
 *  확정했으므로(목록에서 오너 핸들 병기) 검증 대상이 아니다. */
export function validateCrewName(name: string): CrewNameCheckResult {
  const trimmed = name.trim();
  const violations: CrewNameViolation[] = [];

  if (trimmed.length < CREW_NAME_MIN_LENGTH) {
    violations.push("required");
  }
  if (trimmed.length > CREW_NAME_MAX_LENGTH) {
    violations.push("too_long");
  }
  const lower = trimmed.toLowerCase();
  if (BANNED_WORDS.some((word) => lower.includes(word.toLowerCase()))) {
    violations.push("banned_word");
  }

  return { valid: violations.length === 0, violations };
}
