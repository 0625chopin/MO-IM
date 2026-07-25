import { notFound } from "next/navigation";

import { PostWriteForm } from "@/components/board/PostWriteForm";
import { resolveBoardViewer } from "@/components/board/resolve-board-viewer";
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import { getBoardByCrewId, getCrewById } from "@/lib/data";
import { checkPermission } from "@/lib/rules/permission";
import type { Id } from "@/lib/types";

/**
 * 글쓰기 컨테이너(D-030 ①, Task 018B). 크루원 여부 자체는 `(app)/crews/[crewId]/layout.tsx`
 * (D-039)가 라우트 레벨에서 이미 걸렀다 — 이 컨테이너는 `BoardListContainer`(018A)와 같은
 * 패턴으로 `post:create`(일반글 작성 허용 여부)만 한 번 더 판정한다. D-039가 정한 대로
 * "누가 여기 도달할 수 있는가"는 레이아웃 몫, "그 사람이 정확히 뭘 할 수 있는가"는 컨테이너
 * 몫이다 — 실제 내비게이션 경로에서는 활성 크루원이면 `post:create`가 항상 허용이라 이
 * 판정이 사실상 통과만 하지만, Server Component가 직접 다른 경로로 렌더될 가능성에 대한
 * 방어이자 기존 게시판 컨테이너들과의 일관성을 위해 유지한다.
 *
 * 모임 제안글(`poll:create_proposal`) 판정은 유형을 고른 "이후"에나 의미가 있어 여기서
 * 미리 하지 않는다 — `createPostAction`(Server Action)이 제출 시점에 최종 판정한다.
 *
 * **19일차(Task 040 UI/게이트 절반, I-066 해소)** — `/board/new`는 쓰기 전용 라우트라 해산된
 * 크루면 아예 막는다(팀장 지시: "쓰기 전용 라우트는 아예 막아도 된다"). 이 UI 차단은 UX
 * 안내일 뿐이고, 실제 강제 경계는 CORE가 posts INSERT RLS 정책에 추가하는
 * `crews.status='active'` 조건이다(I-066 해소 방향 1, SQL이 최종 경계 — 18일차 교훈).
 *
 * **20일차(I-069 근본 해결, DESIGN) — 이 파일에는 `forbidden` throw 지점이 둘 있었고, 도달성이
 * 갈려 처리를 다르게 했다(19일차 영향 범위 인벤토리 참고).**
 * - **`crew_archived`(해산된 크루) — 값 반환으로 전환.** 해산된 크루는 항상 이 조건에 걸려
 *   도달성이 "중간"이다(DESIGN이 19일차 이 정확한 지점에서 I-069를 최초 발견했다). 프로덕션
 *   빌드는 서버 컴포넌트 예외의 `cause`를 클라이언트로 넘기지 않아(Next.js 공식 보안 동작)
 *   `error.tsx`의 `classifyError`가 이 throw를 항상 분류 실패로 떨어뜨렸다 — 지금은
 *   `<RouteErrorBoundary kind="forbidden" />`를 값으로 직접 반환한다.
 * - **`post:create` 거부 — throw를 그대로 둔다.** `post:create`는 현재 권한 매트릭스에서
 *   `crew_member` 이상 전원 `allow`이고(`lib/rules/permission.ts`), 이 지점에 오기 전에
 *   이미 `(app)/crews/[crewId]/layout.tsx`(D-039)가 "크루원인가"를 걸렀다 — 즉 이 분기가
 *   실제로 타는 경로가 현재 매트릭스에 없다(방어적 코드, 도달성 "사실상 0", 19일차 인벤토리
 *   #7). 도달 불가능한 코드를 전환해도 프로덕션 실측으로 검증할 방법이 없어 이번 회차
 *   범위(도달성 높은 4곳)에서 제외했다 — 향후 role 세분화로 `post:create`가 `crew_member`
 *   전원 허용이 아니게 되면 이 throw도 재검토 대상이다.
 */
export async function PostWriteContainer({ crewId }: { crewId: Id }) {
  const board = await getBoardByCrewId(crewId);
  if (!board) {
    notFound();
  }

  const { role } = await resolveBoardViewer(crewId);
  const permission = checkPermission({ role, action: "post:create" });
  if (!permission.allowed) {
    throw new Error("게시글을 작성할 권한이 없다.", {
      cause: { code: "forbidden", message: permission.reason ?? "post:create denied" },
    });
  }

  const crew = await getCrewById(crewId);
  if (crew?.status !== "active") {
    return <RouteErrorBoundary kind="forbidden" />;
  }

  return <PostWriteForm crewId={crewId} />;
}
