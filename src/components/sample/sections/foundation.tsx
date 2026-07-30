import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { defineSection } from "@/components/sample/showcase-types";

/* ── 기반: 색·타이포 ───────────────────────────────────────────────────── */

const SEMANTIC_SWATCHES = [
  { token: "background", cls: "bg-background", note: "무채·불변 (팔레트 대비 기준면)" },
  { token: "card", cls: "bg-card", note: "크루색을 놓아도 되는 표면" },
  { token: "muted", cls: "bg-muted", note: "크루색 금지 (실측 2.99)" },
  { token: "accent", cls: "bg-accent", note: "hover·선택 배경" },
  { token: "border", cls: "bg-border", note: "경계" },
  { token: "muted-foreground", cls: "bg-muted-foreground", note: "보조 문구 5.28:1" },
  { token: "foreground", cls: "bg-foreground", note: "본문 19.41:1" },
  { token: "primary", cls: "bg-primary", note: "주 버튼" },
  { token: "destructive", cls: "bg-destructive", note: "파괴·오류 11.66:1 (I-029, 32일차 L 이동)" },
  { token: "ring", cls: "bg-ring", note: "포커스 7.43:1" },
];

export const foundationSection = defineSection({
  id: "foundation",
  label: "기반",
  title: "기반",
  description: (
    <>
      시맨틱 색 토큰과 조판 규칙입니다. 색 값은 전부{" "}
      <code className="font-mono text-xs">globals.css</code>의 CSS 커스텀 프로퍼티에서 오고,
      라이트·다크가 같은 이름을 공유합니다. 임의 색을 쓰면 다크모드가 따라오지 않습니다.
    </>
  ),
  items: [
    {
      name: "시맨틱 색",
      note: "괄호 안은 흰 배경(라이트) 기준 실측 대비입니다. muted 계열 표면에 크루색을 놓으면 3:1이 깨집니다 — 표면 선택이 규칙인 이유입니다.",
      content: (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SEMANTIC_SWATCHES.map((s) => (
            <div key={s.token} className="flex flex-col gap-1.5">
              <div className={`h-12 rounded-md border border-border ${s.cls}`} />
              <div className="flex flex-col">
                <code className="font-mono text-[11px] text-foreground">{s.token}</code>
                <span className="text-[11px] leading-tight text-muted-foreground">{s.note}</span>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      name: "조판",
      note: "본문은 Noto Sans KR(가변), 수·시각은 Geist Mono입니다. 한글은 낱말 단위로 줄바꿈합니다(word-break: keep-all) — 360px에서 낱말이 한가운데서 잘리지 않습니다.",
      content: (
        <div className="flex flex-col gap-4 rounded-lg border border-border p-5">
          <div>
            <h4 className="text-2xl font-semibold text-foreground">
              이번 주말 등산, 언제가 좋을까요
            </h4>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              제목 · 600 · tracking −0.022em
            </p>
          </div>
          <div>
            <p className="max-w-prose text-sm text-foreground">
              동호회의 모임 일정이 채팅에 묻히지 않도록, 게시글 기반 찬반 투표로 일정을 확정하고
              가결된 일정을 크루 색으로 구분된 통합 캘린더에 자동으로 등록합니다.
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              본문 · 400 · line-height 1.7
            </p>
          </div>
          <div>
            <p className="tnum font-mono text-sm text-foreground">
              2026-08-14 19:30 · 찬성 12 / 반대 3 · 정족수 9
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              수·시각 · Geist Mono · tabular-nums
            </p>
          </div>
        </div>
      ),
    },
    {
      name: "컨테이너 쿼리",
      note: "아래 카드 그리드는 컨테이너 쿼리(grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3)로 짰습니다. 위 폭 토글을 360으로 내리면(@sm 임계값 24rem=384px 미만) 1열로, 768 이상으로 올리면(@lg 임계값 32rem=512px 이상) 3열로 즉시 재배치됩니다 — 뷰포트를 줄이지 않아도 이 프레임 안에서 확인됩니다. 도메인 컴포넌트는 이 패턴을 따릅니다. 반대로 뷰포트 기준 sm:/lg:를 쓰는 항목(위 '시맨틱 색'처럼)은 PreviewFrame으로 감싸지 않습니다 — 감싸도 폭 토글에 반응하지 않아 고장난 것처럼 보이기 때문입니다.",
      panels: {
        default: (
          <PreviewFrame height={220} resizable width={768}>
            <div className="grid grid-cols-1 gap-3 p-4 @sm:grid-cols-2 @lg:grid-cols-3">
              {["카드 A", "카드 B", "카드 C"].map((label) => (
                <div
                  key={label}
                  className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
