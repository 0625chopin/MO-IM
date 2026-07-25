import type { Id, Profile } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { generateId, store } from "./fixtures";

/**
 * Profile 데이터 접근 (FR-001 일부·FR-004·FR-006).
 *
 * 인증(회원가입 시 자격 증명 발급·로그인 세션 발급)은 이 레이어의 책임이 아니다 —
 * Supabase Auth(또는 Mock 단계의 Server Action)가 처리하고, 그 결과로 얻은
 * `profileId`만 이 레이어의 다른 함수들이 인자로 받는다(CON-06). `AuthAttempt`
 * (`profile.types.ts`)는 로그인 경로 전용이라 여기서 다루지 않는다.
 */

export async function getProfileById(id: Id): Promise<Profile | null> {
  return store.profiles.find((p) => p.id === id) ?? null;
}

export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  return store.profiles.find((p) => p.handle === handle) ?? null;
}

/**
 * 핸들 검색(FR-006). `searchOptOut`인 프로필은 결과에서 제외한다(3.6절).
 *
 * NFR-013(검색 응답 3필드 제한)은 v0.2 등급이라 이번 회차에는 강제하지 않는다 — 지금은
 * 전체 `Profile`을 반환한다. v0.2에서 이 함수의 반환 타입을 좁은 프로젝션으로 바꿀 때
 * `lib/types`에 별도 조회 전용 타입을 추가해야 한다(NFR-035 "타입 그대로 쓴다"는 유지하되
 * 새 타입 추가는 그 시점 담당자의 몫).
 */
export async function searchProfilesByHandle(
  query: string,
  opts: { limit?: number } = {},
): Promise<Profile[]> {
  const limit = opts.limit ?? 20;
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return store.profiles
    .filter((p) => !p.searchOptOut && p.handle.toLowerCase().includes(needle))
    .slice(0, limit);
}

export interface CreateProfileInput {
  handle: string;
  displayName: string;
}

/** 회원가입 시 프로필 레코드 생성(FR-001의 데이터 계층 몫). 핸들 중복은 conflict. */
export async function createProfile(input: CreateProfileInput): Promise<DataResult<Profile>> {
  const exists = store.profiles.some((p) => p.handle === input.handle);
  if (exists) {
    return err("conflict", `handle "${input.handle}" 은 이미 사용 중이다.`);
  }
  const profile: Profile = {
    id: generateId("profile"),
    handle: input.handle,
    displayName: input.displayName,
    avatarUrl: null,
    bio: null,
    status: "active",
    searchOptOut: false,
    anonymizedAt: null,
    deactivatedAt: null,
    // 가입 시 최초 설정은 "변경"이 아니다(FR-004 AC1, `canChangeHandle` docstring) — 항상 null로
    // 시작해 첫 실제 변경 전까지는 쿨다운이 걸리지 않는다.
    handleChangedAt: null,
    onboardingCompletedAt: null,
    isSystemAdmin: false,
  };
  store.profiles.push(profile);
  return ok(profile);
}

export type UpdateProfileInput = Partial<
  Pick<Profile, "displayName" | "avatarUrl" | "bio" | "searchOptOut">
>;

/**
 * 프로필 수정(FR-004). status·anonymizedAt은 서버 로직(탈퇴 등) 전용이라 여기로 받지 않는다.
 * **handle도 여기로 받지 않는다** — `changeProfileHandle`(아래)로 분리했다: FR-004 AC1의
 * 30일 쿨다운·핸들 중복 검사는 표시 이름·소개·검색 노출 저장과 다른 실패 모드를 가져서
 * 같은 트랜잭션에 묶으면 "핸들만 실패했는데 나머지도 함께 롤백해야 하는지"가 애매해진다
 * (Task 015B, 계정 설정 화면).
 */
export async function updateProfile(
  id: Id,
  patch: UpdateProfileInput,
): Promise<DataResult<Profile>> {
  const profile = store.profiles.find((p) => p.id === id);
  if (!profile) return err("not_found", `profile ${id} 를 찾을 수 없다.`);
  Object.assign(profile, patch);
  return ok(profile);
}

/**
 * 핸들 변경(FR-004 AC1, Task 015B) — 계정 설정 화면 전용. 30일 쿨다운 판정(`canChangeHandle`)은
 * 이 함수의 책임이 아니다 — 순수 판정은 `lib/rules/handle-validation.ts`가 이미 갖고 있고,
 * Server Action(`lib/actions/change-account-handle.ts`)이 그 판정을 먼저 통과시킨 뒤에만 이
 * 함수를 부른다(`updatePost`가 권한 판정을 스스로 하지 않는 것과 같은 분업, `contracts.ts`
 * 모듈 docstring 참고). 이 함수는 ① 새 핸들 중복 ② 존재하지 않는 프로필만 방어적으로 확인한다.
 */
export async function changeProfileHandle(
  id: Id,
  newHandle: string,
): Promise<DataResult<Profile>> {
  const profile = store.profiles.find((p) => p.id === id);
  if (!profile) return err("not_found", `profile ${id} 를 찾을 수 없다.`);

  const takenByAnother = store.profiles.some((p) => p.id !== id && p.handle === newHandle);
  if (takenByAnother) {
    return err("conflict", `handle "${newHandle}" 은 이미 사용 중이다.`);
  }

  profile.handle = newHandle;
  profile.handleChangedAt = new Date().toISOString();
  return ok(profile);
}
