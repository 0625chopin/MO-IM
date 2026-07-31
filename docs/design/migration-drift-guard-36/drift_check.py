#!/usr/bin/env python3
"""I-051 3종 드리프트 실측 스크립트 (36일차, CORE) — 존재·이름 축 전용.

`docs/design/migration-integrity-audit-35/audit_compare.py`(35일차, I-167)는 **내용**(같은
버전 키에 대해 로컬 파일과 원격 `statements`가 바이트 단위로 같은가) 축을 감사한다. 이
스크립트는 그 옆에 있는 **존재·이름** 축을 감사한다 — I-051이 실제로 걸린 함정은 내용
불일치가 아니라 "그 버전의 파일이 아예 있는가/맞는 이름인가"였다(17·19·27일차 세 번).

드리프트 세 종류(36일차 배정 정의):
  (a) 원격에만 있고 로컬 파일이 없음 — "로컬 파일 누락"
  (b) 로컬에만 있고 원격에 없음 — "원격 미적용"
  (c) 양쪽에 다 있으나 파일명 버전 접두어가 원격 version과 불일치 — "파일명 오기재"
      (27일차 CORE 본인이 실제로 겪은 사례: 원격 version 대신 회차 시각 임의값을 파일명에 씀)

**35일차 `audit_compare.py`의 커버 범위(코드 근거, README §2 "커버 범위 판정" 참고)**:
  - `only_local = local_versions - remote_versions`(108행) → (b)를 잡는다(111행이 "I-051
    패턴 의심"이라고 직접 명명한다)
  - `only_remote = remote_versions - local_versions`(109행) → (a)를 잡는다(113행)
  - (c)는 **잡지 못한다.** `load_local`(59행)이 파일명 앞 14자리를 그대로 "버전"으로 신뢰해
    키로 쓰므로(64행 `versions = [fn.split("_")[0] for fn in filenames]`), 파일명이 잘못돼
    있으면 그 잘못된 값이 곧 로컬 버전 그 자체가 된다 —
    원격 진짜 버전과 매칭될 수 없으니 **그 한 건이 (a)와 (b) 각각 한 줄씩, 서로 무관한 두
    항목으로 갈라져 출력된다.** 즉 (c) 사례가 실제로 발생해도 "파일명이 잘못됐다"고 알려주는
    대신 "로컬에 파일이 없다"+"원격에 적용 안 됐다"는 **가짜 이중 경보**로 나타난다 — 27일차에
    실제로 이 오탐 형태로 나타난 적이 있다(팀장이 눈으로 직접 대조해서만 잡아냈다).

**이 스크립트가 메우는 것**: (a)/(b) 차집합을 구한 뒤, **마이그레이션 이름**(원격
`schema_migrations.name` 컬럼 vs 로컬 파일명의 버전 접두어 뒤 부분)으로 교차 매칭한다.
이름이 같으면 "버전 접두어만 다른 같은 마이그레이션"으로 판정해 (c)로 재분류한다 — 진짜
(a)/(b)는 이 교차 매칭에서 남는 잔여만 해당한다.

전제: 원격 마이그레이션 이름이 로컬 파일명 규칙(`<version>_<name>.sql`)과 동일한 `name`을
쓴다 — Supabase CLI/‵apply_migration`이 실제로 그렇게 기록한다(134건 실측으로 확인, README
참고). 이름까지 우연히 같고 버전도 둘 다 어긋나는 두 개의 무관한 마이그레이션이 있다면
오매칭 가능성이 있으므로, 그런 이름 충돌이 있으면 스크립트가 경고하고 자동 재분류하지 않는다.

사용법:
  python3 drift_check.py --remote-json remote_versions.json --migrations-dir ../../../supabase/migrations

  remote_versions.json 은 [{"version": "...", "name": "..."}, ...] 형태 — 아래 SQL로 뽑는다:
    select json_agg(json_build_object('version', version, 'name', name) order by version) as data
    from supabase_migrations.schema_migrations;
"""
import argparse
import json
import os
import sys


def load_remote(path):
    with open(path, encoding="utf-8") as f:
        records = json.load(f)
    remote = {}
    for r in records:
        remote[r["version"]] = r["name"]
    if len(remote) != len(records):
        raise SystemExit("원격 JSON에 버전 중복이 있다 — 먼저 원본 덤프를 확인하라")
    return remote


def load_local(migrations_dir):
    filenames = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))
    versions = [fn.split("_", 1)[0] for fn in filenames]
    dupes = sorted({v for v in versions if versions.count(v) > 1})
    if dupes:
        raise SystemExit(f"로컬 버전 접두어 중복 — 대조가 파일을 누락시킬 수 있다: {dupes}")

    local = {}
    for fn in filenames:
        version, _, rest = fn.partition("_")
        name = rest[:-4] if rest.endswith(".sql") else rest  # strip .sql
        local[version] = (fn, name)
    return local


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--remote-json", required=True, help="[{version, name}, ...] 원격 덤프")
    ap.add_argument("--migrations-dir", required=True)
    args = ap.parse_args()

    remote = load_remote(args.remote_json)
    local = load_local(args.migrations_dir)

    remote_versions = set(remote)
    local_versions = set(local)

    matched_versions = remote_versions & local_versions
    only_remote_versions = remote_versions - local_versions  # 후보 (a)
    only_local_versions = local_versions - remote_versions  # 후보 (b)

    print(f"원격 행 수: {len(remote_versions)}")
    print(f"로컬 파일 수: {len(local_versions)}")
    print(f"버전 일치(양쪽에 같은 버전 존재): {len(matched_versions)}\n")

    # --- 이름 기준 교차 매칭으로 (c)를 (a)/(b) 후보에서 분리 ---
    # remote name -> version (only_remote 쪽), local name -> version (only_local 쪽)
    remote_by_name = {}
    for v in only_remote_versions:
        remote_by_name.setdefault(remote[v], []).append(v)
    local_by_name = {}
    for v in only_local_versions:
        local_by_name.setdefault(local[v][1], []).append(v)

    renamed = []  # (c): (local_version, local_fn, remote_version, remote_name)
    ambiguous_names = []
    for name, remote_vs in remote_by_name.items():
        local_vs = local_by_name.get(name)
        if not local_vs:
            continue
        if len(remote_vs) > 1 or len(local_vs) > 1:
            # 같은 이름을 가진 후보가 여러 건 — 자동 매칭하지 않고 사람 판단으로 넘긴다
            ambiguous_names.append((name, sorted(remote_vs), sorted(local_vs)))
            continue
        r_v = remote_vs[0]
        l_v = local_vs[0]
        renamed.append((l_v, local[l_v][0], r_v, name))

    renamed_remote_versions = {r_v for (_, _, r_v, _) in renamed}
    renamed_local_versions = {l_v for (l_v, _, _, _) in renamed}

    true_only_remote = sorted(only_remote_versions - renamed_remote_versions)
    true_only_local = sorted(only_local_versions - renamed_local_versions)

    print("=== (a) 원격에만 있음 — 로컬 파일 누락 ===")
    if true_only_remote:
        for v in true_only_remote:
            print(f"  {v}  {remote[v]}")
    else:
        print("  0건")

    print("\n=== (b) 로컬에만 있음 — 원격 미적용 ===")
    if true_only_local:
        for v in true_only_local:
            fn, name = local[v]
            print(f"  {v}  {fn}")
    else:
        print("  0건")

    print("\n=== (c) 양쪽에 다 있으나 파일명 버전 접두어가 원격 version과 불일치 ===")
    if renamed:
        for l_v, fn, r_v, name in sorted(renamed, key=lambda x: x[2]):
            print(f"  로컬 파일 {fn}  (파일명 버전 {l_v})  ↔  원격 version {r_v}  (name={name})")
    else:
        print("  0건")

    if ambiguous_names:
        print("\n=== 이름 충돌로 자동 재분류하지 않은 후보(사람 확인 필요) ===")
        for name, remote_vs, local_vs in ambiguous_names:
            print(f"  name={name}  원격 후보={remote_vs}  로컬 후보={local_vs}")

    print(f"\n요약: (a)={len(true_only_remote)}건 (b)={len(true_only_local)}건 (c)={len(renamed)}건"
          f" 모호={len(ambiguous_names)}건")

    if true_only_remote or true_only_local or renamed or ambiguous_names:
        sys.exit(1)


if __name__ == "__main__":
    main()
