import type { Profile } from "@/lib/types";

import { BIO_TEMPLATES, GIVEN_NAMES, HANDLE_THEMES, SURNAMES } from "./content-bank";
import { chance, pick, type Rng } from "./prng";

/**
 * Profile 300개 목표(Task 010 스펙) 중 기존 최소 픽스처의 3개(profile-1~3)를 뺀
 * 나머지를 생성한다. `generateId`는 호출자(fixtures.ts)가 넘긴다 — 이 모듈은
 * ID 발급 순서에 관여하지 않고, 호출자가 정한 순서(프로필 → 크루 → …)를 그대로 따른다.
 *
 * 핸들은 `테마단어_순번`(예: run_004)으로 만들어 유일성을 보장한다 — PRNG로 뽑은
 * 단어가 겹쳐도 순번이 겹치지 않으므로 충돌 검사가 필요 없다.
 */
export function generateProfiles(
  rng: Rng,
  count: number,
  generateId: (prefix: string) => string,
  startIndex: number,
): Profile[] {
  const profiles: Profile[] = [];
  for (let i = 0; i < count; i++) {
    const seq = startIndex + i;
    const displayName = `${pick(rng, SURNAMES)}${pick(rng, GIVEN_NAMES)}`;
    const handle = `${pick(rng, HANDLE_THEMES)}_${String(seq).padStart(3, "0")}`;

    // 대부분 active. withdrawn(탈퇴 파기 완료, D-010)·deactivated(탈퇴 30일 유예 중,
    // Task 039)·suspended(제재)는 소수만 — 화면이 아직 없어도 타입/렌더링이 이 상태들을
    // 다뤄야 한다는 걸 시드가 보여준다.
    const statusRoll = rng();
    const status: Profile["status"] =
      statusRoll < 0.01
        ? "withdrawn"
        : statusRoll < 0.02
          ? "deactivated"
          : statusRoll < 0.04
            ? "suspended"
            : "active";

    const isWithdrawn = status === "withdrawn";
    const isDeactivated = status === "deactivated";

    profiles.push({
      id: generateId("profile"),
      handle,
      // D-010 익명화 규칙 자체는 Task 039(v0.2) 구현 대상이라 이 시드는 "이미 익명화된
      // 상태"의 최종 모습만 흉내낸다 — 실제 익명화 변환 로직은 여기 없다. `deactivated`는
      // 아직 파기 전(유예 중)이라 실명·실아바타를 그대로 유지한다 — 그게 이 상태의 정의다
      // (18일차 교차검증 minor 1이 정확히 이 구분을 앱 검색 경로에 반영시켰다).
      displayName: isWithdrawn ? "탈퇴한 사용자" : displayName,
      avatarUrl: null,
      bio: isWithdrawn ? null : chance(rng, 0.55) ? pick(rng, BIO_TEMPLATES) : null,
      status,
      searchOptOut: !isWithdrawn && chance(rng, 0.08),
      anonymizedAt: isWithdrawn ? "2026-06-01T00:00:00.000Z" : null,
      // Task 039 — withdrawn은 "30일 유예가 끝나 파기까지 완료된" 종착 상태다(profile.types.ts
      // ProfileStatus 참고). 시드는 그 유예가 시작된 시각만 근사로 채운다(파기 시각보다 30일 전).
      // `deactivated`는 유예가 아직 끝나지 않은 중간 지점(15일 전, 이 저장소 기준일
      // 2026-07-25로부터 절반 지점)을 근사한다 — 그레이스 카운트다운 화면을 Mock으로도
      // 시연할 수 있어야 한다(18일차 교차검증 minor 2).
      deactivatedAt: isWithdrawn ? "2026-05-02T00:00:00.000Z" : isDeactivated ? "2026-07-10T00:00:00.000Z" : null,
      // FR-004 AC1(30일 쿨다운, Task 015B)의 근거 필드. 대량 시드는 "핸들을 바꾼 적 없는"
      // 기본 상태만 표현한다 — 쿨다운 잠김 상태는 /sample 정적 데모로 별도 시연한다.
      handleChangedAt: null,
      onboardingCompletedAt: isWithdrawn ? null : "2026-06-01T00:00:00.000Z",
    });
  }
  return profiles;
}
