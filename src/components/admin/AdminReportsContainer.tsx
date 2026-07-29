import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { listPendingReports } from "@/lib/data";

import { AdminReportQueue } from "./AdminReportQueue";

/**
 * FR-082 AC1 관리자 콘솔 대기열 컨테이너(Task 042B, D-030 ① — 조회를 소유하고 표현
 * 컴포넌트에 props로 내려준다). `/admin` 페이지가 조립한다.
 *
 * **25일차(I-115) — 이 컨테이너 자신도 `isAuthenticated`·`isSystemAdmin` 조기 반환을 한다.**
 * 예전 docstring은 "세션 확인은 이 컨테이너가 하지 않는다"고 적었지만 그건 Next 16이 레이아웃과
 * 페이지를 병렬 렌더한다는 사실(I-095가 정리한 것과 같은 구조,
 * `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` "Parallel data
 * fetching")을 놓친 전제였다 — `(app)/admin/layout.tsx`의 게이트가 아직 판정을 끝내지 않은
 * 병렬 브랜치에서도 이 컨테이너는 독립적으로 실행돼 `admin_list_reports`를 호출한다. 이
 * RPC는 **인증된 비관리자**에게는 빈 배열을 정상 반환하지만(`docs/decisions/
 * admin-console-042b.md` §2), **게스트(anon role)에게는 EXECUTE 권한 자체가 없어** Postgres가
 * `42501 permission denied`를 던진다 — `listPendingReports`가 이 오류를 그대로 `throw`하므로
 * (`src/lib/data/supabase/admin.ts`) 처리되지 않은 예외로 서버 콘솔에 남는다. 그래서
 * `NotificationCenterContainer`·`MonthCalendarContainer` 등 9개 컨테이너가 24일차에 옮긴 것과
 * 같은 `if (!isAuthenticated(session)) return null;` 조기 반환을 여기도 적용하고,
 * `isSystemAdmin`까지 함께 확인해 인증된 비관리자 요청에서도 불필요한 RPC 호출 자체를
 * 생략한다(레이아웃의 최종 판정과 이중 안전 — 최종 강제는 여전히 RPC 내부의
 * `profiles.is_system_admin` 재확인이다, `(app)/admin/layout.tsx` docstring 참고).
 *
 * 조회 실패(네트워크 등)는 여기서 잡지 않는다 — `BlockedUsersListContainer`와 같은 관례로
 * Next.js 라우트 오류 경계(`error.tsx`)에 위임한다(NFR-028).
 */
export async function AdminReportsContainer() {
  const session = await getAuthSession();
  if (!isAuthenticated(session) || !session.isSystemAdmin) {
    // (app)/admin 레이아웃 게이트가 이미 미인증·비관리자 분기를 선택했을 병렬 렌더링의
    // 폐기 브랜치다(I-095와 같은 구조, I-115).
    return null;
  }

  const reports = await listPendingReports("pending");
  return <AdminReportQueue reports={reports} />;
}
