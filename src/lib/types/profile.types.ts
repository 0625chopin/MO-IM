import type { Id, ISODateTimeString } from "./common.types";

/**
 * 계정 상태값. PRD §7·requirements.md 5.2절 모두 `status` 필드만 명시하고 값
 * 집합을 정의하지 않아, D-010(탈퇴 익명화)·FR-082(계정 제재)에서 근거를 역산해
 * 추론했다. 스키마 확정(Task 028) 전에 고객 확인이 필요하다.
 *
 * `deactivated`(Task 039, 18일차 추가) — FR-005 정상 흐름 ④의 "30일 유예" 구간. 탈퇴를
 * 요청했지만 PII는 아직 파기 전이라 {@link Profile.deactivatedAt} 기준 30일 이내면
 * AC3(복구)로 `active`로 되돌아갈 수 있다. `withdrawn`은 유예가 끝나 PII 파기까지 완료된
 * 종착 상태로 재정의했다(익명화 전 D-010 원안 당시엔 withdrawn이 즉시 파기 완료를 뜻했다).
 */
export type ProfileStatus = "active" | "suspended" | "withdrawn" | "deactivated";

export interface Profile {
  id: Id;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** 자기소개. D-035로 PRD §7에 복구된 필드. */
  bio: string | null;
  status: ProfileStatus;
  /** true면 핸들 검색 결과에서 제외된다(3.6절) — 초대 대상은 될 수 없고 본인 가입 신청은 가능. */
  searchOptOut: boolean;
  /** 탈퇴 익명화 시각. 탈퇴 전에는 null(D-010 — 삭제 로직 자체는 v0.2 대상이나 타입은 지금 확정한다). */
  anonymizedAt: ISODateTimeString | null;
  /**
   * 탈퇴 요청(30일 유예 시작) 시각(Task 039, NFR-031). `status==="deactivated"`일 때만
   * 의미가 있고, `anonymizedAt`과 의도적으로 분리했다 — `anonymizedAt`은 "실제로 PII를
   * 파기한 시각"만 기록해야 FR-005 AC4가 파기 완료 사실을 그대로 증언한다. 유예 만료 판정은
   * `lib/rules/auth-credentials.ts`의 `evaluateDeactivationGracePeriod`가 이 값을 쓴다.
   */
  deactivatedAt: ISODateTimeString | null;
  /**
   * 마지막 핸들 변경 시각 — FR-004 AC1(30일 1회 제한, `lib/rules/handle-validation.ts`의
   * `canChangeHandle`)의 근거 필드. 가입 시 최초 설정은 "변경"이 아니므로 `createProfile`이
   * 항상 `null`로 채운다(Task 015B). 계정 설정 화면에서 실제로 핸들을 바꾼 순간에만
   * `changeProfileHandle`이 이 값을 갱신한다.
   */
  handleChangedAt: ISODateTimeString | null;
  /**
   * 온보딩(FR-004) 완료 시각. null이면 미완료 — `/onboarding` 재방문 리다이렉트(PRD §2.2
   * 각주2) 판정 근거다. I-046 해소(Task 032) — 이전에는 `profiles`에 이 사실을 담을 컬럼이
   * 없어 보조 httpOnly 쿠키(`onboarding-flag-cookie.ts`, 이제 미사용)로 근사했다.
   */
  onboardingCompletedAt: ISODateTimeString | null;
  /**
   * FR-082 시스템 관리자 식별(D-049, Task 042B). self-service로 바꿀 수 없다 — `profiles`
   * 테이블의 `profiles_guard_self_status_transition` 트리거가 `auth.uid() = old.id`
   * 컨텍스트에서 이 컬럼 변경 자체를 거부한다(RLS는 행 단위만 제한하므로 컬럼 단위 방어는
   * 트리거 몫). 최초 지정은 서비스 경로(마이그레이션 직접 UPDATE)로만 한다 — 셀프서비스
   * 승격 UI/RPC를 의도적으로 두지 않았다. 이 필드가 `false`인 것이 절대다수(3.1절 역할표
   * "시스템 관리자"는 전역 role이지 크루 role이 아니다)라 목록 조회(`searchProfilesByHandle`
   * 등)에는 노출하지 않는다 — `checkPermission`의 `role: "system_admin"` 판정에만 쓰인다.
   */
  isSystemAdmin: boolean;
}

/**
 * 로그인 시도 기록 — 계정 단위 잠금(D-020)의 근거 테이블. Supabase Auth의
 * 레이트 리밋이 IP/프로젝트 단위라 "자격 증명이 맞아도 거부"(FR-002 AC4)를
 * 표현할 수 없어 자체 구현한다. **클라이언트는 이 타입의 데이터에 접근하지
 * 않는다** — 로그인 경로(Server Action/Edge Function) 전용.
 */
export interface AuthAttempt {
  identifier: string;
  attemptedAt: ISODateTimeString;
  succeeded: boolean;
}
