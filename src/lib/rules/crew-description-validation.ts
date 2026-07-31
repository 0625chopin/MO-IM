/**
 * 크루 소개(description) 형식 검증 — 순수 함수 (NFR-036, R-015, Task 016B). FR-010 개설 폼의
 * "소개" 필드가 쓴다.
 *
 * **`CREW_DESCRIPTION_MAX_LENGTH`는 28일차 D-083으로 확정되고 29일차 DB CHECK
 * (`crews_description_check`)로 승격됐다 — 더 이상 잠정값이 아니다**(`bio-validation.ts`의
 * `BIO_MAX_LENGTH`, 150자보다 넉넉하게 잡은 값 그대로 확정됨). I-038의 나머지 범위(금칙어 목록·
 * 우회 표기 정책)는 이 필드가 아니라 `crew-name-validation.ts`의 `BANNED_WORDS` 쪽 소관이며
 * 34일차 팀 재량으로 A안(목록 동결) 확정됐다 — 상세는 그 파일 docstring·`docs/ISSUES.md`
 * I-038(해결됨) 참고.
 */

export const CREW_DESCRIPTION_MIN_LENGTH = 1;
export const CREW_DESCRIPTION_MAX_LENGTH = 300;

export type CrewDescriptionViolation = "required" | "too_long";

export interface CrewDescriptionCheckResult {
  valid: boolean;
  violations: CrewDescriptionViolation[];
}

/** FR-010 정상 흐름은 소개를 필수 입력 항목으로 나열한다 — bio(선택)와 달리 최소 길이가 있다. */
export function validateCrewDescription(description: string): CrewDescriptionCheckResult {
  const trimmed = description.trim();
  const violations: CrewDescriptionViolation[] = [];

  if (trimmed.length < CREW_DESCRIPTION_MIN_LENGTH) {
    violations.push("required");
  }
  if (trimmed.length > CREW_DESCRIPTION_MAX_LENGTH) {
    violations.push("too_long");
  }

  return { valid: violations.length === 0, violations };
}
