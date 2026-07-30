# 워크로그 템플릿 — docs/dailyWorkLog/N_Day.md

완료 처리(4단계)의 **워크로그 작성** 단계에서 이 서식으로 `docs/dailyWorkLog/<N>_Day.md`를 만든다.
`완료 Task` 목록은 **다음 회차의 완료 집합 판정 근거**이므로 Task 번호를 정확히 적는다.
문체는 프로젝트 문서와 동일한 단정적 평서체, 날짜는 ISO(YYYY-MM-DD).

---

```markdown
# <N>일차 작업 로그 (<YYYY-MM-DD>)

## 회차 요약
- 활성 팀원: <NAME 목록>
- 이번 회차 배치 근거: <어떤 선행조건이 충족되어 이 Task들이 열렸는지 한 줄>
- 결과: 이슈 <n>건 발견 / 전건 해소, 전체 테스트 <통과|생략(사유)>

## 팀원별 완료 내역
### <NAME> (<NN.NAME>.md)
- 완료 Task: <Task 번호 · 제목>
- 산출물: <파일 경로 목록>
- 비고: <있으면>

(활성 팀원 수만큼 반복)

## 교차검증 결과
- <REVIEWER> → <NAME>: <pass 요약 또는 발견 이슈>
- (리뷰 짝 쌍마다 한 줄)

## 발견·해결한 이슈
1. [<NAME>] <이슈> → <해소 방법> (재검증 <REVIEWER> pass)
- (없으면 "없음")

## 팀장 전체 테스트 (항상 실행)
- npm run lint: <결과>
- npx tsc --noEmit: <결과>
- npm run build: <결과>

## 문서 갱신
- docs/ROADMAP/team/*.md 상태 마커: <갱신한 Task 목록>
- docs/team/*.md: <갱신했으면 내용, 없으면 "변경 없음">

## 다음 회차에 열리는 Task
- <이번 완료로 선행조건이 충족되는 Task 번호와 담당 팀원> (없으면 "다음 회차 산정 시 재계산")

## git
- 브랜치: day-<N>
- 커밋: <해시 또는 요약>
- 푸시: <origin/day-N 성공 여부>
```

---

## 완료 집합 재구성 규칙
다음 회차(1단계 2번)에서 팀장은 `docs/dailyWorkLog/`의 모든 `*_Day.md`에서 위
`## 팀원별 완료 내역`의 **완료 Task 번호**를 모아 완료 집합을 만든다. 그래서 이 섹션의
Task 번호 표기는 반드시 `docs/ROADMAP/team/`의 원 Task 번호와 동일해야 한다.
