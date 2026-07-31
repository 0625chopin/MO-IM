import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { HotMeetupsContainer } from "@/components/meetup/HotMeetupsContainer";
import { HotMeetupsSkeleton } from "@/components/meetup/HotMeetupsSkeleton";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { Button } from "@/components/ui/button";
import { crewCertaintyVars } from "@/lib/crew-palette";
import { strings } from "@/lib/strings";

import type { CSSProperties } from "react";

/**
 * 랜딩 페이지 (SC-01, PRD §6 "랜딩 페이지"). 비로그인 방문자의 진입점 — 로그인 상태면
 * 홈(`/home`)으로 리다이렉트한다(PRD §2.2 각주1, 인증 경계는 Task 011 그대로).
 *
 * **따뜻한 종이·잉크 개편(2026-07-24)**: 개편 전 이 페이지는 제품 정의 한 문장만 있는 빈
 * 화면이었다. 브랜드 첫인상을 담도록 히어로 + 확정성 스케일 시연으로 다시 지었다. 히어로 배경은
 * `surface-warm`(크루 칩을 놓지 않는 표면에만 쓰는 온색 워시)이고, 문구는 전부 `strings.landing`
 * 에서 온다(NFR-023). 아래 3단계는 이 제품의 **실제 순서**(제안→투표→확정)라 단계로 세웠고,
 * 각 단계를 실제 `certainty-*` 시각(점선→옅은 칠→채움)으로 보여준다 — 화면 곳곳(캘린더·투표·
 * 알림)에서 쓰는 바로 그 표현이다.
 */
export default async function LandingPage() {
  const session = await getAuthSession();
  if (isAuthenticated(session)) {
    redirect("/home");
  }

  // 세 단계는 같은 크루의 한 모임이 확정성을 얻어 가는 과정이다 — 그래서 한 크루색(온색 계열
  // index 10, 갈색)을 세 단계가 공유한다. `crewCertaintyVars`가 칠·글자색을 짝으로 돌려준다.
  const demoVars = crewCertaintyVars(10) as CSSProperties;
  const stepCertainty = [
    "certainty-draft",
    "certainty-pending",
    "certainty-confirmed",
  ] as const;

  return (
    <main className="surface-warm flex flex-1 flex-col">
      {/* ── 히어로 ──────────────────────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 pt-16 pb-14 text-center">
        <span className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {strings.landing.hero.eyebrow}
        </span>
        <h1 className="display text-4xl text-foreground">
          {strings.landing.hero.headline}
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
          {strings.landing.hero.subhead}
        </p>
        <div className="mt-2 flex flex-col gap-3">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/signup" />}
            className="gap-1.5"
          >
            {strings.landing.hero.ctaPrimary}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/crews" />}
          >
            {strings.landing.hero.ctaSecondary}
          </Button>
        </div>
      </section>

      {/* ── 확정성 스케일 시연(제품 시그니처) ───────────────────────────── */}
      <section className="mx-auto w-full max-w-4xl px-6 pb-20">
        <div className="elevate flex flex-col gap-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-center text-lg font-semibold text-foreground">
            {strings.landing.steps.title}
          </h2>
          <ol className="flex flex-col items-stretch gap-4">
            {strings.landing.steps.items.map((step, i) => (
              <li key={step.name} className="contents">
                <div className="flex flex-1 flex-col items-center gap-3 text-center">
                  {/* 실제 캘린더·투표에서 쓰는 certainty 시각 그대로. draft=점선, pending=옅은 칠,
                      confirmed=채움. `demoVars`가 크루색(칠)과 그 위 글자색을 짝으로 넘긴다. */}
                  <span
                    style={demoVars}
                    className={`${stepCertainty[i]} inline-flex items-center rounded-full px-3.5 py-1 text-sm font-medium`}
                  >
                    {step.name}
                  </span>
                  <p className="max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
                {i < strings.landing.steps.items.length - 1 && (
                  <ArrowRight
                    aria-hidden="true"
                    className="mx-auto size-4 shrink-0 rotate-90 self-center text-muted-foreground/60"
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 지금 활발한 모임(D-109) ──────────────────────────────────────
          확정성 스케일 시연이 "이 제품이 어떻게 동작하는지"를 보여준 직후에 온다 — 그 설명이
          추상적이라, 바로 아래에서 **실제로 지금 그렇게 돌아가고 있는 모임들**을 보여주는
          순서가 맞다. 히어로 위로 올리지 않은 이유: 비로그인 방문자에게 첫 화면은 제품이
          무엇인지여야 하고, 목록은 그 주장의 증거이지 주장 자체가 아니다.
          공개 데이터만 담기므로 게스트 컨텍스트(`anon`)에서 그대로 조회된다. */}
      <section className="mx-auto w-full max-w-4xl px-6 pb-20">
        <Suspense fallback={<HotMeetupsSkeleton />}>
          <HotMeetupsContainer showBrowseCta />
        </Suspense>
      </section>
    </main>
  );
}
