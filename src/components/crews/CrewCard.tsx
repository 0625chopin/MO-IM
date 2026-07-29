import Link from "next/link";

import type { CrewCardViewModel } from "@/components/crews/crew-explore-view-models";
import { getCrewHomeHref } from "@/components/crews/crew-links";
import { CrewColorDot } from "@/components/crews/CrewColorDot";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { strings, t } from "@/lib/strings";

export interface CrewCardProps {
  crew: CrewCardViewModel;
}

/**
 * 크루 탐색 결과 카드 한 장(FR-014, Task 016A). 순수 표현 컴포넌트 — `lib/data`를 참조하지
 * 않고 컨테이너·Server Action이 이미 조인한 `CrewCardViewModel`만 받는다(D-030 ①).
 *
 * **"가입됨" 배지만 있고 가입 신청 버튼은 여기 없다** — FR-014 정상 흐름이 "④ 상세 진입 →
 * ⑤ 가입 신청"을 **두 단계**로 분리해 두었고, 가입 신청 상태 기계(pending·invited·blocked 등,
 * `lib/rules/join-request-button-state.ts`)는 이미 크루 홈(Task 016B, `CrewHomeContainer`)이
 * 소유한다 — 이 카드에서 같은 상태 기계를 다시 계산하면 R-015가 경계하는 "판정 로직 중복"이
 * 된다. 그래서 카드는 딱 하나(`isActiveMembership` 파생값인 `isMember`)만 보고 배지 유무를
 * 정하고, 나머지는 전부 카드를 눌러 들어간 크루 홈에서 이어진다(AC2는 배지 표시 + 버튼
 * 비노출까지만 요구한다 — 카드 자체가 버튼을 아예 갖지 않으면 두 요구를 동시에 만족한다).
 *
 * `private` 크루가 카드로 나타나는 경우는 항상 `isMember === true`다 — `listCrews`가 데이터
 * 접근 단계에서 비소속자에게 `private` 크루를 아예 반환하지 않기 때문이다(D-017·D-028,
 * `fetch-crew-cards.ts` 참고).
 *
 * **FR-055 AC1(Task 044) — 읽지 않은 메시지 배지.** "가입됨" 배지와 같은 자리(헤더 배지 줄)에
 * 이어 붙인다 — 이 카드가 이미 그 화면의 유일한 "크루 목록"이라 AC1 "크루 목록 조회" 요구를
 * 만족하는 지점이다(`unreadMessageCount`는 `isMember`가 아니면 항상 0이므로 별도 조건 없이
 * `crew.unreadMessageCount > 0`만 본다).
 */
export function CrewCard({ crew }: CrewCardProps) {
  return (
    <Link
      href={getCrewHomeHref(crew.id)}
      className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CrewColorDot colorIndex={crew.colorIndex} />
            <CardTitle className="truncate">{crew.name}</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{crew.category}</Badge>
            {crew.isMember && <Badge variant="secondary">{strings.crew.explore.memberBadge}</Badge>}
            {crew.unreadMessageCount > 0 && (
              <Badge
                variant="default"
                aria-label={t((s) => s.chat.unread.badgeLabel, { count: crew.unreadMessageCount })}
              >
                {crew.unreadMessageCount > 99 ? "99+" : crew.unreadMessageCount}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="line-clamp-2 text-sm text-muted-foreground">{crew.description}</p>
          <p className="text-xs text-muted-foreground">
            {t((s) => s.crew.home.memberCount, { count: crew.memberCount })}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
