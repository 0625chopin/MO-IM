import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";

/**
 * SC-E1 404 화면(D-030 ①, 얇은 라우트 파일 + 표현 컴포넌트). Next.js 16 규약상 Server
 * Component이며 props를 받지 않는다 — `notFound()`가 던져진 세그먼트뿐 아니라 이 루트 레이아웃
 * (`(shell)/layout.tsx`) 아래에서 매칭되지 않는 URL도 이 파일이 함께 처리한다.
 *
 * `AppShell`을 직접 감싸지 않는다 — `(shell)/layout.tsx`가 이미 이 그룹의 모든 세그먼트를
 * `AppShell`로 감싸므로 헤더·탭바는 그대로 유지된다. 페이지가 `<main>` 랜드마크를 소유한다
 * (`AppShell` 주석 참고).
 *
 * **I-098(23일차)로 `src/app/layout.tsx`가 `(shell)/layout.tsx`로 이동했다** — 이 파일도
 * 같은 그룹으로 함께 옮겨졌다(복수 루트 레이아웃, `docs/decisions/appframe-responsive-audit-099.md`
 * §4). `/sample`은 형제 루트 레이아웃(`sample/layout.tsx`)이라 이 파일이 처리하지 않는다 —
 * `sample/not-found.tsx`가 별도로 있다.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <RouteErrorBoundary kind="not_found" />
    </main>
  );
}
