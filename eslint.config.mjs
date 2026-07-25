import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// ---------------------------------------------------------------------------
// Task 001 (CORE, 1주차) — 디렉터리 구조·명명 규약과 짝을 이루는 import 경계 규칙.
// 규약 문서: docs/CONVENTIONS.md. 참조: R-007, R-003, R-015, NFR-034·036·037, CON-05, D-030.
//
// 아래 zone 1~6 블록은 대상 `files`/`ignores`가 서로 겹치지 않도록 설계했다.
// ESLint flat config는 같은 파일에 매치되는 여러 config 객체의 같은 rule을
// "병합"하지 않고 배열 순서상 나중 객체가 통째로 덮어쓴다 — 겹치면 앞 블록의
// 제한이 조용히 무력화된다. 블록을 늘릴 때는 겹침이 없는지 먼저 확인할 것
// (docs/CONVENTIONS.md "리뷰 짝이 볼 핵심 포인트" 1번).
// ---------------------------------------------------------------------------

const SUPABASE_CLIENT_MESSAGE =
  "Supabase 클라이언트는 src/lib/data/supabase 와 src/lib/realtime(구현체)에서만 import 한다 — NFR-034, R-015.";

/** @supabase/* 를 막는 공통 규칙 조각. paths(정확한 패키지명)와 patterns(서브패스)를 함께 막는다. */
const noSupabaseClient = {
  paths: [{ name: "@supabase/supabase-js", message: SUPABASE_CLIENT_MESSAGE }],
  patterns: [{ group: ["@supabase/*"], message: SUPABASE_CLIENT_MESSAGE }],
};

const noMockImpl = {
  group: ["@/lib/data/mock", "@/lib/data/mock/*"],
  message: "실데이터 구현은 Mock 구현을 참조하지 않는다 — NFR-034.",
};

const noSupabaseDataImpl = {
  group: ["@/lib/data/supabase", "@/lib/data/supabase/*"],
  message: "Mock 구현은 실데이터 구현을 참조하지 않는다 — NFR-034.",
};

const noDeepRealtimeImpl = {
  group: ["@/lib/realtime/mock", "@/lib/realtime/broadcast"],
  message:
    "구독은 배럴(@/lib/realtime)을 통해서만 조립한다 — 구현체를 직접 import하지 않는다 (D-030 ②).",
};

const noDataLayer = {
  group: ["@/lib/data", "@/lib/data/*"],
  message:
    "표현 컴포넌트는 데이터를 props로만 받는다 — 조회는 컨테이너(*Container.tsx)의 책임이다 (D-030 ①).",
};

const noRealtimeLayer = {
  group: ["@/lib/realtime", "@/lib/realtime/*"],
  message:
    "표현 컴포넌트는 구독을 소유하지 않는다 — 구독은 컨테이너(*Container.tsx)의 책임이다 (D-030 ①·②).",
};

// I-074(21일차, CORE) — `getProfileByHandle`(service-role, RLS 완전 우회) 익명 오라클 재발
// 방지. docstring 규약("익명 컨텍스트 호출은 checkHandleAvailabilityAction 하나만 거친다")만
// 있던 걸 이번에 컴파일러가 강제하는 정적 검사로 승격한다 — 같은 구멍이 I-058 major①(19일차,
// get_profile_public_by_handle RPC 경유)·I-065 major①(20일차, signup.ts 직접 호출) 두 번
// 실제로 뚫렸다. 실 소비자는 `@/lib/data` 배럴에서 이 이름을 named import 하므로(파일 딥
// 임포트가 아니다 — 딥 임포트는 zone 3·6의 noSupabaseDataImpl이 이미 전면 차단한다),
// `no-restricted-imports`의 `paths[].importNames`로 "이 배럴의 이 이름만" 좁혀 막는다(파일
// 단위 허용 목록이 아니라 특정 named export 사용처 제한 — 조사 결과 이 옵션이 지원한다).
const noGetProfileByHandleFromBarrel = {
  name: "@/lib/data",
  importNames: ["getProfileByHandle"],
  message:
    "getProfileByHandle은 service-role로 RLS를 완전히 우회하는 무제한 조회다 — 익명 컨텍스트에서 " +
    "직접 호출하지 않는다. 허용된 두 진입점(check-handle-availability.ts의 " +
    "checkHandleAvailabilityAction · invite-crew-member.ts)만 예외다 (I-074, I-065, D-047).",
};

// I-074 major(21일차, DESIGN 프로브 실증) — 위 규칙은 "@/lib/data" 배럴 named import만
// 매칭해 src/lib/data/supabase/** 내부의 상대경로 import(`./profile-handle-oracle`,
// `../profile-handle-oracle` 등, 호출부 위치마다 표기가 다르다)는 막지 못했다. 함수를
// `profile-handle-oracle.ts` 하나로 격리해(profile.ts→profile-handle-oracle.ts 이동)
// 파일 이름 하나만 표적하는 group 패턴으로 위치·깊이 무관하게 막는다 — `paths`(정확한
// 지정자 문자열)로 표기 변형을 전부 나열하는 대안보다 이쪽이 새 하위 폴더가 생겨도
// 안정적이다(파일 분리 자체가 CORE의 판단 근거, `profile-handle-oracle.ts` 모듈
// docstring 참고). zone 3(`src/lib/data/supabase/**`) 자기 자신에게만 적용한다 — 이
// 계층 밖(zone 6 등)의 딥 임포트는 기존 `noSupabaseDataImpl`이 이미 전면 차단한다.
// I-074 3차 보완(21일차, DESIGN 프로브 F 재검증) — 위 group 패턴 3종은 "profile-handle-oracle"
// 로 문자열이 정확히 끝나야 매칭되는데(minimatch), `tsconfig.json`의 `moduleResolution:
// "bundler"`는 `./profile-handle-oracle.ts`처럼 **확장자를 붙인 표기도 실제로 허용한다** —
// 그 경우 문자열이 ".ts"로 끝나 매칭에 실패했다(전례는 0건이라 minor로 평가됐지만, "정적
// 검사로 막았다"는 이 규칙의 존재 이유 자체에 남는 흠이라 보완한다). 브레이스 확장
// (`{a,b}`)에 기대지 않고 확장자별로 명시적으로 나열한다 — 지원 여부를 가정하지 않고
// 검증 가능한 형태를 우선한다.
const PROFILE_HANDLE_ORACLE_SPECIFIER_STEMS = [
  "**/profile-handle-oracle",
  "./profile-handle-oracle",
  "../profile-handle-oracle",
];
const PROFILE_HANDLE_ORACLE_EXTENSIONS = ["", ".ts", ".js"];
const noProfileHandleOracleRelative = {
  group: PROFILE_HANDLE_ORACLE_SPECIFIER_STEMS.flatMap((stem) =>
    PROFILE_HANDLE_ORACLE_EXTENSIONS.map((ext) => `${stem}${ext}`),
  ),
  message:
    "getProfileByHandle은 profile-handle-oracle.ts 밖에서 상대경로로 import하지 않는다 — " +
    "이 계층 안의 새 형제 파일도, 확장자를 붙인 표기(.ts·.js)도 예외가 아니다. 필요하면 " +
    "@/lib/data 배럴을 거치되, 그 경우도 허용된 두 진입점(check-handle-availability.ts· " +
    "invite-crew-member.ts)만 예외다 (I-074).",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Task 024(DESIGN, 10일차) — 접근성 자동화 검증 도입 결정(R-002 근거,
  // docs/decisions/accessibility-tooling.md). `eslint-config-next/core-web-vitals`가 이미
  // `jsx-a11y` 6개 규칙만 부분 배선해 두었던 것을 `flatConfigs.recommended`(34개 규칙)로
  // 확장한다 — 새 패키지 설치가 아니라(`eslint-plugin-jsx-a11y`는 `eslint-config-next`의
  // 전이 의존성으로 이미 설치돼 있었다) 이미 있던 것을 온전히 켜는 결정이다. `plugins` 키는
  // 뺀다 — `nextVitals`가 이미 같은 "jsx-a11y" 이름으로 플러그인을 등록해서 다시 선언하면
  // flat config가 "Cannot redefine plugin"으로 거부한다. `rules`만 가져와 얹는다. axe-core
  // 같은 런타임 검증은 테스트 러너가 없어(R-002) 도입하지 않는다 — 결정 문서 참고.
  { rules: jsxA11y.flatConfigs.recommended.rules },

  // 공통: import 정렬 — 상대·별칭 경로 혼용을 눈에 띄게 한다 (R-007 신호).
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          pathGroups: [{ pattern: "@/**", group: "internal", position: "before" }],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },

  // zone 1: src/lib/rules/** — React 비의존 순수 함수 (NFR-036, R-015, CON-05).
  // 투표 판정·정족수·권한 판정·색 해시 등. React Compiler는 컴포넌트·훅만 메모이즈하므로
  // 이 계층은 최적화 대상 밖이며, 네이티브 전환 시 그대로 재사용해야 하는 부분이다.
  {
    files: ["src/lib/rules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "src/lib/rules/**는 React 비의존 순수 함수만 둔다 (NFR-036)." },
            { name: "react-dom", message: "src/lib/rules/**는 React 비의존 순수 함수만 둔다 (NFR-036)." },
            ...noSupabaseClient.paths,
          ],
          patterns: [
            { group: ["next", "next/*"], message: "src/lib/rules/**는 Next.js에 의존하지 않는다 (R-015)." },
            { group: ["@/app/*"], message: "src/lib/rules/**는 라우트 레이어를 참조하지 않는다 (R-015)." },
            { group: ["@/components/*"], message: "src/lib/rules/**는 컴포넌트를 참조하지 않는다 (R-015)." },
            noDataLayer,
            noRealtimeLayer,
            ...noSupabaseClient.patterns,
          ],
        },
      ],
    },
  },

  // zone 2: src/lib/data/mock/** — Mock 데이터 접근 구현 (NFR-034).
  {
    files: ["src/lib/data/mock/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...noSupabaseClient.paths], patterns: [noSupabaseDataImpl, ...noSupabaseClient.patterns] },
      ],
    },
  },

  // zone 3: src/lib/data/supabase/** — 실데이터 접근 구현 (NFR-034). 여기서만 Supabase 클라이언트 허용.
  {
    files: ["src/lib/data/supabase/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noMockImpl, noProfileHandleOracleRelative] }],
    },
  },

  // zone 7: src/lib/auth/** — 인증 세션·계정 잠금 (Task 030, CREW, 17일차). `src/lib/realtime/**`와
  // 대칭 — data 배럴 밖에 있으면서 Supabase 클라이언트를 직접 다루는 독립 계층이다. `src/lib/data/
  // contracts.ts`의 CON-05·CON-06("이 레이어의 어떤 함수도 쿠키·세션·요청 객체를 직접 읽지 않는다")
  // 을 지키려면 세션은 데이터 배럴에 섞을 수 없다는 것이 팀장 판정(17일차)이었다 — 그래서
  // `src/lib/data/supabase/`가 아니라 여기 둔다. 다만 클라이언트 팩터리를 중복 구현하지 않도록
  // `@/lib/data/supabase/server`·`client`·`env`(인프라 3개)만 **읽기 전용으로 재사용**하도록 허용하고,
  // 도메인 구현(`board`·`crew`·`profile`·`database.types` 등) 딥 임포트는 그대로 막는다 — 부정
  // 패턴(`!`)으로 인프라 3개만 예외 처리한다. 근본적으로는 이 팩터리들 자체가 "데이터가 아니라
  // 인프라"라 `src/lib/supabase/`로 올라가야 맞다는 것이 이 zone의 임시성을 낳은 근거다(등재:
  // `docs/ISSUES.md`, 이동은 DESIGN이 `src/lib/data/supabase/`를 대대적으로 고치는 이번 회차가
  // 끝난 뒤로 미룬다). 부정 패턴이 의도대로 동작하는지는 프로브 파일로 실측했다 —
  // `docs/decisions/auth-integration-030.md` §1 참고.
  {
    files: ["src/lib/auth/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            noMockImpl,
            {
              group: [
                "@/lib/data/supabase/*",
                "!@/lib/data/supabase/server",
                "!@/lib/data/supabase/client",
                "!@/lib/data/supabase/env",
              ],
              message:
                "src/lib/auth/**는 Supabase 클라이언트 팩터리(server·client·env)만 재사용한다 — 도메인 구현(database.types 포함)은 직접 참조하지 않는다.",
            },
          ],
        },
      ],
    },
  },

  // zone 8: src/lib/audit/** — 감사 로그·레이트 리밋·오류 추적 (Task 038, BOARD, 18일차).
  // zone 7(`src/lib/auth/**`)과 대칭이다 — `lib/data/contracts.ts`의 CON-05·CON-06이
  // "이 레이어의 어떤 함수도 쿠키·세션·요청 객체를 직접 읽지 않는다"고 못박아 데이터 배럴에
  // 섞을 수 없고, 감사 로그·레이트 리밋 카운터 둘 다 `anon`/`authenticated` 완전 거부 RLS라
  // service-role 클라이언트가 필요하다(`audit_logs`·`handle_search_attempts` 둘 다 동일 패턴).
  // 인프라 3개(server·client·env)만 재사용하고 도메인 구현 딥 임포트는 zone 7과 같은 이유로 막는다.
  {
    files: ["src/lib/audit/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            noMockImpl,
            {
              group: [
                "@/lib/data/supabase/*",
                "!@/lib/data/supabase/server",
                "!@/lib/data/supabase/client",
                "!@/lib/data/supabase/env",
              ],
              message:
                "src/lib/audit/**는 Supabase 클라이언트 팩터리(server·client·env)만 재사용한다 — 도메인 구현(database.types 포함)은 직접 참조하지 않는다.",
            },
          ],
        },
      ],
    },
  },

  // zone 4: src/components/** 중 표현 컴포넌트(ui/, *Container.tsx 제외) — D-030 ①.
  {
    files: ["src/components/**/*.tsx"],
    ignores: ["src/components/ui/**", "src/components/**/*Container.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...noSupabaseClient.paths],
          patterns: [noDataLayer, noRealtimeLayer, ...noSupabaseClient.patterns],
        },
      ],
    },
  },

  // zone 5: 컨테이너(*Container.tsx)와 components/ui/** — 배럴 경유만 허용 (D-030 ①·②).
  {
    files: ["src/components/ui/**/*.tsx", "src/components/**/*Container.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...noSupabaseClient.paths],
          patterns: [noMockImpl, noSupabaseDataImpl, noDeepRealtimeImpl, ...noSupabaseClient.patterns],
        },
      ],
    },
  },

  // zone 6: 그 외 src/**(app/, lib/actions, lib/utils.ts, lib/types, hooks 등) — Supabase 클라이언트
  // 직접 import와 realtime/data 구현체 딥 임포트만 막는다. 서버 컴포넌트·Server Action은
  // @/lib/data 배럴을 직접 호출할 수 있다(D-030의 "읽기·쓰기 경계는 그대로 성립").
  //
  // src/lib/data/** 전체(= mock/·supabase/뿐 아니라 index.ts 배럴도)를 폴더 단위로 제외한다 —
  // src/lib/realtime/**와 대칭을 맞춘 것이다. 배럴(index.ts)이 mock/supabase 구현을 조립
  // import하는 것 자체가 이 배럴의 존재 이유이므로, 여기서 막으면 안 된다(1일차 교차검증 이슈).
  // mock↔supabase 상호 격리는 이 블록이 아니라 zone 2·3(각 서브폴더 전용 규칙)이 계속 담당한다.
  //
  // `src/components/**`는 `*.tsx`만 제외한다(`*.ts`는 제외하지 않는다) — zone 4·5가
  // `src/components/**/*.tsx`(정확히는 그 하위 패턴들)만 매칭하므로, 예전처럼 여기서
  // `src/components/**`를 통째로 제외하면 `components/` 아래의 `.tsx`가 아닌 `.ts` 파일
  // (예: `components/shell/get-auth-session.ts`)이 zone 4·5·6 **어디에도 걸리지 않는
  // 사각지대**가 생긴다 — 3일차 CREW가 프로브로 실측해 찾아낸 구멍이다. 이런 `.ts` 파일은
  // `<Name>.tsx`/`<Name>Container.tsx` 명명 규약의 대상이 아니라(D-030 ①이 애초에 `.tsx`
  // 표현/컨테이너 분리를 전제한다) "컴포넌트 트리 아래 있을 뿐인 일반 TS 모듈"이므로,
  // `lib/actions`·`hooks`와 같은 이 zone(일반 규칙: Supabase 클라이언트·딥 임포트만 차단,
  // `@/lib/data` 배럴은 허용)으로 떨어지는 것이 맞다 — 표현 컴포넌트 수준의 전면 차단
  // (zone 4)을 씌울 근거가 없다.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/rules/**",
      "src/lib/data/**",
      "src/lib/realtime/**",
      "src/lib/auth/**",
      "src/lib/audit/**",
      "src/components/**/*.tsx",
      // I-074 — zone 6b(아래)가 이 두 파일을 대신 맡는다. flat config는 같은 파일에 매치되는
      // 여러 config의 같은 rule을 병합하지 않고 나중 객체가 통째로 덮어쓰므로(파일 상단
      // 공통 주의사항), 이 zone과 6b의 `files`/`ignores`가 겹치면 안 된다 — 여기서 빼고
      // 6b에서만 매칭시킨다.
      "src/lib/actions/check-handle-availability.ts",
      "src/lib/actions/invite-crew-member.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...noSupabaseClient.paths, noGetProfileByHandleFromBarrel],
          patterns: [noMockImpl, noSupabaseDataImpl, noDeepRealtimeImpl, ...noSupabaseClient.patterns],
        },
      ],
    },
  },

  // zone 6b: I-074 허용 목록 — `getProfileByHandle`을 익명 컨텍스트에서 호출해도 되는 두 실
  // 소비자(모듈 docstring, `src/lib/data/supabase/profile.ts` 참고)만 zone 6의 새 제한에서
  // 뺀다. zone 6과 나머지 규칙(Supabase 클라이언트 직접 import·mock/realtime 딥 임포트 차단)은
  // 동일하게 유지한다 — `getProfileByHandle` 제한 한 줄만 뺐다.
  {
    files: ["src/lib/actions/check-handle-availability.ts", "src/lib/actions/invite-crew-member.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...noSupabaseClient.paths],
          patterns: [noMockImpl, noSupabaseDataImpl, noDeepRealtimeImpl, ...noSupabaseClient.patterns],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
