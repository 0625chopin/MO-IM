import { Loader2Icon } from "lucide-react";

import { ArchivedCrewBanner } from "@/components/crews/ArchivedCrewBanner";
import type { CrewCardViewModel } from "@/components/crews/crew-explore-view-models";
import type {
  JoinRequestRowViewModel,
  MemberRowViewModel,
} from "@/components/crews/crew-member-view-models";
import { CrewCreateForm } from "@/components/crews/CrewCreateForm";
import { CrewGrid } from "@/components/crews/CrewGrid";
import { CrewGridSkeleton } from "@/components/crews/CrewGridSkeleton";
import { CrewHome } from "@/components/crews/CrewHome";
import { CrewHomeSkeleton } from "@/components/crews/CrewHomeSkeleton";
import { CrewInfoForm } from "@/components/crews/CrewInfoForm";
import { CrewIntroPreview } from "@/components/crews/CrewIntroPreview";
import { CrewMembersSkeleton } from "@/components/crews/CrewMembersSkeleton";
import { CrewSearchBar } from "@/components/crews/CrewSearchBar";
import { CrewSettingsSkeleton } from "@/components/crews/CrewSettingsSkeleton";
import { CrewVisibilityForm } from "@/components/crews/CrewVisibilityForm";
import { DisbandCrewForm } from "@/components/crews/DisbandCrewForm";
import { InviteMemberDialog } from "@/components/crews/InviteMemberDialog";
import { JoinRequestButton } from "@/components/crews/JoinRequestButton";
import { JoinRequestPanel } from "@/components/crews/JoinRequestPanel";
import { MemberList } from "@/components/crews/MemberList";
import { PrivateCrewNotice } from "@/components/crews/PrivateCrewNotice";
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { CrewExploreErrorStatePreview } from "@/components/sample/sections/CrewExploreErrorStatePreview";
import { defineSection } from "@/components/sample/showcase-types";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";

/** `CrewGrid`·`CrewCard` 데모용 고정 데이터 — 실제 `CrewExploreContainer`가 `fetchCrewCardsPage`로
 *  만드는 조인 결과 모양을 손으로 채운 것이다(`board.tsx`의 `SAMPLE_POSTS`와 같은 패턴). */
const SAMPLE_CREW_CARDS: CrewCardViewModel[] = [
  {
    id: "crew-1",
    name: "주말 러닝 크루",
    description: "매주 토요일 아침 한강에서 함께 뜁니다.",
    category: "운동",
    colorIndex: 0,
    memberCount: 12,
    isMember: true,
    // FR-055 AC1(Task 044) — 가입된 크루 카드에만 읽지 않은 메시지 배지가 뜬다.
    unreadMessageCount: 5,
  },
  {
    id: "crew-3",
    name: "홈카페 취향 공유",
    description: "직접 내린 커피와 홈카페 도구를 공유합니다.",
    category: "취미",
    colorIndex: 3,
    memberCount: 4,
    isMember: false,
    unreadMessageCount: 0,
  },
  {
    id: "crew-7",
    name: "IT 커리어 스터디",
    description: "이직·커리어 고민을 함께 나누는 스터디입니다.",
    category: "스터디",
    colorIndex: 7,
    memberCount: 55,
    isMember: false,
    unreadMessageCount: 0,
  },
];

/** `MemberList` 데모용 고정 데이터(Task 017A) — 오너가 보는 기본 목록. 오너(본인, 탈퇴 불가
 *  안내)·임원 2명·일반 크루원 1명으로 역할 정렬(오너 > 임원 > 일반)을 보여준다. */
const SAMPLE_MEMBER_ROWS: MemberRowViewModel[] = [
  {
    profileId: "profile-1",
    displayName: "서지훈",
    handle: "seo_runs",
    avatarUrl: null,
    role: "owner",
    isSelf: true,
    canAppoint: false,
    canLeave: false,
    leaveBlockedReason: strings.crew.members.leave.errors.ownerMustTransferOrDisband,
    canTransferOwnership: false,
    canRemove: false,
    isBlockedByViewer: false,
    canReportOrBlock: false,
  },
  {
    profileId: "profile-2",
    displayName: "김유나",
    handle: "yuna_book",
    avatarUrl: null,
    role: "staff",
    isSelf: false,
    canAppoint: true,
    canLeave: false,
    leaveBlockedReason: null,
    canTransferOwnership: true,
    canRemove: true,
    isBlockedByViewer: false,
    canReportOrBlock: true,
  },
  {
    profileId: "profile-3",
    displayName: "박민준",
    handle: "minjun",
    avatarUrl: null,
    role: "member",
    isSelf: false,
    canAppoint: true,
    canLeave: false,
    leaveBlockedReason: null,
    canTransferOwnership: true,
    canRemove: true,
    isBlockedByViewer: false,
    canReportOrBlock: true,
  },
];

/** `MemberList` "빈" 패널 — 갓 만든 크루, 오너뿐이라 임명·강퇴 대상 자체가 없다. */
const SAMPLE_MEMBER_ROWS_OWNER_ONLY: MemberRowViewModel[] = [SAMPLE_MEMBER_ROWS[0]];

/** `JoinRequestPanel` 데모용 고정 데이터(Task 017A, I-040). `history`가 승인·반려·철회 셋을
 *  모두 담아 "반려됨"과 "철회함"이 다른 배지로 구분되는 것을 "처리 내역" 탭에서 바로 보여준다. */
const SAMPLE_PENDING_REQUESTS: JoinRequestRowViewModel[] = [
  {
    id: "join-request-1",
    requesterDisplayName: "박민준",
    requesterHandle: "minjun",
    requesterAvatarUrl: null,
    message: "이번 주 토요일 러닝 같이 하고 싶어요!",
    status: "pending",
  },
  {
    id: "join-request-2",
    requesterDisplayName: "김유나",
    requesterHandle: "yuna_book",
    requesterAvatarUrl: null,
    message: null,
    status: "pending",
  },
];

const SAMPLE_HISTORY_REQUESTS: JoinRequestRowViewModel[] = [
  {
    id: "join-request-3",
    requesterDisplayName: "이서연",
    requesterHandle: "seoyeon",
    requesterAvatarUrl: null,
    message: "가입하고 싶어요",
    status: "approved",
  },
  {
    id: "join-request-4",
    requesterDisplayName: "최도현",
    requesterHandle: "dohyun",
    requesterAvatarUrl: null,
    message: null,
    status: "rejected",
  },
  {
    id: "join-request-5",
    requesterDisplayName: "정하늘",
    requesterHandle: "haneul",
    requesterAvatarUrl: null,
    message: "지나가다 관심 생겨서요",
    // I-040 — 신청자 본인이 철회한 건. "반려됨"과 다른 배지("철회함")로 렌더된다.
    status: "withdrawn",
  },
];

/**
 * SC-07~09, SC-14 크루 탐색·개설·크루 홈·멤버 관리(F005·F006·F008·F009·F010·F011~F015·F032,
 * Task 016A·016B·017A). 실제 라우트는
 * `/crews`·`/crews/new`·`/crews/[crewId]` — 개설 폼은 실제 컴포넌트를 그대로 등록했고(부작용은
 * 세션이 있어야 발동하는 리다이렉트뿐이라 `/sample`의 게스트 세션에서는 `sessionExpired` 폼
 * 오류로 안전하게 막힌다), 크루 홈은 `CrewHomeContainer`(서버 컴포넌트, 실제 크루 조회가 필요)
 * 대신 그 아래 세 표현 컴포넌트(`CrewHome`·`CrewIntroPreview`·`PrivateCrewNotice`)를
 * 정적 props로 직접 렌더한다 — `board.tsx`의 `BoardList` 정적 데모와 같은 이유다.
 *
 * **`JoinRequestButton`은 `status` prop(여기서는 `state.kind`) 하나로 7가지 상태를 표현하는
 * 구조라 `ProfileCard`와 같은 패턴** — 정적 마크업을 다시 짜지 않고 실제 컴포넌트를 여러 번
 * 렌더한다. 4상태 토글에 다 담기지 않는 나머지 상태(pending·invited)는 `default` 패널 아래
 * 정적 예시로 함께 둔다(`account.tsx`의 `UserSearchResult` "찾음" 정적 예시와 같은 방식).
 *
 * **`CrewSearchBar`·`CrewGrid`(Task 016A)도 실제 컴포넌트를 그대로 등록한다** — 무한 스크롤이
 * `loadMoreCrewsAction`(읽기 전용 Server Action)을 실제로 호출하므로 `/sample`에서 스크롤해도
 * 안전하다(쓰기가 없다). `CrewCard`는 별도 항목을 만들지 않았다 — `CrewGrid` 자신이 카드 3장을
 * 렌더해 보여주므로 단독 항목이 중복이라고 판단했다(`BoardListItem`이 `BoardList` 항목 안에서만
 * 보이는 것과 같은 이유).
 *
 * **`MemberList`·`InviteMemberDialog`·`JoinRequestPanel`(Task 017A)** — 실제 라우트는
 * `/crews/[crewId]/members`. `MemberList`의 "임원 임명"·"탈퇴" 버튼과 `InviteMemberDialog`의
 * "초대 보내기"는 실제 Server Action을 그대로 호출한다 — `/sample`은 게스트 세션이라 눌러도
 * `sessionExpired` 폼 오류로 안전하게 막힌다(`CrewCreateForm`과 같은 근거). `JoinRequestPanel`의
 * "오류" 패널은 버튼 클릭이 아니라 `ErrorState` 원자로 FR-023 E1(동시성 — 다른 임원이 먼저
 * 처리)을 정적으로 재현한다 — `useActionState`의 폼 오류는 실제 제출 후에만 생기는 값이라
 * `/sample`이 그 자리를 미리 채울 수 없기 때문이다(`CrewExploreErrorStatePreview`와 같은 이유,
 * 다만 이 경우는 클로저가 필요 없어 별도 클라이언트 컴포넌트 파일을 만들지 않았다). "처리 내역"
 * 탭은 I-040이 요구하는 "반려됨"·"철회함" 구분을 승인(`approved`)과 나란히 보여준다.
 */
export const crewsSection = defineSection({
  id: "crews",
  label: "크루 탐색·개설·홈·멤버 관리·설정",
  title: "크루 탐색 · 크루 개설 · 크루 홈 · 멤버 관리 · 크루 설정",
  description:
    "FR-010·011·012·014·020·022·023·024·026(D-002·D-005·D-007·D-008·D-014·D-016·D-017). 실제 라우트는 /crews · /crews/new · /crews/[crewId] · /crews/[crewId]/members · /crews/[crewId]/settings — 크루 탐색은 검색바·카테고리 필터·카드 그리드·무한 스크롤·가입됨 배지(CrewSearchBar·CrewGrid·CrewCard), 크루 홈은 public/private × 소속/비소속 조합 중 실제로 다른 모습이 필요한 세 갈래(CrewHome·CrewIntroPreview·PrivateCrewNotice)만 표현 컴포넌트로, 멤버 관리는 역할 정렬 목록·초대 다이얼로그·가입 신청 승인/반려 탭(MemberList·InviteMemberDialog·JoinRequestPanel), 크루 설정은 정보 수정·공개 범위 전환(CrewInfoForm·CrewVisibilityForm, Task 017B)으로 나눴습니다.",
  items: [
    {
      name: "CrewCreateForm",
      note: "실제 컴포넌트입니다. /sample은 게스트 세션이라 제출하면 '로그인이 만료됐어요' 폼 오류가 뜹니다 — checkPermission(crew:create)이 실제로 작동한다는 증거입니다(계정 섹션의 UserSearchField와 같은 패턴).",
      panels: {
        default: (
          <PreviewFrame height={620}>
            <div className="mx-auto w-full max-w-md p-4">
              <CrewCreateForm />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={120}>
            <div className="mx-auto flex w-full max-w-md justify-center p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.crew.create.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "JoinRequestButton",
      note: "state prop 하나로 상태 기계 전체(kind: member/private_locked/guest_prompt/invited/pending/blocked/requestable)를 표현합니다(lib/rules/join-request-button-state.ts). default 패널의 '가입 신청' 버튼은 실제로 열리는 다이얼로그입니다 — 제출은 게스트 세션이라 오류로 막힙니다.",
      panels: {
        default: (
          <PreviewFrame height={280}>
            <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-4">
              <JoinRequestButton crewId="crew-1" state={{ kind: "requestable" }} />
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">정적 예시 — 대기 중 · 초대받음</p>
                <JoinRequestButton crewId="crew-1" state={{ kind: "pending" }} />
                <JoinRequestButton crewId="crew-1" state={{ kind: "invited" }} />
              </div>
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={100}>
            <div className="mx-auto w-full max-w-sm p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.crew.home.join.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={100}>
            <div className="mx-auto w-full max-w-sm p-4">
              <JoinRequestButton crewId="crew-1" state={{ kind: "guest_prompt" }} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={100}>
            <div className="mx-auto w-full max-w-sm p-4">
              <JoinRequestButton crewId="crew-1" state={{ kind: "blocked" }} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "CrewHome (크루원 화면)",
      note: "public/private 4분기 중 '소속' 두 칸은 공개 범위와 무관하게 이 화면 하나로 합쳐집니다(D-007). default는 오너(설정 탭 노출), empty는 일반 크루원(설정 탭 없음, 크루원 1명)입니다.",
      panels: {
        default: (
          <PreviewFrame height={260}>
            <CrewHome
              crewId="crew-1"
              name="주말 러닝 크루"
              description="매주 토요일 아침 한강에서 함께 뜁니다."
              category="운동"
              colorIndex={0}
              visibility="public"
              memberCount={12}
              canManageSettings
            />
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <CrewHomeSkeleton />
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={220}>
            <CrewHome
              crewId="crew-1"
              name="갓 만든 크루"
              description="방금 만들어져서 아직 크루원이 오너뿐이에요."
              category="취미"
              colorIndex={3}
              visibility="private"
              memberCount={1}
              canManageSettings={false}
            />
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={280}>
            <RouteErrorBoundary kind="not_found" />
          </PreviewFrame>
        ),
      },
    },
    {
      name: "CrewIntroPreview (public, 비소속)",
      note: "D-007 — 소개까지만 보이고 게시판·채팅·멤버 목록 링크는 이 컴포넌트 자체에 없습니다.",
      panels: {
        default: (
          <PreviewFrame height={260}>
            <CrewIntroPreview
              crewId="crew-1"
              name="주말 러닝 크루"
              description="매주 토요일 아침 한강에서 함께 뜁니다."
              category="운동"
              colorIndex={0}
              memberCount={12}
              joinState={{ kind: "requestable" }}
            />
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <CrewHomeSkeleton />
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={260}>
            <CrewIntroPreview
              crewId="crew-1"
              name="갓 만든 크루"
              description="방금 만들어진 크루예요."
              category="문화"
              colorIndex={6}
              memberCount={1}
              joinState={{ kind: "guest_prompt" }}
            />
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={260}>
            <CrewIntroPreview
              crewId="crew-1"
              name="주말 러닝 크루"
              description="매주 토요일 아침 한강에서 함께 뜁니다."
              category="운동"
              colorIndex={0}
              memberCount={12}
              joinState={{ kind: "blocked" }}
            />
          </PreviewFrame>
        ),
      },
    },
    {
      name: "PrivateCrewNotice (private, 비소속)",
      note: "D-007·FR-012 AC2 — 크루명 + 안내뿐입니다. 자체 조회가 없는 정적 표현 컴포넌트라 로딩·빈 상태가 따로 없습니다(이 컴포넌트를 감싸는 CrewHomeContainer의 로딩·오류는 위 CrewHome 항목이 보여줍니다).",
      panels: {
        default: (
          <PreviewFrame height={260}>
            <PrivateCrewNotice crewName="심야 북클럽" />
          </PreviewFrame>
        ),
      },
    },
    {
      name: "크루 탐색 — 검색바 (CrewSearchBar)",
      note: "실제 컴포넌트입니다(FR-014, Task 016A). 카테고리 칩은 클릭 즉시, 검색어는 제출 시 /crews로 실제 이동합니다(CrewCard의 Link와 같은 이유로 실제 네비게이션을 막지 않았습니다). '오류' 패널은 검색어 1자일 때의 최소 길이 안내(E2)입니다 — crew-search-query.ts가 판정합니다.",
      panels: {
        default: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <CrewSearchBar initialQuery="" initialCategory={null} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <CrewSearchBar initialQuery="가" initialCategory={null} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "크루 탐색 — 결과 그리드 (CrewGrid)",
      note: "실제 컴포넌트입니다. 카드 3장(가입됨 배지가 있는 것 하나 포함) — 읽기 전용 무한 스크롤이라 실수로 스크롤해도 공용 Mock 스토어에 영향이 없습니다. '빈' 패널은 결과 0건(E1, 카테고리 둘러보기 유도), '오류'는 무한 스크롤 다음 페이지 조회 실패(AC3, D-030 ③)입니다.",
      panels: {
        default: (
          <PreviewFrame height={420}>
            <div className="p-4">
              <CrewGrid
                initialItems={SAMPLE_CREW_CARDS}
                initialCursor={null}
                hasActiveFilter={false}
              />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={360}>
            <div className="p-4">
              <CrewGridSkeleton />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={220}>
            <div className="p-4">
              <CrewGrid initialItems={[]} initialCursor={null} category="문화" hasActiveFilter />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={160}>
            <div className="p-4">
              <CrewExploreErrorStatePreview />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "멤버 관리 — 역할 정렬 목록 (MemberList)",
      note: "실제 컴포넌트입니다(FR-015·FR-024·FR-025·FR-026·FR-027, D-002·D-003, Task 017A·040). 정렬(오너 > 임원 > 일반)·권한 판정은 CrewMembersContainer가 끝낸 값을 props로만 받습니다. 오너(본인) 행은 탈퇴 버튼 대신 안내 문구가 뜨고, 임원·일반 행은 '임원으로 임명'/'임원 해임'·'오너로 임명'(FR-025, 크루명 재입력 확인)·'강퇴'(FR-027, 사유 선택 입력) 버튼이 실제 Server Action을 호출합니다 — 게스트 세션이라 눌러도 세션 만료 오류로 막힙니다.",
      panels: {
        default: (
          <PreviewFrame height={340}>
            <div className="p-4">
              <MemberList crewId="crew-1" crewName="주말 러닝 크루" members={SAMPLE_MEMBER_ROWS} />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={220}>
            <CrewMembersSkeleton />
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <MemberList crewId="crew-1" crewName="주말 러닝 크루" members={SAMPLE_MEMBER_ROWS_OWNER_ONLY} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={260}>
            <RouteErrorBoundary kind="forbidden" />
          </PreviewFrame>
        ),
      },
    },
    {
      name: "멤버 관리 — 크루원 초대 (InviteMemberDialog)",
      note: "실제 컴포넌트입니다(FR-020, Task 017A). 검색은 UserSearchField(계정 설정과 공유, Task 015B)를 그대로 재사용하고 결과 카드 footer에 '초대 보내기' 버튼을 끼워 넣습니다. /sample은 게스트 세션이라 제출하면 '로그인이 만료됐어요' 폼 오류가 뜹니다 — checkPermission(crew:invite_member)이 실제로 작동한다는 증거입니다(CrewCreateForm과 같은 패턴). 빈·오류 패널은 의도적으로 비웠습니다 — 제출 오류는 useActionState 내부 상태라 정적 prop으로 미리 주입할 수 없고(CrewCreateForm 전례와 동일), '검색 결과 없음'은 이 컴포넌트가 아니라 UserSearchField 자신의 상태라 account.tsx에 이미 등록돼 있어 여기서 중복 등록하지 않습니다.",
      panels: {
        default: (
          <PreviewFrame height={200}>
            <div className="mx-auto w-full max-w-sm p-4">
              <InviteMemberDialog crewId="crew-1" />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={100}>
            <div className="mx-auto w-full max-w-sm p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.crew.members.invite.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "멤버 관리 — 가입 신청 승인/반려 (JoinRequestPanel)",
      note: "실제 컴포넌트입니다(FR-023, D-002, Task 017A, I-040 해소). '처리 내역' 탭에서 승인(approved)·반려(rejected)·철회(withdrawn) 세 상태를 서로 다른 배지로 보여줍니다 — I-040이 요구하는 대로 신청자 본인이 철회한 건을 오너·임원이 반려한 건과 구분합니다. '대기 중' 탭의 승인·반려 버튼은 실제 decideJoinRequestAction을 호출합니다(게스트 세션이라 세션 만료 오류로 막힙니다).",
      panels: {
        default: (
          <PreviewFrame height={420}>
            <div className="p-4">
              <JoinRequestPanel
                crewId="crew-1"
                pending={SAMPLE_PENDING_REQUESTS}
                history={SAMPLE_HISTORY_REQUESTS}
              />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={220}>
            <CrewMembersSkeleton />
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={200}>
            <div className="p-4">
              <JoinRequestPanel crewId="crew-1" pending={[]} history={[]} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <ErrorState title={strings.crew.members.requests.errors.alreadyDecided} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "크루 설정 — 정보 수정 (CrewInfoForm)",
      note: "실제 컴포넌트입니다(FR-011, D-016, Task 017B). 이름·소개·카테고리는 기존 값이 채워진 상태로 시작하고, 캘린더 색상은 팔레트 12색 라디오 그룹입니다 — 자유 색상 입력이 아니라 이미 검증된 값 중에서만 고를 수 있습니다. /sample은 게스트 세션이라 제출하면 '로그인이 만료됐어요' 폼 오류가 뜹니다(CrewCreateForm과 같은 근거). 빈·오류 패널은 의도적으로 비웠습니다 — 제출 오류는 useActionState 내부 상태라 정적 prop으로 미리 주입할 수 없습니다(CrewCreateForm 전례와 동일).",
      panels: {
        default: (
          <PreviewFrame height={640}>
            <div className="mx-auto w-full max-w-md p-4">
              <CrewInfoForm
                crewId="crew-1"
                initialName="주말 러닝 크루"
                initialDescription="매주 토요일 아침 한강에서 함께 뜁니다."
                initialCategory="운동"
                initialColorKey={0}
              />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={120}>
            <div className="mx-auto flex w-full max-w-md justify-center p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.crew.settings.info.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "크루 설정 — 공개 범위 (CrewVisibilityForm)",
      note: "실제 컴포넌트입니다(FR-012, D-007·D-002, Task 017B). CrewSettingsContainer가 crew:update_visibility(오너 전용)를 통과한 사람에게만 이 폼을 렌더합니다 — CrewInfoForm과 권한 등급이 달라 별도 폼·별도 액션으로 분리했습니다. 게스트 세션이라 제출하면 세션 만료 오류로 막힙니다.",
      panels: {
        default: (
          <PreviewFrame height={260}>
            <div className="mx-auto w-full max-w-md p-4">
              <CrewVisibilityForm crewId="crew-1" initialVisibility="public" />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <CrewSettingsSkeleton />
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={260}>
            <RouteErrorBoundary kind="forbidden" />
          </PreviewFrame>
        ),
      },
    },
    {
      name: "크루 설정 — 크루 해산 (DisbandCrewForm)",
      note: "실제 컴포넌트입니다(FR-013, D-009 후반, Task 040). CrewSettingsContainer가 crew:disband(오너 전용)를 통과한 사람에게만 렌더합니다. 다이얼로그를 열면 크루명 재입력 확인 필드가 있습니다 — 되돌릴 수 없는 조작(진행 중 투표 전부 취소·미래 Meetup 전부 취소·채팅 로그 즉시 파기)이라 오클릭을 막는 용도이며, 실제 강제 경계는 SQL(public.disband_crew RPC)입니다. 게스트 세션이라 제출하면 세션 만료 오류로 막힙니다. '오류' 패널은 이름 불일치 도메인 오류(D-030 ③)를 보여줍니다.",
      panels: {
        default: (
          <PreviewFrame height={220}>
            <div className="mx-auto w-full max-w-md p-4">
              <DisbandCrewForm crewId="crew-1" crewName="주말 러닝 크루" />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <CrewSettingsSkeleton />
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={160}>
            <div className="p-4">
              <ErrorState title={strings.crew.settings.disband.errors.nameMismatch} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "해산된 크루 안내 (ArchivedCrewBanner)",
      note: "FR-013 AC2, Task 040 UI/게이트 절반(BOARD, 19일차, I-066·I-067 해소). `(app)/crews/[crewId]/layout.tsx`가 `crews.status==='archived'`일 때 하위 화면 공통 상단에 띄우는 실제 컴포넌트입니다 — 게시판·채팅 등 어디서나 같은 배너가 보입니다. 열람은 그대로 되고(과거 게시글·채팅 기록), 쓰기만 막힙니다 — 게시판의 '새 글쓰기' 버튼은 `BoardListContainer`의 canWrite가 crews.status까지 확인해 숨고(위 '멤버 관리' 근처가 아니라 board.tsx 섹션의 BoardList 항목 참고), 채팅 입력창은 `Composer`의 canSend가 false가 되어 렌더 자체가 사라집니다(chat.tsx 섹션 참고). 실제 강제 경계는 CORE가 posts·chat_messages INSERT RLS에 추가하는 crews.status='active' 조건입니다 — 이 배너·버튼 숨김은 UX 안내일 뿐입니다.",
      content: (
        <PreviewFrame height={140}>
          <ArchivedCrewBanner />
        </PreviewFrame>
      ),
    },
  ],
});
