import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";

/**
 * `/sample` 루트 레이아웃(I-098, 23일차)의 404 화면. `(shell)/not-found.tsx`와 같은 이유·같은
 * 구성이다 — 복수 루트 레이아웃에서는 각 루트가 독립적인 세그먼트 트리라, `(shell)`의 404
 * 화면이 `/sample` 아래에서 매칭되지 않는 URL(예: `/sample/존재하지-않는-경로`)을 대신 처리해
 * 주지 않는다. `sample/layout.tsx`가 이미 `<html>`/`<body>`를 그리므로 여기서는 `AppShell`
 * 대신 폭 제약 없는 컨테이너 안에 그대로 놓는다.
 */
export default function SampleNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <RouteErrorBoundary kind="not_found" homeHref="/sample" />
    </main>
  );
}
