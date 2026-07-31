import type { CrewVisibility } from "@/lib/types";

/**
 * 크루 공개 범위 고정 코드 목록 — 순수 데이터 + 판정(NFR-036, R-015). `CREW_CATEGORIES`
 * (`crew-category.ts`)와 같은 자리·같은 역할이다: 타입(`CrewVisibility`, D-007)은 컴파일
 * 타임에만 존재하므로, **선택지를 렌더하거나 FormData 문자열을 판정하려면 런타임 목록이
 * 따로 필요하다.**
 *
 * 이 파일이 생기기 전에는 그 목록이 네 곳에 흩어져 있었다 — `CrewCreateForm`·
 * `CrewVisibilityForm`의 `<RadioGroupItem value="public|private">` 하드코딩과,
 * `create-crew.ts`·`update-crew-visibility.ts`가 각자 복사해 둔 `VISIBILITY_VALUES` 배열.
 * 공개 범위가 하나 늘면 네 곳을 모두 고쳐야 했고, 폼에만 추가하고 액션의 판정 배열을 빠뜨리면
 * "선택은 되는데 저장하면 조용히 public으로 떨어지는" 불일치가 된다(`create-crew.ts`의
 * 폴백이 정확히 그렇게 동작한다) — `CREW_CATEGORIES` docstring이 개설 폼·탐색 필터에 대해
 * 경계하는 것과 같은 종류의 어긋남이다.
 *
 * 사용자에게 보이는 라벨·설명은 여기 두지 않는다 — `strings.crew.create.visibilityOptions.*`가
 * 단일 소스이며, 이 배열의 값이 그 객체의 키와 1:1로 대응한다(`strings/README.md` §2
 * "상태 머신의 상태값은 코드 식별자이지 사용자 문구가 아니다").
 */
export const CREW_VISIBILITIES = ["public", "private"] as const satisfies readonly CrewVisibility[];

/**
 * `satisfies`는 배열이 `CrewVisibility`의 **부분집합**인지만 검사한다 — 유니온에 값을 추가하고
 * 이 배열에 빠뜨리는 실수는 잡지 못한다. 아래 타입이 그 누락을 컴파일 오류로 만든다(누락이
 * 생기면 `never`가 아니게 되어 `AllCrewVisibilitiesCovered`가 `never`로 평가되고, 그 값을
 * 요구하는 아래 선언이 깨진다).
 */
type UncoveredCrewVisibility = Exclude<CrewVisibility, (typeof CREW_VISIBILITIES)[number]>;
type AllCrewVisibilitiesCovered = [UncoveredCrewVisibility] extends [never] ? true : never;
const _allCrewVisibilitiesCovered: AllCrewVisibilitiesCovered = true;
void _allCrewVisibilitiesCovered;

/**
 * 폼 기본값 — 개설 시 선택하지 않았거나 판정에 실패했을 때의 안전한 기본. `public`이 기본인
 * 이유는 FR-010이 개설 폼의 기본 선택을 공개로 두기 때문이다(공개 범위는 개설 후 오너가
 * 언제든 좁힐 수 있고, 그 반대 방향보다 되돌리기 쉽다).
 */
export const DEFAULT_CREW_VISIBILITY: CrewVisibility = "public";

/** FormData 등 신뢰할 수 없는 문자열이 유효한 공개 범위 코드인지 판정한다. */
export function isValidCrewVisibility(value: string): value is CrewVisibility {
  return (CREW_VISIBILITIES as readonly string[]).includes(value);
}
