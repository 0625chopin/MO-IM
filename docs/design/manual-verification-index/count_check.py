#!/usr/bin/env python3
"""이 색인(§1·§2 표)의 파일 수·절차 수·CI 이관 분포를 표 원문에서 기계적으로 재계산한다.

**등장 배경(36일차)**: §3 요약 숫자가 33일차 최초 작성 이후 "이전 요약값 + 1"로만 갱신되며
세 회차(33·35·36일차)에 걸쳐 CI 이관 분포(가능/부분/불가)가 실제 표 내용과 어긋난 채
누적됐다 — 33일차 최초본부터 이미 틀려 있었다(부분 9·불가 5로 적혀 있었지만 실제 표를 세면
부분 7·불가 7이었다). 사람이 표를 보고 "이전 숫자 + 1"로 손으로 더하는 방식 자체가 이
사고를 반복시킨다 — 이 스크립트는 그 대신 표 원문에서 매번 처음부터 다시 센다.

**파일 수 집계 규칙**: 각 행(절차)의 **첫 번째** `docs/...` 백틱 경로를 그 행의 "파일"로
삼는다. 같은 파일이 절차를 여러 개 나눠 가지면(예: `chat-retention-035.md`가 §7·§8 두 행에
걸침) 1개로만 센다. 한 행이 절차 하나를 설명하며 **원시 데이터 별첨**을 추가로 인용하는
경우(예: `permission-baseline.md` 행이 뒤에 `permission-baseline-raw-27.md`를 덧붙임 — 그
별첨 자체는 판정 기준이 없는, 원 문서에 종속된 원시 JSON 덤프일 뿐이다)는 그 별첨을 별도
파일로 세지 않는다 — 이 규칙이 33·35일차의 "19/20개 파일"이 실제로 어떻게 나온 숫자인지와도
일치한다(git show로 역산 확인, README §3 갱신 이력 참고).

사용법: python3 count_check.py [README.md 경로, 기본값은 같은 디렉터리의 README.md]
"""
import re
import sys
from pathlib import Path


def main():
    default_path = Path(__file__).with_name("README.md")
    path = sys.argv[1] if len(sys.argv) > 1 else default_path
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    section = 0
    rows = []
    for line in lines:
        if line.startswith("## 1."):
            section = 1
            continue
        if line.startswith("## 2."):
            section = 2
            continue
        if line.startswith("## 3."):
            section = 0
            continue
        if section in (1, 2) and line.startswith("| `"):
            rows.append(line.rstrip("\n"))

    if not rows:
        raise SystemExit("§1·§2 표에서 행을 하나도 못 찾았다 — 파일 구조가 바뀌었는지 확인할 것")

    files = []
    ci_values = []
    for row in rows:
        cells = row.split("|")
        # cells[0]은 행 시작 전 빈 문자열, cells[-1]은 행 끝 뒤 빈 문자열(또는 개행 잔여)
        first_col = cells[1]
        ci_col = cells[-2].strip()

        m = re.search(r"`(docs/[^`]+\.md)`", first_col)
        if not m:
            raise SystemExit(f"첫 컬럼에서 docs/*.md 경로를 못 찾음: {row!r}")
        files.append(m.group(1))

        m2 = re.match(r"(가능|부분|불가)", ci_col)
        if not m2:
            raise SystemExit(f"CI 이관 컬럼 형식이 예상과 다름: {ci_col!r} (행: {row!r})")
        ci_values.append(m2.group(1))

    unique_files = sorted(set(files))
    dupes = {f: files.count(f) for f in unique_files if files.count(f) > 1}

    print(f"절차(행) 수: {len(rows)}")
    print(f"파일 수(첫 컬럼 경로 기준, 별첨 미포함): {len(unique_files)}")
    if dupes:
        print("절차를 2개 이상 가진 파일:")
        for f, n in sorted(dupes.items()):
            print(f"  {f}  ({n}개)")
    else:
        print("절차를 2개 이상 가진 파일: 없음")

    counts = {"가능": 0, "부분": 0, "불가": 0}
    for v in ci_values:
        counts[v] += 1
    print(f"CI 이관: 가능 {counts['가능']} · 부분 {counts['부분']} · 불가 {counts['불가']}"
          f" (합계 {sum(counts.values())})")

    if sum(counts.values()) != len(rows):
        raise SystemExit("CI 이관 합계가 절차 수와 안 맞음 — 파싱 버그 의심")


if __name__ == "__main__":
    main()
