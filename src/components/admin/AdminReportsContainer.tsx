import { listPendingReports } from "@/lib/data";

import { AdminReportQueue } from "./AdminReportQueue";

/**
 * FR-082 AC1 관리자 콘솔 대기열 컨테이너(Task 042B, D-030 ① — 조회를 소유하고 표현
 * 컴포넌트에 props로 내려준다). `/admin` 페이지가 조립한다.
 *
 * 세션 확인은 이 컨테이너가 하지 않는다 — `(app)/admin/layout.tsx`가 이미 `isSystemAdmin`
 * 게이트를 통과한 요청만 이 아래로 들여보낸다(AC2). `listPendingReports`가 호출하는
 * `admin_list_reports` RPC 자체도 비관리자에게는 빈 배열을 반환하도록 설계돼 있어
 * (`docs/decisions/admin-console-042b.md` §2) 이중으로 안전하다.
 *
 * 조회 실패(네트워크 등)는 여기서 잡지 않는다 — `BlockedUsersListContainer`와 같은 관례로
 * Next.js 라우트 오류 경계(`error.tsx`)에 위임한다(NFR-028).
 */
export async function AdminReportsContainer() {
  const reports = await listPendingReports("pending");
  return <AdminReportQueue reports={reports} />;
}
