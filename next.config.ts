import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // I-098(23일차) — 복수 루트 레이아웃((shell)·sample) 도입 이후, 어느 root layout에도 속하지
  // 않는 "진짜 매칭되지 않는 URL"은 `(shell)/not-found.tsx`·`sample/not-found.tsx` 어느 쪽도
  // 타지 않고 Next.js 내장 제네릭 404로 떨어진다(실측 확인, `src/app/global-not-found.tsx`
  // docstring 참고). 공식 문서가 정확히 이 상황을 위해 이 실험적 플래그를 제공한다
  // (`node_modules/next/dist/docs/.../not-found.md` "여러 root layout이 있어 하나의 layout으로
  // 전역 404를 구성할 수 없다").
  experimental: {
    globalNotFound: true,
  },
};

export default nextConfig;
