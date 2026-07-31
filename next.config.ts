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

  // 크루 활동 사진(팀장 요청) — private Storage 버킷의 서명 URL을 `next/image`가 최적화하려면
  // 그 호스트를 명시적으로 허용해야 한다(Next.js 16에서 `images.domains`는 deprecated이므로
  // `remotePatterns`를 쓴다). 호스트는 `.env.local`의 프로젝트 URL에서 파생한다 — 여기에
  // 프로젝트 ref를 하드코딩하면 환경마다 이 파일을 고쳐야 한다.
  //
  // `pathname`을 `/storage/v1/object/sign/**`로 좁힌 것은 의도적이다: 서명 URL만 통과시키고
  // 같은 호스트의 다른 엔드포인트(Auth·REST)는 이미지 프록시 대상이 되지 않게 한다.
  images: {
    remotePatterns: (() => {
      const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!raw) return [];
      try {
        const { protocol, hostname } = new URL(raw);
        return [
          {
            protocol: protocol.replace(":", "") as "http" | "https",
            hostname,
            pathname: "/storage/v1/object/sign/**",
          },
        ];
      } catch {
        // 잘못된 URL이면 원격 이미지를 아예 허용하지 않는다 — 빌드를 세우는 것보다 낫다.
        return [];
      }
    })(),
  },
};

export default nextConfig;
