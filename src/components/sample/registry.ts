import { a11ySection } from "@/components/sample/sections/a11y";
import { accountSection } from "@/components/sample/sections/account";
import { authSection } from "@/components/sample/sections/auth";
import { boardSection } from "@/components/sample/sections/board";
import { calendarSection } from "@/components/sample/sections/calendar";
import { certaintySection } from "@/components/sample/sections/certainty";
import { chatSection } from "@/components/sample/sections/chat";
import { crewsSection } from "@/components/sample/sections/crews";
import { errorsSection } from "@/components/sample/sections/errors";
import { formsSection } from "@/components/sample/sections/forms";
import { foundationSection } from "@/components/sample/sections/foundation";
import { invitationsSection } from "@/components/sample/sections/invitations";
import { meetupSection } from "@/components/sample/sections/meetup";
import { moderationSection } from "@/components/sample/sections/moderation";
import { notificationsSection } from "@/components/sample/sections/notifications";
import { overlaysSection } from "@/components/sample/sections/overlays";
import { pollSection } from "@/components/sample/sections/poll";
import { primitivesSection } from "@/components/sample/sections/primitives";
import { shellSection } from "@/components/sample/sections/shell";
import { themeSection } from "@/components/sample/sections/theme";
import type { ShowcaseSection } from "@/components/sample/showcase-types";
export { defineSection } from "@/components/sample/showcase-types";
export type { ShowcaseItem, ShowcaseSection } from "@/components/sample/showcase-types";

/**
 * `/sample`에 실제로 렌더링되는 섹션 목록 — Task 012 등록 인터페이스의 진입점.
 *
 * 새 카테고리를 등록하려면:
 * 1. `src/components/sample/sections/<my-domain>.tsx`에서 `defineSection({...})`으로 섹션을 만든다.
 * 2. 아래 배열에 import + 한 줄만 추가한다. `src/app/sample/page.tsx`와 다른 섹션 파일은
 *    건드리지 않는다.
 *
 * 자세한 사용법·예시는 `src/components/sample/README.md` 참고.
 */
export const SHOWCASE_SECTIONS: ShowcaseSection[] = [
  foundationSection,
  certaintySection,
  themeSection,
  shellSection,
  primitivesSection,
  formsSection,
  overlaysSection,
  errorsSection,
  calendarSection,
  meetupSection,
  authSection,
  boardSection,
  pollSection,
  chatSection,
  accountSection,
  crewsSection,
  notificationsSection,
  invitationsSection,
  moderationSection,
  a11ySection,
];
