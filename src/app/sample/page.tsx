import { SHOWCASE_SECTIONS } from "@/components/sample/registry";
import { ShowcaseSectionBlock } from "@/components/sample/ShowcaseSectionBlock";

/**
 * `/sample` 컴포넌트 쇼케이스 진입점(Task 011 최소 골격 → 디자인 개편에서 구조 확장 →
 * Task 012에서 등록 인터페이스로 정리).
 *
 * 카테고리·항목 데이터는 이 파일에 없다 — `registry.ts`가 조립한 `SHOWCASE_SECTIONS`를
 * 그대로 렌더링만 한다. **새 컴포넌트를 등록할 때 이 파일을 고치지 않는다** — 대신
 * `src/components/sample/sections/<my-domain>.tsx`를 만들고 `registry.ts`에 한 줄만
 * 추가한다. 사용법·예시는 `src/components/sample/README.md` 참고. 테스트 러너가 없는 동안
 * 이 페이지가 유일한 회귀 확인 지점이다(R-002, CON-09).
 *
 * **폭이 `max-w-4xl`(896px)이 아니라 `max-w-[90rem]`(1440px)인 이유(I-098, 23일차)**: 이
 * `<main>`은 `sample/layout.tsx`가 `<body>`에 준 `@container/appframe`의 자손이라, 이 페이지
 * 자신의 폭이 `sm:`(40rem)뿐 아니라 `lg:`(64rem=1024px) 재배치까지 실제로 켤 수 있어야 한다
 * (`foundation.tsx`의 "시맨틱 색" 그리드가 `lg:grid-cols-5`를 쓴다). 896px에 묶여 있으면 실제
 * 브라우저가 아무리 넓어도 `lg:`가 영원히 안 켜진다 — 본문 프로즈(문단·설명)는 각자
 * `max-w-2xl`을 따로 갖고 있어(줄 길이 보호) 이 폭 확장의 영향을 받지 않는다.
 *
 * **문자열 경계(팀장 판정 완료, 2026-07-24)**: 아래 헤더 문구·앵커 내비 라벨은 `strings`
 * 모듈을 거치지 않는다 — `/sample`은 SC-01~22 제품 화면이 아니라 내부 개발 도구 페이지라
 * NFR-023(사용자 노출 문자열 분리) 적용 대상 밖이다. **단, 이 페이지가 렌더링하는 실제 제품
 * 컴포넌트(`HeaderNav`·`PageHeader` 등)에 주입하는 문구는 예외 없이 `strings`를 거친 값이어야
 * 한다** — 쇼케이스 크롬과 제품 컴포넌트 문구를 혼동하지 말 것. 각 섹션 파일도 동일 규칙을
 * 따른다.
 */
export default function SamplePage() {
  return (
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-12 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3">
        <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground">
          내부 개발 도구
        </span>
        <h1 className="text-3xl font-semibold text-foreground">컴포넌트 쇼케이스</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          이 앱의 디자인 언어는 <strong className="font-medium text-foreground">잉크와 확정성</strong>
          입니다. 화면의 유채색은 크루 12색이 전부 가져가고 UI 크롬은 잉크 뉴트럴로 물러납니다.
          그리고 <strong className="font-medium text-foreground">확실할수록 색이 찹니다</strong> —
          제안은 점선, 확정은 채움. 근거와 수치는{" "}
          <code className="font-mono text-xs">docs/design/design-language.md</code>에 있습니다.
        </p>
      </header>

      <nav
        aria-label="섹션 바로가기"
        className="sticky top-14 z-30 -mx-4 flex flex-wrap gap-1 border-y border-border bg-background/85 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6"
      >
        {SHOWCASE_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {SHOWCASE_SECTIONS.map((s) => (
        <ShowcaseSectionBlock key={s.id} section={s} />
      ))}
    </main>
  );
}
