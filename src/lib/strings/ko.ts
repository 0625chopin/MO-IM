/**
 * 한국어(ko) 사용자 노출 문자열 사전 — 이 모듈의 단일 소스.
 *
 * - 여기 있는 값은 전부 **화면에 보이는 한국어 문구**다. 로그·주석·코드 식별자는 대상이 아니다.
 * - 키 구조와 명명 규칙은 `src/lib/strings/README.md` 참고.
 * - 값 안의 `{paramName}` 은 `t()` 헬퍼가 런타임에 치환하는 자리표시자다(`src/lib/strings/index.ts`).
 * - **번역을 추가할 때(v0.1 이후, D-011)**: 이 파일과 같은 키 구조를 가진 `en.ts` 등을 만들고
 *   `index.ts`의 `dictionaries`에 등록한다. 이 파일의 키를 변경하면 다른 로케일 파일도 타입 에러로
 *   즉시 드러난다(`Strings` 타입이 `typeof ko`이기 때문).
 * - **도메인 경계를 넘어 완전히 동일한 뜻·문구로 쓰이는 값**은 `common` 하위에서 한 번만 선언하고,
 *   각 도메인 객체는 이 상수를 참조해 값을 공유한다(README §4 "완전히 동일하게 쓰이면 common에
 *   둔다"). 예: `board.detail.deleted`와 `chat.postCard.deletedPost`는 둘 다 "삭제된 게시글"이라는
 *   같은 엔티티·같은 개념을 가리키므로 `common.post.deleted`를 함께 참조한다.
 */
const common = {
  /** Task 011(DESIGN) — 앱 셸 브랜드 표기(`<title>`, `HeaderNav` 로고 링크)용. 고유명사라
   *  로케일이 늘어도 값은 바뀌지 않을 가능성이 높지만, NFR-023(문자열 하드코딩 금지)을
   *  일관되게 지키기 위해 컴포넌트에 직접 쓰지 않고 여기 둔다. */
  appName: "mo_im",
  actions: {
    confirm: "확인",
    cancel: "취소",
    save: "저장",
    edit: "수정",
    delete: "삭제",
    close: "닫기",
    retry: "다시 시도",
    /** Task 014 — 전역 오류·경계 화면의 "홈으로" 버튼. `goBack`(브라우저 뒤로 가기)과 달리
     *  항상 알려진 안전한 목적지(`/`)로 이동한다 — 오류 화면에서는 "뒤로"가 다시 같은 오류로
     *  돌아갈 수 있어 안전하지 않다. */
    goHome: "홈으로 가기",
    more: "더 보기",
    share: "공유",
    copy: "복사",
    copied: "복사되었습니다",
    goBack: "뒤로 가기",
    /** Task 011(DESIGN) — AppShell 키보드 접근성 스킵 링크(NFR-020). */
    skipToContent: "본문으로 바로가기",
  },
  /** Task 011(DESIGN) — 스크린 리더 전용 `aria-label` 문구. 화면에 그려지진 않지만 보조기술
   *  사용자에게는 노출되는 문구라 NFR-023 대상으로 취급한다. */
  a11y: {
    primaryNav: "주 내비게이션",
    accountNav: "계정 메뉴",
    /** 디자인 개편 — 미확인 개수 배지의 스크린 리더 문구. 배지 숫자 자체는
     *  `aria-hidden`으로 가리고(시각 장식) 링크 이름에 이 문구를 덧붙인다.
     *  개편 전에는 배지가 `aria-hidden`이기만 해서 "알림 3건"이라는 정보가
     *  보조기술 사용자에게 아예 전달되지 않았다(NFR-021). `{n}`은 배지가
     *  "9+"로 줄여 표시할 때도 **줄이지 않은 실제 개수**를 받는다. */
    unreadCount: "읽지 않음 {n}건",
    /** Task 015A — 비밀번호 필드 표시/숨김 토글 버튼(`SignupForm`·`LoginForm`)의 `aria-label`.
     *  아이콘만 있는 버튼이라 접근성 문자열이 곧 유일한 이름이다. */
    showPassword: "비밀번호 표시",
    hidePassword: "비밀번호 숨기기",
  },
  status: {
    loading: "불러오는 중…",
    empty: "표시할 내용이 없어요",
    error: "문제가 발생했어요",
  },
  /** Task 011(DESIGN) — 명시적 테마 토글(`ThemeToggle`). `light`/`dark`/`system` 키는
   *  `Theme` 유니온과 정확히 일치해야 한다(`ThemeToggle`이 `theme[option]`으로 인덱싱한다).
   *  `toggleLabel`은 아이콘만 있는 트리거 버튼의 유일한 접근성 이름이다. */
  theme: {
    label: "테마",
    toggleLabel: "테마 변경",
    light: "밝게",
    dark: "어둡게",
    system: "시스템 설정",
  },
  time: {
    justNow: "방금 전",
    minutesAgo: "{n}분 전",
    hoursAgo: "{n}시간 전",
    daysAgo: "{n}일 전",
  },
  /** 여러 도메인이 같은 엔티티를 가리킬 때 공유하는 문구. 새 항목을 추가할 때도 이 규칙을 따른다. */
  post: {
    deleted: "삭제된 게시글입니다",
  },
  /** 작성자 프로필을 찾을 수 없을 때(탈퇴 익명화 등)의 방어적 폴백 표시 이름. 게시판·채팅·
   *  알림 등 작성자 이름을 보여주는 모든 화면이 공유한다(§4 "같은 개체를 가리키면 common에"). */
  profile: {
    unknownAuthor: "탈퇴한 사용자",
  },
  /**
   * 핸들 **형식** 오류 문구 — `lib/rules/handle-validation.ts`의 `validateHandleFormat`·
   * `HANDLE_PATTERN`이 판정하는 같은 개념을 회원가입(`auth.signup`)과 계정 설정
   * (`account.settings.handle`) 두 화면이 그대로 보여준다(§4 "같은 순수 함수가 판정한 같은
   * 개념"). 6일차 교차검증 W-2(DESIGN)로 승격 — 승격 전에는 두 도메인에 같은 한국어 값이
   * 중복 선언돼 있었다. **`HANDLE_PATTERN`은 I-033으로 아직 잠정값이다** — 나중에 패턴이
   * 바뀌면 이 값 하나만 고치면 두 화면에 함께 반영된다(공유하지 않았다면 흩어진 문구를
   * 손으로 동시에 고쳐야 했다). `taken`(중복)은 형식과 무관한 별개 판정이지만 마찬가지로
   * 두 화면이 완전히 같은 개념·같은 문구를 쓰므로 함께 공유한다. 쿨다운(`cooldown`)은
   * 계정 설정에만 있는 개념이라 공유 대상이 아니다 — `account.settings.handle.errors`에
   * 그대로 둔다.
   */
  handle: {
    invalidFormat: "영문 소문자로 시작하고, 소문자·숫자·밑줄만 3~20자로 써 주세요",
    taken: "이미 사용 중인 핸들이에요",
  },
} as const;

export const ko = {
  common,

  nav: {
    home: "홈",
    calendar: "캘린더",
    board: "게시판",
    chat: "채팅",
    notifications: "알림",
    profile: "내 정보",
  },

  /**
   * SC-01 랜딩 페이지(requirements.md 5.1.1절). 값은 requirements.md 1.1절 "제품 한 줄 정의"
   * 원문 그대로다. PRD §6 "랜딩 페이지"의 "주요 기능" 항목("제품 한 줄 소개 및 핵심 가치(P1~P5)
   * 노출")이 요구하는 한 줄 소개에 해당한다. D-001("모임"을 Crew·Meetup 두 엔티티로 분리하는
   * 결정, prioritization-and-risks.md)은 이 한 줄 정의가 서술하는 크루/모임 구도의 배경 결정일
   * 뿐 이 문구 자체를 승인한 결정은 아니다 — requirements.md:35의 D-001 인용은 1.2절(P1~P5
   * 문제 정의)이 고객 검토로 확인됐다는 뜻이지 1.1절 문장을 가리키지 않는다.
   */
  landing: {
    hero: {
      /** `<meta name="description">`·SEO용 한 줄 제품 정의. 화면 히어로 제목이 아니라
       *  메타데이터로 쓰인다(`layout.tsx`의 `metadata.description`). */
      title:
        "동호회·소모임(크루)을 만들고, 크루 안에서 게시글로 모임 일정을 제안하고, 찬반 투표로 확정한 뒤, 확정된 일정을 캘린더에서 한눈에 보는 웹 서비스",
      /** 히어로 상단 분류 라벨(넓은 트래킹). */
      eyebrow: "동호회·소모임을 위한 공간",
      /** 히어로 대제목 — 제품의 한 줄 서사("채팅에 묻힌 약속을 확정으로")를 사용자 언어로. */
      headline: "모임 약속, 이제 채팅에 묻히지 않아요",
      /** 대제목 아래 값 제안 한 문단. */
      subhead:
        "크루를 만들고 게시글로 모임을 제안하면, 크루원들이 찬반으로 투표해 확정하고, 확정된 일정만 캘린더에 남습니다. 흩어진 대화가 정해진 약속이 됩니다.",
      /** 1차 행동(회원가입). 동작 그대로 이름 짓는다 — 누르면 시작 화면으로 간다. */
      ctaPrimary: "시작하기",
      /** 2차 행동(크루 탐색). 로그인 없이 둘러볼 수 있는 진입점. */
      ctaSecondary: "크루 둘러보기",
    },
    /** 확정성 스케일(제안→투표→확정)은 이 제품의 실제 순서다 — 그래서 단계로 보여준다.
     *  각 단계의 `certainty-*` 시각(점선→옅은 칠→채움)이 캘린더·투표·알림에서 그대로 쓰인다. */
    steps: {
      title: "약속이 일정이 되기까지",
      items: [
        { name: "제안", body: "크루 게시글로 날짜와 장소를 올려요." },
        { name: "투표", body: "크루원들이 찬반으로 응답하고 정족수를 채워요." },
        { name: "확정", body: "가결되면 크루색으로 캘린더에 박혀요." },
      ],
    },
  },

  /** SC-06 홈 대시보드 페이지. `nav.home`(헤더 내비 라벨)과 의미가 달라 별도 키를 둔다. */
  home: {
    dashboard: {
      title: "홈 대시보드",
      /**
       * Task 021B — "홈 대시보드 캘린더 요약"(PRD `F030~F037` 항목, 2인일 몫). SC-06 전체
       * (내 크루 카드·알림 미리보기 포함)는 이 Task 범위가 아니다 — 이 회차는 "다가오는
       * 모임" 요약 하나만 채운다(ROADMAP Task 021B 산정 근거 참고, 보고서에도 이 경계를
       * 남겼다).
       */
      upcoming: {
        title: "다가오는 모임",
        /** 요약 목록 전체를 캘린더 페이지로 잇는 링크. */
        viewAll: "캘린더에서 모두 보기",
        empty: "예정된 모임이 없어요",
        errorTitle: "다가오는 모임을 불러오지 못했어요",
        errorDescription: "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
      },
    },
  },

  /**
   * SC-07~09, SC-14~15 크루 관련 페이지. `create`·`home`은 Task 016B(FR-010·011·022,
   * D-008·D-014·D-016)가 채웠다.
   */
  crew: {
    /**
     * SC-07 크루 탐색(F008, FR-014, D-007·D-017, Task 016A). 검색바·카테고리 필터·결과
     * 그리드·무한 스크롤·빈 상태의 문구를 모은다. "가입됨" 배지(AC2)는 `home.*`가 아니라
     * 여기 둔다 — 크루 홈의 배지가 아니라 탐색 카드 전용 문구이기 때문이다.
     */
    explore: {
      title: "크루 검색·탐색",
      searchLabel: "크루 검색",
      searchPlaceholder: "크루명·소개로 검색",
      searchSubmit: "검색",
      categoryFilterLabel: "카테고리 필터",
      /** ToggleGroup의 "카테고리 미선택(전체 보기)" 옵션 라벨. */
      allCategories: "전체",
      /** FR-014 AC2 — 이미 소속된 크루 카드에 붙는 배지. 가입 신청 버튼은 이 카드에 없다
       *  (`CrewCard.tsx` docstring 참고 — 상태 기계는 크루 홈이 소유한다). */
      memberBadge: "가입됨",
      /** FR-014 AC3 — 무한 스크롤 다음 페이지를 불러오는 동안. */
      loadingMore: "더 불러오는 중…",
      /** FR-014 E2 — 검색어 1자일 때 제출 버튼 아래 표시. */
      errors: {
        queryTooShort: "검색어는 2자 이상 입력해 주세요",
        /** 무한 스크롤 다음 페이지 조회 실패(D-030 ③, 네트워크류 도메인 오류) — 재시도 버튼과
         *  함께 뜬다. */
        loadMoreFailed: "더 불러오지 못했어요. 다시 시도해 주세요.",
      },
      /** FR-014 E1 — 결과 0건. */
      empty: {
        title: "검색 결과가 없어요",
        description: "다른 검색어나 카테고리를 시도해 보세요",
        resetLink: "전체 목록 보기",
      },
    },
    /** SC-08 크루 개설 폼(F005). 색상은 D-016에 따라 묻지 않는다. */
    create: {
      title: "크루 개설",
      description: "크루명·소개·카테고리·공개 범위만 정하면 바로 만들어져요. 색은 자동으로 배정돼요.",
      fields: {
        name: "크루명",
        description: "소개",
        category: "카테고리",
        categoryPlaceholder: "카테고리를 선택하세요",
        visibility: "공개 범위",
      },
      visibilityOptions: {
        public: {
          label: "공개",
          description: "누구나 검색·소개 열람이 가능해요. 게시판·채팅·멤버 목록은 크루원만 볼 수 있어요.",
        },
        private: {
          label: "비공개",
          description: "크루원만 검색·열람할 수 있어요. 가입은 초대로만 가능해요.",
        },
      },
      submit: "크루 만들기",
      submitPending: "만드는 중…",
      errors: {
        /** FR-002 E3과 같은 개념(세션 만료). `account.settings.errors.sessionExpired`와 같은
         *  문구이지만 도메인 맥락이 달라 공유하지 않는다(§4). */
        sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
        nameRequired: "크루명을 입력해 주세요",
        nameTooLong: "크루명은 30자 이하로 입력해 주세요",
        /** `lib/rules/crew-name-validation.ts`의 `BANNED_WORDS`(I-038, 잠정 데모 목록)가
         *  걸러낸 경우. */
        nameBannedWord: "크루명에 사용할 수 없는 단어가 포함되어 있어요",
        descriptionRequired: "소개를 입력해 주세요",
        descriptionTooLong: "소개는 300자 이하로 입력해 주세요",
        categoryRequired: "카테고리를 선택해 주세요",
      },
    },
    /**
     * SC-09 크루 홈(F006·F011). `public`/`private` × 소속/비소속 4분기 화면 상태(D-007,
     * FR-012)와 가입 신청 버튼 상태 기계(`lib/rules/join-request-button-state.ts`)의 문구다.
     * 탭 라벨(게시판·채팅·멤버 관리·크루 설정)은 별도로 선언하지 않는다 — `nav.board`·
     * `nav.chat`·`crew.members.title`·`crew.settings.title`과 완전히 같은 개념·문구라 그대로
     * 참조한다(§4).
     */
    home: {
      title: "크루 홈",
      memberCount: "크루원 {count}명",
      /** D-007·FR-012 AC2 — private 크루의 비소속자에게 보이는 전부. */
      privateNotice: {
        title: "초대 전용 크루예요",
        description: "이 크루는 초대받은 크루원만 게시판·채팅·멤버 목록을 볼 수 있어요.",
      },
      join: {
        /** FR-012 AC3 — public 크루를 보는 비로그인 방문자. */
        guestPrompt: "가입하고 참여하기",
        /** FR-022 정상 흐름 ② "가입 신청" 버튼. */
        requestButton: "가입 신청",
        /** FR-022 AC3 — 대기 중일 때 버튼 자체가 이 문구로 바뀐다(철회 겸용, 별도 버튼 아님). */
        pendingButton: "신청 대기 중 · 철회",
        withdrawSubmitPending: "철회하는 중…",
        /** 이미 초대를 받은 상태 — 응답은 초대함(FR-021)에서 한다. */
        invitedNotice: "이 크루에서 초대를 보냈어요. 받은 초대함에서 확인해 주세요.",
        goToInvitations: "받은 초대함으로",
        /** FR-022 E3 — 강퇴 이력으로 재신청 차단. */
        blockedNotice: "이 크루는 재가입이 제한되어 있어요.",
        dialogTitle: "가입 신청",
        dialogDescription: "오너·임원 전원에게 알림이 가요. 한 줄 인사는 선택이에요.",
        messageLabel: "한 줄 인사(선택)",
        messagePlaceholder: "간단히 인사를 남겨보세요",
        submit: "신청 보내기",
        submitPending: "신청하는 중…",
        sentNotice: "가입 신청을 보냈어요",
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          notAllowed: "가입 신청 권한이 없어요",
          /** `lib/rules/join-request-eligibility.ts`의 `JoinRequestIneligibleReason`과
           *  키를 맞췄다 — 판정 코드와 문구가 1:1이라 매핑 테이블을 따로 두지 않는다. */
          private_crew: "비공개 크루는 초대로만 가입할 수 있어요",
          already_member: "이미 가입된 크루예요",
          already_pending: "이미 대기 중인 신청이 있어요",
          banned: "이 크루는 재가입이 제한되어 있어요",
          withdrawFailed: "철회하지 못했어요. 다시 시도해 주세요.",
        },
      },
    },
    /**
     * SC-14 멤버 관리 페이지(F009·F010·F012~F015, F032, Task 017A). 역할 정렬 목록·초대
     * 다이얼로그·가입 신청 승인/반려 탭·임원 임명 문구를 모은다.
     */
    members: {
      title: "멤버 관리",
      roleLabels: {
        owner: "오너",
        staff: "임원",
        member: "크루원",
      },
      /** 본인 행에 붙는 표시(FR-024·FR-026 — 임명·탈퇴 대상이 자기 자신인지 구분). */
      selfBadge: "나",
      memberCountLabel: "크루원 {count}명",
      /** FR-024 임원 임명·해임(D-002). 오너 전용 — `MemberList`의 행별 버튼. */
      appoint: {
        appointButton: "임원으로 임명",
        dismissButton: "임원 해임",
        submitPending: "처리하는 중…",
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          notAllowed: "임원 임명 권한이 없어요",
          /** FR-024 E2 — 대상이 이미 탈퇴·강퇴돼 활성 크루원이 아님. */
          targetInactive: "이미 크루를 떠난 크루원이에요",
          /** FR-024 E1 — 오너 본인은 임명·해임 대상이 아니다. */
          targetIsOwner: "오너는 임명·해임 대상이 아니에요",
          failed: "처리하지 못했어요. 다시 시도해 주세요.",
        },
      },
      /** FR-026 크루 탈퇴 — `MemberList`의 본인 행 전용 버튼. */
      leave: {
        button: "탈퇴하기",
        submitPending: "탈퇴하는 중…",
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          notAllowed: "탈퇴할 수 없어요",
          /** 오너는 오너 이양(FR-025, `settings.transferOwnership`)이나 크루 해산(FR-013,
           *  `settings.disband`) 없이는 이 크루를 탈퇴할 수 없다 — 둘 다 Task 040에서 구현됐다
           *  (크루 설정 화면 안내). */
          ownerMustTransferOrDisband: "오너는 먼저 오너를 위임하거나 크루를 해산해야 탈퇴할 수 있어요",
          failed: "탈퇴하지 못했어요. 다시 시도해 주세요.",
        },
      },
      /** FR-027 크루원 강퇴(D-003, Task 040) — `MemberList`의 행별 버튼. 오너는 임원·일반
       *  크루원 누구나, 임원은 일반 크루원만 대상으로 할 수 있다(각주⁴). 사유는 선택 입력. */
      remove: {
        button: "강퇴",
        dialogTitle: "크루원을 강퇴할까요?",
        dialogDescription: "강퇴하면 이 크루원은 즉시 크루를 떠나고, 같은 크루에 재신청할 수 없어요(오너가 해제 전까지). 진행 중인 투표에 던진 표는 무효 처리돼요.",
        reasonLabel: "사유(선택)",
        reasonPlaceholder: "강퇴 사유를 남길 수 있어요",
        submit: "강퇴하기",
        submitPending: "강퇴하는 중…",
        cancel: "취소",
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          /** FR-027 E1 — 임원이 임원·오너를 대상으로 시도(각주⁴, `staff_can_only_remove_member`). */
          notAllowed: "일반 크루원만 강퇴할 수 있어요",
          /** FR-027 E2 — 대상이 오너. */
          targetIsOwner: "오너는 강퇴 대상이 아니에요",
          targetInactive: "이미 크루를 떠난 크루원이에요",
          failed: "강퇴하지 못했어요. 다시 시도해 주세요.",
        },
      },
      /** FR-020 크루원 초대 다이얼로그. 핸들 검색은 `UserSearchField`(계정 설정과 공유,
       *  Task 015B 모듈 docstring 참고)를 그대로 재사용한다. */
      invite: {
        trigger: "크루원 초대",
        dialogTitle: "크루원 초대",
        dialogDescription: "핸들로 검색해 초대를 보내요. 14일 안에 응답하지 않으면 초대가 만료돼요.",
        inviteButton: "초대 보내기",
        submitPending: "초대하는 중…",
        sentNotice: "초대를 보냈어요",
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          notAllowed: "초대 권한이 없어요",
          handleNotFound: "그 핸들의 사용자를 찾을 수 없어요",
          /** `lib/rules/invite-eligibility.ts`의 `InviteIneligibleReason`과 키를 맞췄다. */
          self_invite: "자기 자신은 초대할 수 없어요",
          already_member: "이미 크루원이에요",
          already_invited: "이미 초대를 보낸 사용자예요",
          /** Task 032 교차검증 major 2 — 이미 가입 신청을 넣은 사용자는 초대가 아니라
           *  승인으로 처리해야 한다(FR-023). */
          already_requested: "이미 가입 신청을 넣은 사용자예요 — 신청 탭에서 승인해 주세요",
          /** FR-020 E3(대상자가 나를 차단, FR-081) — Task 042A. 판정 데이터를 클라이언트가
           *  가질 수 없어(차단 여부는 상대만 볼 수 있는 정보) DB RLS가 최종 거부하고, 이
           *  문구는 그 거부를 일반 오류로 감싼다 — "차단됐다"는 사실 자체를 노출하지
           *  않는다(requirements.md FR-020 정상 흐름 E3 "사유는 노출하지 않음"). */
          blocked: "이 사용자를 초대할 수 없어요",
        },
      },
      /** FR-023 가입 신청 승인·반려 탭. `requests.status.*`는 `JoinRequestStatus` 값과 문구를
       *  1:1로 맞췄다 — I-040이 요구하는 대로 "반려됨"·"철회함"을 구분해서 보여준다. */
      requests: {
        pendingTab: "대기 중",
        historyTab: "처리 내역",
        pendingEmpty: "대기 중인 가입 신청이 없어요",
        historyEmpty: "처리한 가입 신청이 없어요",
        messageLabel: "한 줄 인사",
        approveButton: "승인",
        rejectButton: "반려",
        submitPending: "처리하는 중…",
        status: {
          approved: "승인됨",
          rejected: "반려됨",
          /** I-040 — 신청자 본인이 철회한 건. "반려됨"과 다른 문구로 구분한다. */
          withdrawn: "철회함",
        },
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          notAllowed: "승인·반려 권한이 없어요",
          /** FR-023 E1(동시성 — 다른 임원이 먼저 처리)·E2(신청자가 이미 철회)를 함께 담는다. */
          alreadyDecided: "이미 처리된 신청이에요",
          decideFailed: "처리하지 못했어요. 다시 시도해 주세요.",
        },
      },
    },
    /**
     * SC-15 크루 설정 페이지(F006·F007·F014·F032, Task 017B). 정보 수정(`info.*`)·공개 범위
     * 전환(`visibility.*`, 오너 전용) 두 폼의 문구를 모은다. 필드별 유효성 검증 문구
     * (`nameRequired`·`descriptionTooLong` 등)는 `crew.create.errors`와 같은 개념(크루명·소개·
     * 카테고리 검증)이지만 그대로 참조하지 않고 이 아래 새로 선언한다 — `crew.create`·
     * `crew.members`가 이미 `sessionExpired`처럼 같은 개념도 폼(도메인 맥락)마다 따로 두는
     * 이 파일의 기존 관례(§4)를 그대로 따른다.
     */
    settings: {
      title: "크루 설정",
      description: "크루 정보를 고치고, 오너라면 공개 범위도 바꿀 수 있어요.",
      info: {
        fields: {
          name: "크루명",
          description: "소개",
          category: "카테고리",
          color: "캘린더 색상",
        },
        /** 팔레트 스와치 라디오 하나의 `aria-label`(D-016, 10일차 접근성 QA 이슈 D). `{n}`은
         *  1-based 표시 번호, `{name}`은 `CREW_PALETTE`(`lib/crew-palette.ts`)의 `nameKo` —
         *  번호만으로는 스크린 리더 사용자가 실제 색을 알 수 없어 색 이름을 함께 읽는다. */
        colorOptionLabel: "{n}번 {name}",
        submit: "저장",
        submitPending: "저장하는 중…",
        saved: "저장했어요",
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          notAllowed: "크루 정보를 수정할 권한이 없어요",
          nameRequired: "크루명을 입력해 주세요",
          nameTooLong: "크루명은 30자 이하로 입력해 주세요",
          nameBannedWord: "크루명에 사용할 수 없는 단어가 포함되어 있어요",
          descriptionRequired: "소개를 입력해 주세요",
          descriptionTooLong: "소개는 300자 이하로 입력해 주세요",
          categoryRequired: "카테고리를 선택해 주세요",
          failed: "저장하지 못했어요. 다시 시도해 주세요.",
        },
      },
      /** FR-012, D-007·D-002 — 오너 전용 섹션. `CrewSettingsContainer`가 `crew:update_visibility`
       *  판정을 통과한 오너에게만 이 폼을 렌더한다. */
      visibility: {
        heading: "공개 범위",
        description: "공개 범위는 오너만 바꿀 수 있어요.",
        submit: "저장",
        submitPending: "변경하는 중…",
        saved: "공개 범위를 변경했어요",
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          notAllowed: "공개 범위는 오너만 변경할 수 있어요",
          failed: "변경하지 못했어요. 다시 시도해 주세요.",
        },
      },
      /** FR-025 오너 이양(D-002, Task 040). 오너 전용 — 대상은 멤버 목록에서 고른다(핸들
       *  검색이 아니다, 이미 크루원인 사람만 대상이 될 수 있으므로). 크루명 재입력 확인은
       *  해산과 같은 이유(돌이킬 수 없는 조작의 오클릭 방지)로 둔다 — SQL 강제 경계는 아니고
       *  UX 확인용이다(`crews_guard_owner_only_fields`가 대상 자격은 별도로 강제한다). */
      transferOwnership: {
        trigger: "오너로 임명",
        dialogTitle: "오너 이양",
        dialogDescription: "이양하면 나는 임원이 되고, 선택한 크루원이 새 오너가 돼요. 되돌리려면 새 오너가 다시 이양해야 해요.",
        confirmLabel: "확인을 위해 크루명을 입력해 주세요",
        confirmPlaceholder: "크루명 입력",
        submit: "이양하기",
        submitPending: "이양하는 중…",
        cancel: "취소",
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          notAllowed: "오너 이양 권한이 없어요",
          nameMismatch: "크루명이 일치하지 않아요",
          /** FR-025 E1 — 대상이 활성 크루원이 아님(SQL 강제 경계, `crews_guard_owner_only_fields`). */
          targetInactive: "이미 크루를 떠난 크루원이에요",
          failed: "이양하지 못했어요. 다시 시도해 주세요.",
        },
      },
      /** FR-013 크루 해산(D-009 후반, Task 040). 오너 전용, 되돌릴 수 없다 — 진행 중 투표·미래
       *  Meetup이 전부 취소되고 채팅 로그가 즉시 파기된다. */
      disband: {
        trigger: "크루 해산",
        dialogTitle: "크루를 해산할까요?",
        dialogDescription: "해산하면 되돌릴 수 없어요. 진행 중인 투표는 모두 취소되고, 앞으로 예정된 모임도 모두 취소돼요. 채팅 기록은 즉시 삭제돼요.",
        noticeVotes: "진행 중인 투표가 전부 취소됩니다",
        noticeMeetups: "앞으로 예정된 모임이 전부 취소됩니다(지난 모임은 열람 전용으로 남아요)",
        noticeChat: "채팅 기록이 즉시 삭제됩니다",
        confirmLabel: "확인을 위해 크루명을 입력해 주세요",
        confirmPlaceholder: "크루명 입력",
        submit: "해산하기",
        submitPending: "해산하는 중…",
        cancel: "취소",
        errors: {
          sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
          notAllowed: "크루 해산은 오너만 할 수 있어요",
          nameMismatch: "크루명이 일치하지 않아요",
          alreadyDisbanded: "이미 해산된 크루예요",
          failed: "해산하지 못했어요. 다시 시도해 주세요.",
        },
      },
    },
    /** FR-013 AC2 — 해산된 크루 안내(Task 040 UI/게이트 절반, BOARD, 19일차, I-066·I-067
     *  해소). 크루원 게이트 레이아웃(`(app)/crews/[crewId]/layout.tsx`)이 `crews.status
     *  ==='archived'`인 크루의 모든 하위 화면 상단에 공통으로 띄운다 — 게시판 글쓰기·채팅
     *  전송이 막혔을 때 "왜 안 되는지" 사용자가 알 수 있어야 한다(팀장 지시, "글을 쓸 수
     *  없는 이유를 모르면 그건 또 다른 결함"). 열람은 그대로 되므로 "막혔다"가 아니라
     *  "제한된다"는 톤을 쓴다. */
    archivedNotice: {
      title: "해산된 크루예요",
      description: "이 크루는 해산되어 새 글 작성·채팅 전송이 제한됩니다. 기존 게시글·채팅 기록은 계속 열람할 수 있어요.",
    },
  },

  /**
   * SC-16 통합 캘린더 페이지. `month.*`는 Task 021A(`MonthCalendar`·`MeetupBar`, FR-060~063)
   * 몫이다. `month.filter.*`(크루 필터·`CrewLegend`)·`month.detail.*`(`DayDetailPanel`)는
   * Task 021B가 이어서 채웠다.
   */
  calendar: {
    month: {
      title: "통합 캘린더",
      /** 요일 헤더 7개(일~토). 배열이지만 화면에 보이는 고정 어휘라 대상이다(§2). */
      weekdayShort: ["일", "월", "화", "수", "목", "금", "토"] as const,
      prevMonth: "이전 달",
      nextMonth: "다음 달",
      /** 헤더 제목. `{year}`·`{month}` 파라미터. */
      monthLabel: "{year}년 {month}월",
      /** 날짜 셀 `aria-label`(NFR-020) — 방향키로 셀에 포커스가 오면 이 문구가 읽힌다.
       *  `{date}`는 `Intl.DateTimeFormat`이 만든 "8월 14일 금요일" 같은 문구를 그대로 받는다. */
      dayAriaLabel: "{date} 일정 {count}건",
      /** `MeetupBar` 하나의 접근성 라벨(FR-061 AC3 — 크루명 + Meetup 제목). 날짜 셀 안에서는
       *  셀의 `aria-describedby`가 이 문구를 모아 전달하고, 바 자신은 `aria-hidden`으로 중복
       *  안내를 막는다(`MeetupBar.tsx` 참고). `/sample`의 단독 데모에서는 바 자신이 이 라벨을 쓴다. */
      barAriaLabel: "{crewName} — {title}",
      /** 하루 최대 노출 바 수(3개) 초과분 요약(FR-061 AC2 "+2"). */
      overflowLabel: "+{n}",
      overflowAriaLabel: "그 외 {n}건 더보기",
      /** FR-061 E1 — 이번 달 Meetup이 0건일 때 격자 위에 붙는 안내. */
      empty: "이번 달에는 등록된 모임이 없어요",
      /** FR-061 E3 — 네트워크 실패류의 일반 오류. */
      errorTitle: "일정을 불러오지 못했어요",
      errorDescription: "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
      /** D-030 ③ 도메인 오류 — 비공개 크루 캘린더 접근 등 RLS 403류(D-007·D-017). */
      forbiddenTitle: "크루 일정을 볼 권한이 없어요",
      forbiddenDescription: "비공개 크루의 캘린더는 크루원만 볼 수 있어요.",
      /**
       * Task 021B — 크루 필터(FR-061 AC5, D-014·R-017)와 `CrewLegend`. 소속 크루가 12개를
       * 넘으면 팔레트 색이 반드시 겹치므로(D-014) 필터가 "있으면 편한" 기능이 아니라
       * 색 구분이 무너졌을 때의 유일한 복구 수단이다 — 문구도 그 무게에 맞춰 "정리"가 아니라
       * "좁혀 보기"로 잡았다.
       */
      filter: {
        title: "크루 필터",
        /** 필터 패널 전체를 감싸는 group의 `aria-label`. */
        groupAriaLabel: "표시할 크루 선택",
        selectAll: "전체 선택",
        clearAll: "전체 해제",
        /** 체크박스 하나의 접근성 이름. `{crewName}`은 이미 화면에 보이는 라벨과 같은 문구를
         *  공유한다(중복 발화 방지 원칙은 `MeetupBar.tsx`의 title/aria-label 참고와 같다 —
         *  다만 여기는 시각 라벨 자체가 `<label>` 텍스트라 `aria-label`을 별도로 채우지 않고
         *  네이티브 label-for 연결만 쓴다. 이 키는 그 라벨 문구의 단일 소스로만 쓰인다). */
        crewCheckboxLabel: "{crewName}",
        /** FR-061 E5 — 소속 크루가 12개를 넘어 색이 반드시 겹칠 때의 안내. */
        collisionNotice: "소속 크루가 12개를 넘어 일부는 색이 겹쳐요. 크루명으로 구분해 주세요.",
        /** FR-013 AC2(I-067, 19일차) — 해산된 크루도 과거 이력 열람을 위해 필터 목록에 남지만
         *  더 이상 선택할 수 있는 미래 일정이 없다는 걸 알려야 한다. `CrewLegend`의 범용
         *  `badge` prop에 넘긴다 — 좁은 2열 그리드 안에 들어가야 해서 상세 패널
         *  (`detail.archivedCrewBadge`)보다 짧게 줄였다. */
        archivedCrewBadge: "해산됨",
      },
      /**
       * Task 021B — `DayDetailPanel`(FR-063). 데스크톱 사이드 패널·모바일 바텀시트 공통 문구.
       * `loading`·`error`는 이 회차 기준 `/sample` 데모 전용이다(패널은 컨테이너가 이미 불러온
       * 월간 데이터를 클릭 시 그대로 보여주는 표현 컴포넌트라 실제로 도달하지 않는다 — 아래
       * `DayDetailPanel.tsx` 모듈 docstring 참고, `MonthCalendar`의 021A `/sample` 항목과
       * 같은 전례).
       */
      detail: {
        /** 패널 제목. `{date}`는 `formatDayLabelKo`가 만든 "8월 14일 금요일"을 그대로 받는다. */
        title: "{date} 일정",
        /** FR-063 E1 — 그 날짜에 Meetup이 없을 때. */
        empty: "이 날짜에는 등록된 모임이 없어요",
        /** FR-063 E2 — 조회 실패(이 회차는 `/sample` 데모 전용, 위 docstring 참고). */
        errorTitle: "모임 정보를 불러오지 못했어요",
        errorDescription: "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
        /** FR-063 E3 — 취소된 Meetup 배지. */
        cancelledBadge: "취소됨",
        /** FR-013 AC2(I-067, 19일차) — 해산된 크루의 과거 Meetup에 붙는 배지.
         *  `cancelledBadge`와 배타적이지 않다(해산 전에 이미 취소됐던 Meetup은 둘 다 뜬다 —
         *  그 자체로는 사실 두 개가 함께 참이므로 그대로 보여준다). 이 Meetup은
         *  `status='confirmed'`로 실제 열렸던 일정이라 "취소됨"과 혼동되면 안 된다는 뜻에서
         *  독립된 문구로 뒀다. */
        archivedCrewBadge: "해산된 크루",
        /** `{count}`/`{capacity}` 정원 표시(FR-064 AC3 파생). */
        capacityLabel: "{count}/{capacity}명 참석",
        /** 정원 제한이 없는 Meetup(capacity === null). */
        noCapacityLabel: "{count}명 참석",
        /** 시각 미정(`startTime === null`)일 때. */
        timeUnset: "시각 미정",
        /**
         * FR-063 AC2 "원 제안글로 이동" — 항목 링크 안의 스크린 리더 전용 보조 문구(파라미터
         * 없음). 링크의 접근성 이름 자체는 `aria-label`로 덮지 않고 카드 안 텍스트(크루명·
         * 제목·시각 등)를 그대로 쓴다 — `aria-label`을 따로 채우면 그 풍부한 정보가 접근성
         * 트리에서 통째로 가려진다(`MeetupBar.tsx`의 title/aria-label 상호 배타 주석과 같은
         * 근거, W3C accname-1.2). 이 문구는 그 텍스트 끝에 `sr-only`로 덧붙어 "이동한다"는
         * 목적지 정보만 보탠다. */
        goToPostHint: "원 제안글로 이동",
        /** Task 022 — Meetup 상세(SC-17)로 이어지는 별도 링크. 카드 전체 링크(원 제안글행,
         *  `goToPostHint`)와 형제 요소로 나란히 둔다(`<a>` 중첩은 유효하지 않은 HTML). */
        goToMeetupDetail: "모임 상세 보기",
        close: "닫기",
      },
    },
  },

  /**
   * SC-19 계정 설정 페이지(FR-004·006, Task 015B). `nav.profile`("내 정보"는 헤더 계정 메뉴
   * 라벨)과는 의미가 달라 별도 키를 둔다. `title`은 Task 011(앱 셸)이 이미 만든 라우트 스텁이
   * 참조하던 값이라 그대로 유지했다 — 이 회차는 그 아래에 실제 화면 문구를 채운다.
   *
   * `handle.errors.invalidFormat`·`handle.errors.taken`은 `common.handle.invalidFormat`·
   * `common.handle.taken`을 그대로 참조한다 — `auth.signup.errors`의 동명 문구와 같은 순수
   * 함수(`validateHandleFormat`)가 판정하는 같은 개념이라 6일차 교차검증 W-2(DESIGN)로
   * `common`에 승격했다(`common` 모듈의 `handle` 키 docstring 참고). `cooldown`은 계정 설정
   * 전용 개념이라 공유하지 않는다.
   */
  account: {
    settings: {
      title: "계정 설정",
      description: "표시 이름·핸들·소개와 검색 노출 여부를 관리해요.",
      fields: {
        displayName: "표시 이름",
        bio: "한 줄 소개",
        bioPlaceholder: "나를 소개하는 한 줄을 남겨 보세요",
        searchOptOut: "핸들 검색 결과에 노출하지 않기",
        searchOptOutDescription:
          "켜면 다른 사람이 핸들로 나를 찾을 수 없어요. 이미 받은 초대는 그대로 유지돼요.",
      },
      submit: "저장",
      submitPending: "저장하는 중…",
      saved: "저장했어요",
      errors: {
        displayNameRequired: "표시 이름을 입력해 주세요",
        displayNameTooLong: "표시 이름은 30자 이하로 입력해 주세요",
        bioTooLong: "한 줄 소개는 150자 이하로 입력해 주세요",
        /** FR-002 E3과 같은 개념(세션 만료)이라 `auth.onboarding.errors.sessionExpired`와
         *  문구가 같다 — 다만 그쪽은 온보딩 전용 도메인이라 별도로 뒀다(§4). */
        sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
        loadFailed: "프로필 정보를 불러오지 못했어요",
        /** OnboardingFormContainer 문서화된 엣지 케이스(세션은 있는데 프로필 레코드가 없는
         *  Mock 경쟁 조건)와 같은 상황을 계정 설정 화면에서도 대비한다. */
        notFound: "프로필 정보를 찾을 수 없어요",
      },
      /** FR-004 AC1 — 핸들은 표시 이름·소개와 저장 트랜잭션을 분리했다(별도 폼·별도 액션,
       *  `lib/actions/change-account-handle.ts` docstring 참고) — 30일 쿨다운이라는 별도의
       *  실패 모드를 갖기 때문이다. */
      handle: {
        heading: "핸들",
        description: "다른 사람이 나를 검색할 때 쓰는 공개 아이디예요. 30일에 한 번만 바꿀 수 있어요.",
        label: "핸들",
        submit: "핸들 변경",
        submitPending: "변경하는 중…",
        saved: "핸들을 변경했어요",
        /** {date}는 YYYY.MM.DD 형식의 절대 날짜다(NFR-025, `formatPostDate`와 같은 이유로
         *  상대 시각을 쓰지 않는다). */
        lockedNotice: "다음 변경은 {date} 이후에 가능해요",
        errors: {
          invalidFormat: common.handle.invalidFormat,
          taken: common.handle.taken,
          /** 계정 설정 전용 개념(30일 쿨다운)이라 공유하지 않는다. */
          cooldown: "핸들은 30일에 한 번만 바꿀 수 있어요",
        },
      },
      /**
       * FR-002 로그아웃 — 계정 설정 화면의 섹션 문구. 앱 프레임이 430px로 고정돼 `HeaderNav`의
       * 계정 내비(`md:flex`)가 실제로는 켜지지 않으므로, 이 화면이 로그아웃의 유일한 진입점이다
       * (`LogoutButton` docstring 참고). 버튼 라벨 자체는 헤더와 공유하는 `auth.logout`을 쓴다.
       */
      logout: {
        heading: "로그아웃",
        description: "이 기기에서 로그아웃해요. 저장된 내용은 그대로 남아 있어요.",
      },
      /**
       * FR-072(Task 044) — 알림 환경설정. `NotificationPreferencesContainer`가 이 화면
       * (`/settings`)에 조립한다. `typeLabels`는 `notification.messages`(토스트·알림 센터 문구,
       * "~됐어요")를 그대로 재사용하지 않는다 — 설정 화면의 토글 라벨은 "이벤트가 이미
       * 일어났다"가 아니라 "이 유형의 알림을 받을지"를 묻는 다른 시제·어투가 자연스럽다(§4
       * "같은 개체라도 도메인 맥락이 다르면 공유하지 않는다").
       */
      notifications: {
        heading: "알림 설정",
        description: "이벤트 유형별로, 또는 크루별로 토스트 알림을 켜고 끌 수 있어요.",
        typeSection: {
          title: "이벤트 유형별 알림",
        },
        crewSection: {
          title: "크루별 알림",
          empty: "소속된 크루가 없어요",
          /** AC2 — 크루 하나를 통째로 끄는 토글의 라벨. `{crewName}`은 컨테이너가 조립한다. */
          muteToggleLabel: "{crewName} 알림 끄기",
        },
        /** AC3 — 항상 켜져 있는 두 유형(`poll_closed`·`member_removed`) 옆에 붙는 안내. */
        mandatoryHint: "권리·의무에 영향을 주는 알림이라 끌 수 없어요",
        typeLabels: {
          pollClosed: "투표 종료",
          joinRequestReceived: "가입 신청 접수",
          joinRequestApproved: "가입 신청 승인",
          joinRequestRejected: "가입 신청 반려",
          invitationReceived: "크루 초대",
          staffAppointed: "임원 임명",
          memberRemoved: "강퇴",
          meetupCreated: "모임 생성",
          meetupCancelled: "모임 취소",
          postCommented: "내 글의 새 댓글",
          ownershipTransferred: "오너 변경",
          crewDisbanded: "크루 해산",
          pollWithdrawn: "제안 철회",
        },
        errors: {
          updateFailed: "설정을 저장하지 못했어요. 다시 시도해 주세요",
          forbidden: "이 알림 유형은 끌 수 없어요",
          loadFailed: "알림 설정을 불러오지 못했어요",
        },
      },
      /**
       * FR-005 회원 탈퇴(Task 039, D-010). 계정 설정 화면의 가장 아래 섹션 — 파괴적 행위라
       * 별도 다이얼로그(비밀번호 재확인)를 거친다. `blockedByOwnership`은 AC1(오너 크루 보유
       * 시 차단)의 안내 문구다.
       */
      withdraw: {
        heading: "계정 탈퇴",
        description: "탈퇴하면 계정이 30일간 비활성화된 뒤 개인정보가 파기돼요.",
        /** D-010 — 정상 흐름 ②(처리 내역 고지)에 쓰는 안내 3줄. */
        /**
         * FR-005 정상 흐름 ②(처리 내역 고지). **정정(19일차, I-068 — DESIGN 실측·팀장 확인)**:
         * `content`가 시점을 밝히지 않아 "탈퇴 즉시 작성자 표기가 바뀐다"로 읽혔지만, 실제로는
         * `personalData`와 같은 시점(30일 유예가 끝난 뒤, D-044 `deactivated`→`withdrawn`
         * 전이)에만 바뀐다 — `request_account_deactivation()`은 `display_name` 등을 건드리지
         * 않고, `anonymize_expired_deactivated_profiles()`(pg_cron, 30일 경과 후)가 그제서야
         * 바꾼다(실측). 그 사이 유예 기간에는 크루원들에게 실명·실아바타가 계속 작성자로
         * 보인다 — D-044 설계(유예 중 PII 원본 보존) 자체는 의도된 것이라 동작은 고치지 않고
         * 문구만 시점을 명시하도록 고쳤다.
         */
        notice: {
          personalData: "이메일·핸들·표시 이름·아바타·소개는 30일 뒤 파기돼요.",
          content: "작성한 게시글·투표·채팅은 본문이 유지돼요. 작성자 표기는 30일 유예가 끝난 뒤 '탈퇴한 사용자'로 바뀌고, 그 전까지는 그대로 보여요.",
          votes: "투표 기록은 집계 정합성을 위해 그대로 남아요.",
        },
        blockedByOwnership: {
          title: "오너로 있는 크루가 있어요",
          description: "탈퇴하려면 먼저 아래 크루의 오너를 다른 사람에게 넘기거나 크루를 해산해야 해요.",
        },
        confirmDialog: {
          title: "정말 탈퇴할까요?",
          description: "비밀번호를 다시 입력하면 탈퇴가 진행돼요. 30일 안에는 다시 로그인해 복구할 수 있어요.",
          passwordLabel: "현재 비밀번호",
          submit: "탈퇴하기",
          submitPending: "처리하는 중…",
          cancel: "취소",
        },
        errors: {
          incorrectPassword: "비밀번호가 일치하지 않아요",
          ownsActiveCrew: "오너로 있는 크루가 있어 탈퇴할 수 없어요",
          unknown: "탈퇴 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
        },
      },
    },
    /**
     * FR-006 핸들 검색(D-005) — `UserSearchField`·`UserSearchResult`가 쓴다. 계정 설정
     * 화면에서 먼저 채우지만, Task 017A(멤버 초대 다이얼로그)가 같은 컴포넌트를 재사용할 때도
     * 이 문구를 그대로 쓸 수 있다(초대 버튼 등 맥락별 추가 문구는 그때 별도 도메인에 둔다).
     */
    search: {
      heading: "사용자 검색",
      description: "핸들을 정확히 입력하면 사용자를 찾을 수 있어요. 일부만 입력하면 검색되지 않아요(D-005).",
      fields: {
        handle: "핸들",
        placeholder: "찾을 사용자의 핸들 입력",
      },
      submit: "검색",
      submitPending: "검색하는 중…",
      /** R-012 — "핸들이 없음"과 "옵트아웃"을 이 문구 하나로 통일한다(`lib/rules/handle-search.ts`
       *  `projectHandleSearchResult`가 두 경우를 같은 값으로 만든 뒤 이 문구가 그 값을 그린다). */
      notFound: "해당 핸들의 사용자가 없습니다",
      /** D-005·NFR-016(계정당 분당 20회) 초과 시 문구(Task 038). `searchUserByHandleAction`이
       *  실제로 카운팅한다 — `/sample`의 "오류" 패널은 이 상태의 정적 재현이다. */
      rateLimited: "너무 많이 검색했어요. 잠시 후 다시 시도해 주세요.",
      resultAriaLabel: "검색 결과",
    },
    /**
     * FR-005 AC3(Task 039) — `/account/restore`. `profiles.status==="deactivated"`인 계정이
     * 로그인했을 때(Supabase Auth 세션 자체는 유효) 도달하는 화면이다. `graceEndsAt`까지
     * 남은 기간 안내 + 복구 버튼을 보여준다.
     */
    restore: {
      title: "탈퇴 처리 중인 계정이에요",
      /** {date}는 YYYY.MM.DD 형식(NFR-025, 상대 시각 미사용 관례를 그대로 따른다). */
      description: "{date}까지 복구하지 않으면 개인정보가 파기되고 되돌릴 수 없어요.",
      restore: "계정 복구하기",
      restorePending: "복구하는 중…",
      restored: "계정을 복구했어요. 다시 로그인해 주세요.",
      backToLogin: "로그인 화면으로",
      errors: {
        graceExpired: "유예 기간이 지나 복구할 수 없어요",
        notDeactivated: "이미 활성 상태인 계정이에요",
        unknown: "복구 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
      },
    },
  },

  /** SC-20 받은 초대함 페이지(FR-021·028, Task 017B). */
  invitation: {
    inbox: {
      title: "받은 초대함",
      description: "받은 초대에 응답하면 바로 크루원이 되거나 목록에서 사라져요.",
      /** FR-021 — 대기 중인 초대가 없을 때. */
      empty: "받은 초대가 없어요",
      /** `{name}`은 초대를 보낸 오너·임원의 표시 이름. */
      inviterLabel: "{name}님이 초대했어요",
      /** `{date}`는 YYYY.MM.DD 절대 날짜(NFR-025, `formatInvitationExpiry`). */
      expiresLabel: "{date}까지 응답할 수 있어요",
      acceptButton: "수락",
      declineButton: "거절",
      errors: {
        sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
        notAllowed: "이 초대에 응답할 권한이 없어요",
        /** 초대 id가 존재하지 않거나 본인 앞으로 온 초대가 아닌 경우(위조 시도 방어 포함). */
        notFound: "그 초대를 찾을 수 없어요",
        /** `lib/rules/invitation-response-eligibility.ts`의 `InvitationResponseIneligibleReason`과
         *  키를 맞췄다. */
        already_responded: "이미 응답한 초대예요",
        crew_unavailable: "이 크루는 더 이상 존재하지 않아요",
        expired: "만료된 초대예요",
        failed: "처리하지 못했어요. 다시 시도해 주세요.",
      },
    },
  },

  board: {
    list: {
      title: "게시판",
      empty: "아직 등록된 글이 없어요",
      writeButton: "글쓰기",
      typeFilterAll: "전체",
      totalCount: "총 {count}건",
      loadError: "게시글 목록을 불러오지 못했어요",
      pagination: {
        prev: "이전",
        next: "다음",
        pageStatus: "{page} / {totalPages} 페이지",
      },
    },
    postType: {
      free: "자유글",
      proposal: "모임 제안",
      /** I-079/FR-065 AC2(26일차) — `meetup_reschedule_proposal` 전용 배지. `proposal`("모임
       *  제안")과 같은 자리를 공유하지 않는다 — "구분되게"(팀장 지시) 요구가 게시판 목록·상세
       *  배지에도 적용돼야 하기 때문이다. `meetup.reschedule.pageTitle`과 같은 문구를 쓴다. */
      reschedule: "일정 변경 제안",
    },
    // 목록의 투표 상태 배지는 별도 문구 세트를 두지 않고 `vote.status`를 그대로 재사용한다.
    // 예전엔 board.voteStatusBadge로 따로 뒀는데, closed_invalid 하나를 두고 "무효"/"정족수 미달"로
    // 다른 값을 쓰고 있었고 cancelled·tallying 대응 키도 없어 실제로는 vote.status의 부분 복제였다
    // (하나의 상태값에 두 벌의 문구가 존재 → §4 "상태 배지류는 상태 머신의 상태값과 키를 맞춘다"
    // 위반). 목록은 vote.status 중 open/closedPassed/closedRejected/closedInvalid 4개만 쓰고
    // cancelled/tallying은 목록 배지에 노출하지 않는다 — 이건 별도 값이 필요해서가 아니라 목록
    // AC(요구사항 §4.D AC3 "진행 중/가결/부결/무효")가 그 4개만 요구하기 때문이다.
    write: {
      title: "글쓰기",
      typeToggleLabel: "글 유형",
      fields: {
        title: "제목",
        description: "설명",
        scheduledDate: "모임 예정일",
        voteDeadline: "투표 마감 시각",
        startTime: "시작 시각",
        location: "장소",
        capacity: "정원",
      },
      draftRestoredNotice: "작성 중이던 내용을 불러왔어요",
      draftSaved: "임시 저장됨",
      submit: "등록",
      submitPending: "등록하는 중…",
      validation: {
        titleRequired: "제목을 입력해 주세요",
        descriptionRequired: "설명을 입력해 주세요",
        scheduledDateInPast: "모임 예정일은 오늘 이후여야 해요",
        voteDeadlineAfterSchedule: "투표 마감은 모임 예정일 이전이어야 해요",
        voteDeadlineInPast: "투표 마감은 현재 시각 이후여야 해요",
        /** D-003 투표 기한 허용 범위(1시간~14일) — `lib/rules/poll-timezone.ts`의
         *  `validatePollDuration`이 판정한다. FR-034 E1~E3에는 명시되지 않았지만
         *  모임 제안글 등록이 Poll 생성의 유일한 경로라 여기서 함께 강제한다. */
        voteDeadlineTooShort: "투표 마감까지 최소 1시간 이상 남아야 해요",
        voteDeadlineTooLong: "투표 기간은 최대 14일이에요",
        duplicateDateWarning:
          "같은 날짜에 이미 가결된 모임이 있어요. 그래도 등록할까요?",
      },
    },
    detail: {
      title: "게시글 상세",
      edited: "(수정됨)",
      deleted: common.post.deleted,
      deletedDescription: "작성자가 삭제했거나 더 이상 볼 수 없는 게시글이에요",
      lockedNotice: "투표가 시작되어 더 이상 수정할 수 없어요",
      shareToChat: "채팅에 공유",
      backToList: "게시판으로",
      deleteConfirmTitle: "게시글을 삭제할까요?",
      deleteConfirmDescription: "삭제하면 되돌릴 수 없어요.",
    },
    /** 댓글(FR-033, Task 041). 대댓글(답글) depth는 1단계로 제한한다(요구사항 문서 "범위 판단"). */
    comment: {
      title: "댓글",
      countLabel: "댓글 {count}개",
      empty: "아직 댓글이 없어요. 첫 댓글을 남겨보세요!",
      loadError: "댓글을 불러오지 못했어요",
      deletedPlaceholder: "삭제된 댓글이에요",
      form: {
        placeholder: "댓글을 입력하세요",
        submit: "등록",
        submitPending: "등록하는 중…",
        replyPlaceholder: "답글을 입력하세요",
        replySubmit: "답글 등록",
        cancel: "취소",
      },
      actions: {
        reply: "답글",
        edit: "수정",
        delete: "삭제",
        save: "저장",
        deleteConfirmTitle: "댓글을 삭제할까요?",
        deleteConfirmDescription: "삭제하면 되돌릴 수 없고, 이 댓글에 달린 답글은 그대로 남아요.",
      },
      errors: {
        bodyRequired: "댓글 내용을 입력해 주세요",
        submitFailed: "댓글을 반영하지 못했어요. 다시 시도해 주세요",
        notFound: "댓글을 찾을 수 없어요",
        forbidden: "이 댓글에 대한 권한이 없어요",
      },
    },
  },

  /**
   * 상태 키는 camelCase로 통일했다(§4 명명 규칙). 실제 판정 순수 함수(Task 009A, 3~4주차 예정)의
   * 리턴값은 상태 다이어그램(requirements.md §2.4)상 `open`/`closed_passed`/`closed_rejected`/
   * `closed_invalid`처럼 snake_case일 가능성이 높다 — 그 확정 값이 나오기 전까지는 호출부가
   * snake_case → 여기 camelCase 키로 매핑해야 한다. **009A가 상태 리터럴을 확정하면 이 매핑이
   * 실제로 1:1인지, 아니면 별도 매핑 테이블이 필요한지 정합화가 필요하다.**
   */
  vote: {
    choice: {
      approve: "찬성",
      reject: "반대",
      abstain: "기권",
    },
    status: {
      open: "투표 진행 중",
      closedPassed: "가결",
      closedRejected: "부결",
      closedInvalid: "정족수 미달",
      cancelled: "취소됨",
      tallying: "결과 집계 중",
    },
    summary: {
      participants: "참여 {voted}명 / 대상 {total}명",
      quorum: "정족수 {quorum}명",
      quorumMet: "정족수 충족",
      quorumNotMet: "정족수 미달",
      timeLeft: "마감까지 {time} 남음",
      closedAt: "{time}에 종료됨",
    },
    errors: {
      votingClosed: "투표가 종료되었습니다",
      alreadyVoted: "이미 투표했습니다",
      /** FR-041 AC4 — 비대상자에게 컨트롤을 비활성화하며 함께 보여주는 사유 텍스트 2종.
       *  "크루원이 아님"과 "크루원이지만 이 투표의 스냅샷 밖"은 서로 다른 상황이라 문구를
       *  나눈다(전자는 D-039 크루원 게이트가 board 하위 라우트를 이미 막아 실제로는 거의
       *  오지 않지만, Server Action 직접 호출 방어를 위해 남긴다). */
      notEligibleNotMember: "크루원만 투표할 수 있어요",
      notEligibleNotInSnapshot: "이 투표가 시작된 뒤 가입해 투표 대상이 아니에요",
      submitFailed: "투표를 반영하지 못했어요. 다시 시도해 주세요",
    },
    resultReason: {
      passed: "정족수 충족 · 찬성 우세로 가결되었습니다",
      rejectedTie: "찬반 동수로 부결되었습니다",
      rejectedMajority: "반대 우세로 부결되었습니다",
      invalidQuorum: "정족수 미달로 무효 처리되었습니다",
    },
    /** FR-043 AC4 · D-024 — 마감 시각은 지났지만 자동 종료 처리(pg_cron, Task 034)가 아직
     *  안 된 window의 보조 설명. `status.tallying`(제목)과 함께 쓴다. */
    tallyingDescription: "자동 종료 처리가 진행 중이에요. 잠시 후 결과가 반영돼요",
    /** D-003 종료 트리거② — 조기 종료(FR-043 AC3). */
    earlyClose: {
      trigger: "조기 종료",
      confirmTitle: "투표를 지금 종료할까요?",
      confirmDescription: "종료하면 되돌릴 수 없고, 지금까지의 집계로 결과가 확정돼요.",
      confirmAction: "종료하기",
      cancelAction: "취소",
      pending: "종료 처리 중…",
      alreadyClosed: "이미 종료된 투표예요",
      forbidden: "조기 종료 권한이 없어요",
    },
    /** FR-046 AC1·AC3(Task 044) — 제안 철회. `earlyClose`와 같은 Dialog 확인 형태를 쓴다. */
    withdraw: {
      trigger: "제안 철회",
      confirmTitle: "이 제안을 철회할까요?",
      confirmDescription: "철회하면 투표가 취소되고 대상자 전원에게 알림이 가요. 되돌릴 수 없어요.",
      confirmAction: "철회하기",
      cancelAction: "취소",
      pending: "철회 처리 중…",
      alreadyClosed: "이미 종료되었거나 취소된 투표예요",
      forbidden: "철회 권한이 없어요",
    },
  },

  /**
   * Task 022(FR-064·066~068) — Meetup 상세(SC-17). `calendar.month.detail`(DayDetailPanel,
   * FR-063 패널의 요약 행)과 필드가 겹치지만(크루명·시각·정원 등) 별도 네임스페이스로
   * 유지한다 — "같은 개체라도 도메인 맥락이 다르면 공유하지 않는다"(위 §4 원칙, 이미
   * `auth.signup`/`auth.onboarding`의 `displayName` 오류 문구가 같은 이유로 갈라져 있다).
   * `detail.time`/`detail.place`는 FR-064 AC1 "시각·장소는 입력된 경우에만" 요구를 그대로
   * 따라 — `calendar.month.detail.timeUnset`처럼 "미정" 플레이스홀더를 쓰지 않고, 값이
   * 없으면 그 줄 자체를 렌더링하지 않는다(컴포넌트 쪽 책임, 문자열은 값이 있을 때만 쓰인다).
   */
  meetup: {
    detail: {
      title: "Meetup 상세",
      goToPost: "원 제안글 보기",
      /** FR-060 1:1 — 가결된 투표(`PollResult`)에서 이 Meetup으로 가는 링크 CTA. Meetup 상세
       *  화면 자체는 이 회차 DESIGN(Task 022) 몫이라 `PollResult`는 문구+링크만 만든다
       *  (Task 019, R-016 — 경로 문자열이 아니라 리소스 ID 기준). */
      viewConfirmed: "확정된 모임 보기",
      pollResult: "투표 결과",
      voteTally: "찬성 {for}표 · 반대 {against}표 · 기권 {abstain}표",
      capacityLabel: "참석 {count} / 정원 {capacity}",
      noCapacityLabel: "참석 {count}명 (정원 제한 없음)",
      cancelledBadge: "취소됨",
      participants: {
        title: "참석자",
        attending: "참석",
        absent: "불참",
        noResponse: "미응답",
        empty: "아직 없어요",
      },
      /** I-079/FR-065 AC2(26일차) — 조회자 본인의 참석 응답이 일정 변경으로 무효화됐을 때의
       *  안내 배너. 무효화가 조용히 일어나면 사용자는 자신이 여전히 참석자인 줄 안다 —
       *  팀장 결정("재확인을 요구한다")의 UI 반영이 이 문구다. */
      attendanceInvalidatedNotice: "모임 일정이 변경돼 참석 응답이 초기화됐어요. 다시 응답해 주세요.",
      /** I-079/FR-065 AC2 — "일정 변경 이력" 표시(AC2 "이력이 남는다"). 빈 상태(이력 없음)는
       *  `empty`. `changedAtLabel`은 `board/format-post-date.ts`의 절대 날짜 포맷을 그대로
       *  쓴다(별도 문자열 없음). */
      scheduleHistory: {
        title: "일정 변경 이력",
        empty: "아직 일정 변경 이력이 없어요",
        /** "8월 14일 금요일 07:00 → 8월 21일 금요일 19:00" 형태. 시각이 없으면 그 조각을
         *  생략한다(FR-064 AC1과 같은 원칙, 컴포넌트 쪽 책임). */
        change: "{previousDate} → {newDate}",
      },
    },
    attendance: {
      attend: "참석",
      absent: "불참",
      full: "마감되었습니다",
      recruiting: "모집 중",
      switchToAbsent: "불참으로 변경",
      submitPending: "처리하는 중…",
      /** FR-066 E3 — 예정일이 지난 Meetup은 읽기 전용이다. */
      closedNotice: "예정일이 지난 모임이라 응답을 변경할 수 없어요",
      errors: {
        invalidRequest: "잘못된 요청이에요",
        sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
        notFound: "모임을 찾을 수 없어요",
        notMember: "이 크루의 크루원만 응답할 수 있어요",
        cancelled: "취소된 모임이라 응답할 수 없어요",
        closed: "예정일이 지난 모임이라 응답할 수 없어요",
        /** FR-066 E1·E2 — 조건부 UPDATE(D-019)가 실제로 거부한 경우. */
        full: "정원이 차서 참석할 수 없어요",
      },
    },
    cancelled: "취소된 모임입니다",
    /** FR-065(Task 041 → 26일차 BOARD, I-079) — 취소. **"일정 변경"은 더 이상 이 액션(취소)을
     *  거치지 않는다** — 21일차엔 D-003(재투표 요구) 때문에 "취소 + 새 제안글 작성 안내"라는
     *  임시 경로였지만(`community-expansion-041.md` §3), 26일차 CORE가 "기존 확정 Meetup을
     *  UPDATE하는 재투표"를 스키마 레벨에서 가능하게 만들면서(I-079) 그 임시 경로를
     *  `meetup.reschedule.*`(전용 진입점)로 대체했다. 이 자리(`lifecycle`)에는 이제 취소만
     *  남는다. */
    lifecycle: {
      cancelTrigger: "모임 취소",
      cancelConfirmTitle: "이 모임을 취소할까요?",
      cancelConfirmDescription: "취소하면 캘린더에서 취소 표시로 바뀌고 크루원에게 알림이 가요. 되돌릴 수 없어요.",
      cancelConfirmAction: "취소하기",
      /** I-079 — "일정 변경 제안" 전용 화면(`getMeetupRescheduleHref`)으로 이동하는 링크
       *  버튼의 라벨. 취소와 달리 확인 Dialog가 없다 — 즉시 취소하는 게 아니라 글쓰기 화면으로
       *  이동만 하므로(파괴적 동작이 아니다), `PostWriteContainer`로 가는 "글쓰기" 버튼과 같은
       *  성격이다. */
      rescheduleTrigger: "일정 변경 제안",
      cancelAction: "닫기",
      pending: "처리하는 중…",
      errors: {
        submitFailed: "처리하지 못했어요. 다시 시도해 주세요",
        forbidden: "취소 권한이 없어요",
        notFound: "모임을 찾을 수 없어요",
        conflict: "이미 취소됐거나 예정일이 지난 모임이에요",
      },
    },
    /**
     * I-079/FR-065 AC2(26일차) — "일정 변경 제안" 전용 글쓰기 화면(`MeetupRescheduleForm`).
     * 일반 FR-034 제안(`board.write.*`)과 필드 구성이 같아 제목·설명·투표 마감·시작 시각·
     * 장소·정원 라벨과 검증 문구는 `board.write.fields`·`board.write.validation`을 그대로
     * 재사용한다(§4 "같은 개념은 문구를 공유한다") — 이 자리에는 이 화면 고유의 문구만 둔다.
     */
    reschedule: {
      pageTitle: "일정 변경 제안",
      description:
        "새 일정으로 재투표를 진행해요. 가결되면 이 모임의 날짜·시각·장소·정원이 바뀌고, 기존 참석 응답은 모두 초기화돼요.",
      currentScheduleLabel: "현재 일정",
      capacityLabel: "정원 {capacity}명",
      noCapacityLabel: "정원 제한 없음",
      invalidationWarning:
        "제안이 가결되면 참석자 전원의 응답이 초기화돼요 — 다들 새 일정에 다시 응답해야 해요.",
      submit: "제안 등록",
      submitPending: "등록하는 중…",
      errors: {
        /** `CreatePostActionResult`의 `kind:"denied"` 세 코드에 대응한다(`create-post.ts`
         *  참고, BOARD가 새 `kind`를 만들지 않고 기존 코드 유니온에 `conflict`만 얹기로 판단한
         *  근거는 그 파일 docstring에 있다). */
        forbidden: "일정 변경 제안 권한이 없어요",
        notFound: "대상 모임을 찾을 수 없어요",
        conflict: "취소됐거나 예정일이 지난 모임이라 일정 변경을 제안할 수 없어요",
        submitFailed: "제안을 등록하지 못했어요. 다시 시도해 주세요",
      },
    },
  },

  chat: {
    room: {
      title: "채팅방",
      /** FR-050 AC1 — 크루 개설 직후 채팅방은 이미 존재하지만 메시지가 없는 빈 상태. */
      empty: "아직 대화가 없어요. 첫 메시지를 보내보세요!",
      /** Task 020B `ConnectionBanner`의 "disconnected" 상태(FR-051 E2, NFR-009) — 브라우저
       *  online/offline과 `subscribeToRoom`의 `onError`(D-030 ③ 도메인 오류) 양쪽에서 쓰인다.
       *  Task 020A 때는 이 자리가 `MessageList` 안의 인라인 배너였다(이제 방 상단 배너 하나로
       *  합쳤다). */
      connectionErrorTitle: "실시간 연결에 문제가 발생했어요",
      /** 재연결되면 `resyncChatMessagesAction`(FR-051 E3)이 자동으로 누락분을 이어받으므로,
       *  "새로고침하라"던 이전 문구(Task 020A) 대신 자동 복구를 안내한다. */
      connectionErrorDescription: "연결이 복구되면 놓친 메시지를 자동으로 이어받아요. 계속되면 새로고침해 주세요.",
      /** `ConnectionBanner`의 "reconnecting" 상태. */
      reconnecting: "다시 연결하는 중…",
      loadingEarlier: "이전 메시지를 불러오는 중…",
    },
    /** `PostLinkCard`(Task 020C, FR-052) 전용 문구. 제목·작성자·유형 배지·투표 상태는
     *  각각 `board.postType`·`vote.status`·`vote.summary`를 그대로 재사용한다(§4 "같은
     *  판정·같은 개념" — `PostTypeBadge`·`PollStatusBadge`·`PollCountdown` 컴포넌트 자체를
     *  재사용하므로 문구도 저절로 공유된다). 카드로 확장하지 않는 두 분기(FR-052 E1·E2)만
     *  여기 따로 둔다. */
    postCard: {
      deletedPost: common.post.deleted,
      otherCrewPost: "다른 크루의 게시글이에요",
    },
    message: {
      deleted: "삭제된 메시지입니다",
      send: "전송",
      inputPlaceholder: "메시지를 입력하세요",
      /** Task 020B — 낙관적 렌더(FR-051 정상 흐름 ③) 말풍선의 스크린 리더 전용 문구. 시각적으로는
       *  스피너 하나뿐이라(색·타임스탬프 자리만 바뀐다) 보조기술 사용자에게는 이 문구가 유일한
       *  신호다(NFR-021). */
      sending: "전송 중…",
      /** 10일차 접근성 QA(Task 024, NFR-021 "새 메시지"). 실시간으로 도착한 상대방 메시지를
       *  스크린 리더에 알리는 시각적으로 숨겨진 live region 문구(`MessageList.tsx`). 본문을
       *  그대로 다시 읽지 않는다 — 말풍선 자체와 이중 낭독을 피하고, 게시글 공유 카드처럼
       *  본문(`body`)이 없는 메시지 유형도 있어서다. */
      newMessageAnnouncement: "{name}님이 새 메시지를 보냈어요",
      /** Task 020B — 실패한 말풍선의 재전송 버튼(FR-051 E1 "실패 표시 + 재전송 버튼"). 폼 상단
       *  경고(`errors.sendFailed`)와 별도 문구를 쓴다 — 이건 메시지 하나에 붙는 인라인 라벨이지
       *  경고 배너가 아니다. */
      resend: "재전송",
      /** Task 020B — 실패한 말풍선 옆 인라인 문구. `errors.sendFailed`(폼 상단 경고, 전송 전
       *  클라이언트 검증 실패용)와 다르다 — 이건 낙관적으로 이미 그려진 말풍선이 실패로
       *  바뀔 때 그 자리에 붙는다. */
      sendFailedInline: "전송하지 못했어요",
      /** FR-054(Task 041) — 메시지 삭제 버튼·확인 다이얼로그. `board.comment.actions.delete`
       *  계열과 같은 문구 세트를 채팅 전용으로 둔다(§4 — 게시글·댓글·메시지는 서로 다른 개체). */
      delete: {
        triggerLabel: "메시지 삭제",
        confirmTitle: "메시지를 삭제할까요?",
        confirmDescription: "삭제하면 되돌릴 수 없고, 모든 접속자 화면에 즉시 반영돼요.",
        confirmAction: "삭제",
        cancelAction: "취소",
      },
      errors: {
        /** FR-051 E4. */
        tooLong: "메시지는 {max}자 이내로 입력해 주세요",
        empty: "보낼 메시지를 입력해 주세요",
        /** FR-051 E1. 권한 거부·방 불일치 등 서버측 실패도 이 문구로 뭉뚱그린다 — 로그인
         *  실패(genericError)와 같은 이유로 어느 지점이 막혔는지 굳이 구분해 알려주지 않는다.
         *  Task 020B부터는 이 값이 폼 상단이 아니라 `sendFailedInline`을 통해 말풍선 옆에
         *  간접적으로만 쓰인다(서버가 이 문자열 자체를 반환하지만 컨테이너는 성공/실패
         *  여부만 보고 `sendFailedInline`으로 통일해 보여준다) — 그래도 서버 쪽 로그·향후
         *  다른 호출부를 위해 값은 유지한다. */
        sendFailed: "메시지를 보내지 못했어요. 다시 시도해 주세요",
      },
    },
    /** FR-055(Task 044) — 크루 목록의 읽지 않은 메시지 배지(`CrewCard`). 숫자 자체는 시각
     *  장식이라 `aria-hidden`이고, 이 문구가 배지의 유일한 스크린 리더 이름이다(`a11y.
     *  unreadCount`와 같은 원칙, 다만 "알림"이 아니라 "채팅"이라 도메인을 분리했다). */
    unread: {
      badgeLabel: "읽지 않은 메시지 {count}건",
    },
  },

  /**
   * 알림 토스트(FR-070)·알림 센터(FR-071, Task 023). `messages.*`는 알림 유형(FR-070 "대상
   * 이벤트" 10종, `NotificationType`과 1:1 대응)별 안내 문구로, 토스트 본문과 알림 센터 목록
   * 항목이 완전히 같은 문구를 공유한다(README §4 "같은 개체를 가리키면 common에 준하는 공유" —
   * 여기서는 도메인이 하나라 `notification` 하위에 두고 두 화면이 함께 참조한다). 알림이 실제로
   * 가리키는 경로(리소스 ID 기반)는 이 모듈이 아니라 `notification-routing.ts`가 계산한다(R-016,
   * `src/lib/strings/README.md` §9와 같은 경계).
   */
  notification: {
    center: {
      title: "알림",
      empty: "새 알림이 없어요",
      emptyDescription: "새로운 소식이 오면 여기에 모아서 보여드려요",
      markAllRead: "모두 읽음으로 표시",
      loadError: "알림을 불러오지 못했어요",
      loadErrorDescription: "잠시 후 다시 시도해 주세요",
    },
    bell: {
      triggerLabel: "알림 센터 열기",
      viewAll: "모든 알림 보기",
      goTo: "바로가기",
    },
    messages: {
      pollClosed: "투표가 종료됐어요",
      joinRequestReceived: "새 가입 신청이 있어요",
      joinRequestApproved: "가입 신청이 승인됐어요",
      joinRequestRejected: "가입 신청이 반려됐어요",
      invitationReceived: "크루 초대를 받았어요",
      staffAppointed: "임원으로 임명됐어요",
      memberRemoved: "크루에서 강퇴됐어요",
      meetupCreated: "새 모임이 만들어졌어요",
      meetupCancelled: "모임이 취소됐어요",
      postCommented: "내 글에 새 댓글이 달렸어요",
      /** FR-025 오너 이양(Task 040) — 이전 오너·신규 오너 양쪽에 보낸다. */
      ownershipTransferred: "크루 오너가 바뀌었어요",
      /** FR-013 크루 해산(Task 040) — 해산 시점의 전 크루원에게 보낸다. */
      crewDisbanded: "크루가 해산됐어요",
      /** FR-046 제안 철회(Task 044) — 진행 중 투표 대상자 전원에게 보낸다. */
      pollWithdrawn: "제안이 철회됐어요",
    },
  },

  /**
   * Task 015A(FR-001·002·004) 회원가입·로그인·온보딩 화면. 셋 다 `displayName` 필드를
   * 다루므로 오류 문구 일부(필수 입력·글자 수 초과)는 신중히 각 도메인에 중복 선언했다 —
   * 화면마다 나중에 다른 어투로 다듬을 수 있어야 하고(§4 "같은 개체라도 도메인 맥락이
   * 다르면 공유하지 않는다"), 실제로 `handleTaken`처럼 신청 시점이 다른 문구는 이미
   * 갈라져 있다.
   */
  auth: {
    /** FR-002 로그아웃(Task 030) — `LogoutButton`의 버튼 라벨. `HeaderNav`와 `/settings`
     *  로그아웃 섹션이 같은 컴포넌트를 쓰므로 라벨도 한 곳에서 공유한다. */
    logout: "로그아웃",
    /** 세션 폐기 → 랜딩 리다이렉트까지 서버 왕복이 있어 pending 구간이 눈에 보인다 —
     *  그 사이 버튼이 눌린 채로 남으면 이중 제출로 읽히므로 라벨을 바꿔 진행 중임을 알린다. */
    logoutPending: "로그아웃하는 중…",
    /** FR-002 AC3(17일차) — `RedirectToLogin`의 `<noscript>` 폴백. JS가 꺼져 있으면
     *  `useEffect` 기반 클라이언트 리다이렉트가 동작하지 않아 수동으로 갈 수단이 필요하다. */
    redirectingToLogin: {
      message: "로그인이 필요합니다.",
      linkLabel: "로그인 화면으로 이동",
    },
    login: {
      title: "로그인",
      description: "다시 만나서 반가워요. 이메일과 비밀번호로 로그인하세요.",
      fields: {
        email: "이메일",
        password: "비밀번호",
      },
      submit: "로그인",
      submitPending: "로그인하는 중…",
      /** FR-002 E2·AC4(D-020). Mock 단계는 실제 15분 카운트다운 대신 고정 안내만 보여준다 —
       *  D-020 "v0.1(Mock)에서는 잠금 화면 상태만 만든다". */
      lockedNotice: "5회 연속 실패로 잠시 로그인이 제한돼요. 15분 뒤 다시 시도해 주세요.",
      /** FR-002 E1 — 이메일·비밀번호 중 어느 쪽이 틀렸는지 구분하지 않는 단일 메시지. */
      genericError: "이메일 또는 비밀번호를 확인해 주세요",
      /** FR-002 E4 → FR-001 E4로 이관 — 가입은 됐지만 이메일 인증이 끝나지 않은 계정의
       *  로그인 시도. E1(자격 증명 불일치)과 원인이 다르므로 별도 문구를 쓴다. */
      emailNotVerifiedNotice: "이메일 인증이 아직 완료되지 않았어요. 받은 메일함에서 인증 링크를 확인해 주세요.",
      /** FR-003(Task 039) — 로그인 폼에서 재설정 화면으로 가는 진입점. */
      forgotPassword: "비밀번호를 잊으셨나요?",
      noAccount: "아직 계정이 없으신가요?",
      goToSignup: "회원가입",
    },
    signup: {
      title: "회원가입",
      description: "크루를 만들고 모임을 확정하려면 먼저 계정이 필요해요.",
      fields: {
        email: "이메일",
        password: "비밀번호",
        passwordDescription: "8자 이상으로 입력해 주세요.",
        /** 21일차 추가 — 오타로 잘못된 비밀번호가 저장되면 이메일 인증까지 끝낸 뒤에야
         *  로그인에서 막히므로(가입 직후에는 세션이 없어 즉시 드러나지 않는다) 입력 단계에서
         *  잡는다. */
        passwordConfirm: "비밀번호 확인",
        passwordConfirmDescription: "확인을 위해 같은 비밀번호를 한 번 더 입력해 주세요.",
        handle: "핸들",
        handleDescription:
          "다른 사람이 나를 검색할 때 쓰는 공개 아이디예요. 영문 소문자로 시작하고 소문자·숫자·밑줄만 3~20자로 써 주세요.",
        displayName: "표시 이름",
        terms: "이용약관과 개인정보 처리방침에 동의합니다",
      },
      handleStatus: {
        checking: "확인하는 중…",
        available: "사용할 수 있는 핸들이에요",
        /** D-047(20일차) — IP당 분당 10회 리밋 초과(blur 시점 미리보기). **20일차 안에 정정**
         *  — 최초 문구는 "이대로 가입을 진행해도 괜찮아요"였으나, BOARD가 그 판단이 되돌릴
         *  수 없는 고아 `auth.users` 계정을 만드는 결함으로 이어짐을 발견해 팀장이 뒤집었다
         *  (`signup.ts` docstring 참고) — 제출 시점에는 이제 실제로 막힌다(아래
         *  `errors.handleCheckRateLimited`). 이 blur 미리보기 문구도 그에 맞춰 "잠시 기다려
         *  달라"로만 말하고 "진행해도 된다"는 약속은 더 이상 하지 않는다. */
        rateLimited: "확인 요청이 많아요. 1분 뒤 다시 확인해 주세요.",
      },
      submit: "가입하기",
      submitPending: "가입하는 중…",
      alreadyHaveAccount: "이미 계정이 있으신가요?",
      goToLogin: "로그인",
      errors: {
        emailInvalid: "올바른 이메일 형식이 아니에요",
        /** FR-001 E1. D-005는 검색 API의 계정 존재 노출만 막았을 뿐, 가입 폼의 중복 안내는
         *  사용성을 위해 그대로 유지한다(requirements.md FR-001 E1 각주). */
        emailTaken: "이미 가입된 이메일입니다",
        passwordTooShort: "비밀번호는 8자 이상이어야 해요",
        /** 21일차 — `passwordsMatch`(lib/rules/auth-credentials.ts) 위반. 어느 쪽이 틀렸는지
         *  말하지 않는다(둘 다 사용자가 방금 친 값이라 "확인란이 다르다"로 충분하고, 원문을
         *  되짚어 주는 안내는 어깨너머 노출 위험만 늘린다). */
        passwordMismatch: "비밀번호가 일치하지 않아요",
        /** `common.handle.invalidFormat`과 같은 개념(핸들 형식, `validateHandleFormat`)이라
         *  6일차 W-2로 공유 승격했다 — `common` 모듈 docstring 참고. */
        handleInvalidFormat: common.handle.invalidFormat,
        /** FR-001 E2 — 핸들 실시간 중복 검사 결과. `common.handle.taken`과 공유(W-2). */
        handleTaken: common.handle.taken,
        /** D-047·I-065 major①(20일차) — 제출 시점에 IP 리밋(분당 10회)에 걸리면 제출 자체를
         *  막는다(`signup.ts` docstring 참고, "리밋에 걸려도 통과시킨다"였던 최초 판단을
         *  뒤집은 결과). `handleTaken`과 문구를 명확히 구분한다 — 이건 "이 핸들은 못 쓴다"가
         *  아니라 "지금은 확인할 수 없으니 곧 다시 시도하라"는 뜻이다. */
        handleCheckRateLimited: "핸들 확인 요청이 많아요. 1분 뒤 다시 시도해 주세요.",
        displayNameRequired: "표시 이름을 입력해 주세요",
        displayNameTooLong: "표시 이름은 30자 이하로 입력해 주세요",
        termsRequired: "계속하려면 약관에 동의해야 해요",
        /** 동시 요청 경쟁 등 예상 밖 실패 — `DataResult`/Supabase Auth 오류를 구분하지 않고
         *  같은 자리(`formError`)에 보여준다. */
        unknown: "가입 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
      },
      /** FR-001 정상 흐름 ⑤~⑥ — 가입 직후(세션 미발급) 보여주는 인증 안내 화면. 커스텀 SMTP
       *  대시보드 설정(D-042)이 끝나기 전까지는 Supabase 내장 발송 한도(시간당 2통·프로젝트
       *  전체)로 지연될 수 있다는 점도 함께 안내한다. */
      pendingVerification: {
        title: "메일함을 확인해 주세요",
        description: "{email}로 인증 메일을 보냈어요. 메일의 링크를 눌러야 가입이 완료돼요.",
        backToLogin: "로그인 화면으로",
        /** FR-001 E4(Task 030, 17일차 — BOARD 교차검증 major 지적으로 추가). */
        resend: {
          submit: "인증 메일 다시 받기",
          submitPending: "재발송하는 중…",
          sent: "인증 메일을 다시 보냈어요.",
          /** 60초 쿨다운(원문 그대로). {seconds}는 `evaluateResendCooldown`의
           *  `retryAfterSeconds`를 그대로 꽂는다. */
          cooldown: "{seconds}초 후에 다시 시도할 수 있어요.",
          /** 시간당 5회 상한(원문 그대로). */
          hourlyLimit: "시간당 재발송 한도를 넘었어요. {minutes}분 뒤에 다시 시도해 주세요.",
          unknown: "재발송 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
        },
      },
    },
    onboarding: {
      title: "온보딩",
      welcome: "{displayName}님, 환영해요!",
      description: "마지막으로 프로필을 확인하고 시작해요.",
      fields: {
        handle: "내 핸들",
        handleLocked: "가입할 때 정한 핸들이에요. 변경은 계정 설정에서 할 수 있어요.",
        displayName: "표시 이름",
        searchOptOut: "핸들 검색 결과에 노출하지 않기",
        searchOptOutDescription:
          "켜면 다른 사람이 핸들로 나를 찾을 수 없어요. 이미 받은 초대는 그대로 유지돼요.",
      },
      submit: "시작하기",
      submitPending: "저장하는 중…",
      errors: {
        displayNameRequired: "표시 이름을 입력해 주세요",
        displayNameTooLong: "표시 이름은 30자 이하로 입력해 주세요",
        /** 세션 만료 등 — FR-002 E3. */
        sessionExpired: "로그인이 만료됐어요. 다시 로그인해 주세요.",
      },
    },
    /**
     * FR-003 비밀번호 재설정(Task 039). `request`(이메일 입력, `/reset-password`)와
     * `confirm`(새 비밀번호 입력, `/reset-password/confirm` — `/auth/confirm`이 토큰 교환에
     * 성공한 뒤 도착하는 화면) 두 단계로 나눈다 — `signup.pendingVerification` 패턴과 같은
     * 이유로 폼과 완료 안내를 같은 화면 안에서 상태로 갈아 끼운다.
     */
    resetPassword: {
      request: {
        title: "비밀번호 재설정",
        description: "가입한 이메일을 입력하면 재설정 링크를 보내드려요.",
        fields: {
          email: "이메일",
        },
        submit: "재설정 메일 보내기",
        submitPending: "보내는 중…",
        /** FR-003 AC1 — 가입 이메일인지 아닌지와 무관하게 항상 이 문구만 보여준다(계정 열거
         *  방지). Supabase Auth의 `resetPasswordForEmail`이 API 레벨에서 이미 이 성질을
         *  보장하므로(미가입 이메일에도 에러 없이 성공), 이 문구는 그 API 계약을 그대로
         *  옮긴 것이다. */
        sent: "메일함을 확인해 주세요. 가입된 이메일이라면 재설정 링크를 보내드렸어요.",
        errors: {
          emailInvalid: "올바른 이메일 형식이 아니에요",
          unknown: "요청 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
        },
        backToLogin: "로그인 화면으로",
      },
      confirm: {
        title: "새 비밀번호 설정",
        description: "새로 쓸 비밀번호를 입력해 주세요.",
        fields: {
          password: "새 비밀번호",
          passwordDescription: "8자 이상으로 입력해 주세요.",
          /** 21일차 — 회원가입(`auth.signup.fields.passwordConfirm`)과 문구가 같지만 공유하지
           *  않는다(§4 "같은 개체라도 도메인 맥락이 다르면 공유하지 않는다"). 이쪽은 "새"
           *  비밀번호라 라벨이 이미 갈라져 있고(`password` 필드가 그 선례다), 나중에 어느 한쪽
           *  어투만 다듬을 수 있어야 한다. */
          passwordConfirm: "새 비밀번호 확인",
          passwordConfirmDescription: "확인을 위해 같은 비밀번호를 한 번 더 입력해 주세요.",
        },
        submit: "비밀번호 변경",
        submitPending: "변경하는 중…",
        /** 정상 흐름 ⑤~⑥ — 변경 직후 이 브라우저 세션도 함께 종료하고 로그인 화면으로
         *  보낸다(confirmPasswordReset 문서 참고). */
        successRedirectNotice: "비밀번호를 변경했어요. 새 비밀번호로 다시 로그인해 주세요.",
        errors: {
          passwordTooShort: "비밀번호는 8자 이상이어야 해요",
          /** 21일차 — `passwordsMatch` 위반. 회원가입과 같은 이유로 어느 쪽이 틀렸는지는
           *  말하지 않는다(`auth.signup.errors.passwordMismatch` 주석 참고). */
          passwordMismatch: "비밀번호가 일치하지 않아요",
          /** FR-003 E2 — 링크 만료(1시간) 또는 이미 사용된 링크(E3). Supabase가 두 경우를
           *  같은 오류 코드로 구분하지 않아(`session_not_found`) 문구도 하나로 합친다. */
          linkExpired: "재설정 링크가 만료됐거나 이미 사용됐어요. 다시 요청해 주세요.",
          unknown: "비밀번호 변경 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
        },
        requestNewLink: "재설정 다시 요청하기",
      },
    },
    /**
     * `/auth/confirm`(PKCE 토큰 교환)이 실패했을 때 도달하는 화면 — 링크 자체가 깨졌거나
     * 만료된 경우다. 가입 확인·비밀번호 재설정 양쪽에서 공유한다(라우트 자체가 공유되므로).
     */
    confirmError: {
      title: "링크를 확인할 수 없어요",
      description: "링크가 만료됐거나 이미 사용된 것 같아요.",
      backToLogin: "로그인 화면으로",
    },
  },

  /**
   * Task 014 — 전역 오류·경계 화면(`error.tsx`·`not-found.tsx`·`RouteErrorBoundary`). 키는
   * `src/lib/data/contracts.ts`의 `DataErrorCode`(`not_found`·`conflict`·`validation_failed`·
   * `forbidden`) + 그 계약 밖의 `network`(세션 조회 실패, `auth-session.ts`)·`capacityFull`
   * (정원 마감, `meetup.types.ts`의 `AttendanceJoinResult.reason: "full"`)을 합친 어휘와
   * 1:1 대응한다 — 새 오류 분류 체계를 만들지 않고 기존 도메인 오류 타입을 그대로 옮겼다.
   *
   * **`deactivated`(19일차, I-060 수정)**: `AuthSession`의 `status:"error"` 판별 유니온에서
   * `reason:"deactivated"`(Task 039)만 가리키는 문구다 — `forbidden`(게스트 취급, 복구
   * 불가)·`network`(진짜 네트워크 실패)와 다른 세 번째 원인이라 별도 키로 뺐다.
   * `HeaderNav.tsx`가 `reason`별 완전 분기(exhaustive switch)로 이 키를 쓴다.
   */
  error: {
    notFound: {
      title: "페이지를 찾을 수 없어요",
      description: "주소가 바뀌었거나 삭제된 페이지예요",
    },
    forbidden: {
      title: "접근 권한이 없어요",
      description: "이 크루의 크루원만 볼 수 있어요",
    },
    deactivated: {
      title: "계정이 탈퇴 처리 중이에요",
      description: "로그인하면 남은 유예 기간 동안 계정을 복구할 수 있어요",
    },
    network: {
      title: "연결에 문제가 있어요",
      description: "네트워크 상태를 확인하고 다시 시도해 주세요",
    },
    /** 19일차, I-069 완화 — `error.tsx`의 `classifyError`가 원인을 알 수 없을 때(프로덕션에서는
     *  항상 이 경로다) 쓰는 중립 문구. `network`와 달리 원인을 단정하지 않는다 — 실제로는
     *  권한 없음·정원 마감 등 다른 이유일 수 있는데 "네트워크 문제"라고 잘못 안내하지 않기
     *  위해서다. `docs/ISSUES.md` I-069 참고. */
    unknown: {
      title: "문제가 발생했어요",
      description: "잠시 후 다시 시도해 주세요. 계속되면 새로고침해 주세요.",
    },
    conflict: {
      title: "다른 사용자가 먼저 처리했어요",
      description: "최신 상태로 새로고침해 주세요",
    },
    validationFailed: {
      title: "입력한 내용을 확인해 주세요",
      description: "형식에 맞지 않는 값이 있어요",
    },
    capacityFull: {
      title: "정원이 찼어요",
      description: "이미 인원이 다 찼어요",
    },
    /** 프로덕션에서는 원본 오류 메시지 대신 이 코드만 노출한다(NFR-014) — 서버 내부 정보를
     *  사용자에게 드러내지 않으면서도 문의 시 로그와 대조할 수 있게 한다. */
    digest: "오류 코드: {digest}",
  },

  /**
   * FR-080 신고(Task 042A). `ReportDialog`(범용 — post/comment/chat_message/profile 4종
   * 어디에서든 `targetType`·`targetId`만 넘기면 재사용된다)가 쓴다. `errors`의 snake_case
   * 키는 `lib/rules/report-eligibility.ts`의 `ReportIneligibleReason`·`create_report` SQL
   * RPC의 `reason_code`와 그대로 맞췄다(`invite-eligibility.ts` 관례와 동일).
   */
  report: {
    trigger: "신고",
    dialogTitle: "신고하기",
    dialogDescription: "신고 사유를 입력해 주세요. 같은 대상을 다시 신고하면 기존 신고에 합쳐져요.",
    reasonLabel: "신고 사유",
    reasonPlaceholder: "무엇이 문제인지 알려주세요",
    submit: "신고 접수",
    submitPending: "접수하는 중…",
    cancel: "취소",
    sentNotice: "신고가 접수됐어요",
    mergedNotice: "이미 신고한 대상이에요. 사유를 갱신했어요.",
    errors: {
      notAllowed: "신고 권한이 없어요",
      reason_required: "신고 사유를 입력해 주세요",
      cannot_report_self: "자기 자신은 신고할 수 없어요",
      validation_failed: "신고를 접수하지 못했어요. 다시 시도해 주세요.",
      failed: "신고를 접수하지 못했어요. 다시 시도해 주세요.",
    },
  },

  /**
   * FR-081 사용자 차단(Task 042A). `BlockButton`(트리거)·`BlockedUsersList`(설정 페이지
   * 차단 관리 목록) 둘 다 이 사전을 쓴다.
   */
  block: {
    trigger: "차단",
    dialogTitle: "차단하기",
    dialogDescription: "차단하면 이 사용자는 나를 크루에 초대할 수 없고, 이 사용자의 콘텐츠는 접혀서 보여요.",
    submit: "차단",
    submitPending: "차단하는 중…",
    cancel: "취소",
    blockedNotice: "차단했어요",
    alreadyBlockedNotice: "이미 차단한 사용자예요",
    errors: {
      notAllowed: "차단 권한이 없어요",
      cannot_block_self: "자기 자신은 차단할 수 없어요",
      validation_failed: "차단하지 못했어요. 다시 시도해 주세요.",
      failed: "차단하지 못했어요. 다시 시도해 주세요.",
    },
    /** 계정 설정 "차단 관리" 섹션(`BlockedUsersListContainer`). FR-081 AC에 명시된 항목은
     *  아니지만 해제 경로 없이 차단만 있으면 실수를 되돌릴 수 없어 함께 만들었다. */
    manage: {
      title: "차단한 사용자",
      description: "차단한 사용자는 나를 크루에 초대할 수 없어요",
      empty: "차단한 사용자가 없어요",
      unblockButton: "차단 해제",
      unblockPending: "해제하는 중…",
      errors: {
        removeFailed: "차단을 해제하지 못했어요. 다시 시도해 주세요.",
      },
    },
  },

  /** FR-081 AC1 — 차단한 사용자의 콘텐츠 접힘 표시(`BlockedContentNotice`). 크루원 목록·게시판·
   *  채팅·댓글 네 곳 모두 배선됐다(I-072 해소, `lib/rules/block-content-visibility.ts` docstring
   *  참고). */
  moderation: {
    blockedContent: {
      notice: "차단한 사용자의 콘텐츠예요",
      expandButton: "펼치기",
      collapseButton: "접기",
    },
  },

  /** FR-082 관리자 콘솔(Task 042B, `/admin`). SC-21. */
  admin: {
    reports: {
      title: "신고 관리",
      description:
        "접수된 신고를 확인하고 기각·콘텐츠 삭제·계정 제재 중 하나로 처리해요. 처리 결과는 감사 로그에 남아요.",
      /** 상태 탭 레이블(I-077, 26일차). `statusLabel`(카드 배지)과 어휘가 겹칠 수 있지만
       *  용도(탭 내비 vs 카드 배지)가 달라 별도 키로 둔다 — 나중에 문구가 갈라져도 서로
       *  건드리지 않는다. */
      statusFilter: {
        all: "전체",
        pending: "대기 중",
        resolved: "처리됨",
        dismissed: "기각됨",
      },
      statusFilterLabel: "상태별 보기",
      /** 빈 상태 문구도 필터별로 다르다(I-077) — 필터를 붙이면 "0건"이 정상 경로가 되므로
       *  "대기 중인 신고가 없어요" 한 문구로는 처리/기각 탭에서 의미가 어긋난다. */
      empty: {
        all: {
          title: "신고 내역이 없어요",
          description: "접수된 신고가 아직 없어요",
        },
        pending: {
          title: "대기 중인 신고가 없어요",
          description: "새 신고가 접수되면 여기 표시돼요",
        },
        resolved: {
          title: "처리한 신고가 없어요",
          description: "콘텐츠 삭제·계정 제재로 처리한 신고가 여기 쌓여요",
        },
        dismissed: {
          title: "기각한 신고가 없어요",
          description: "근거 없다고 판단해 기각한 신고가 여기 쌓여요",
        },
      },
      columns: {
        reporter: "신고자",
        target: "대상",
        reason: "사유",
        createdAt: "접수일",
        actions: "처리",
      },
      targetTypeLabel: {
        post: "게시글",
        comment: "댓글",
        chat_message: "채팅 메시지",
        profile: "프로필",
      },
      targetRemovedBadge: "이미 삭제됨",
      targetMissingBadge: "대상을 찾을 수 없음",
      statusLabel: {
        pending: "대기",
        resolved: "처리됨",
        dismissed: "기각됨",
      },
      actionLabel: {
        dismiss: "기각",
        remove_content: "콘텐츠 삭제",
        suspend_account: "계정 제재",
      },
      confirm: {
        dismiss: {
          title: "이 신고를 기각할까요?",
          description: "신고가 근거 없다고 판단되면 기각해요. 되돌릴 수 없어요.",
        },
        remove_content: {
          title: "이 콘텐츠를 삭제할까요?",
          description: "작성자에게는 삭제된 것으로 표시되고, 신고는 처리됨으로 바뀌어요. 되돌릴 수 없어요.",
        },
        suspend_account: {
          title: "이 계정을 제재할까요?",
          description: "계정이 제재 상태로 전환돼 로그인 후 서비스 이용이 제한돼요. 되돌릴 수 없어요.",
        },
        submit: "확인",
        cancel: "취소",
      },
      submitPending: "처리하는 중…",
      successNotice: {
        resolved: "처리했어요",
        dismissed: "기각했어요",
      },
      errors: {
        notAllowed: "관리자 권한이 없어요",
        failed: "처리하지 못했어요. 다시 시도해 주세요.",
        forbidden: "관리자 권한이 없어요",
        invalid_action: "알 수 없는 처리예요. 다시 시도해 주세요.",
        not_found: "신고를 찾을 수 없어요",
        already_handled: "이미 처리된 신고예요. 새로고침해 주세요.",
        cannot_remove_profile_content: "계정 신고는 콘텐츠 삭제를 적용할 수 없어요. 계정 제재를 사용해 주세요.",
        target_not_found: "신고 대상을 찾을 수 없어요. 이미 삭제됐을 수 있어요.",
        target_already_removed: "이미 삭제된 콘텐츠예요.",
        account_not_suspendable: "이미 제재됐거나 활성 상태가 아닌 계정이에요.",
        unhandled_action: "처리하지 못했어요. 다시 시도해 주세요.",
      },
    },
  },
} as const;
