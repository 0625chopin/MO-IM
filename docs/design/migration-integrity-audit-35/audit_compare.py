#!/usr/bin/env python3
"""I-167 전수 감사 — 로컬 supabase/migrations/*.sql ↔ 원격 schema_migrations.statements 대조.

사용법(재실행 절차):
  1) supabase MCP(execute_sql)로 아래 SQL을 실행해 원격 전건을 JSON으로 받는다:

       select json_agg(json_build_object('version', version, 'stmt', statements[1])
                        order by version) as data
       from supabase_migrations.schema_migrations;

     결과가 토큰 한도를 넘으면 도구가 자동으로 파일에 저장한다(tool-results/*.txt).
     그 파일을 그대로 이 스크립트의 --raw-tool-output 인자로 넘기거나, 미리
     `{"version": "...", "stmt": "..."}` 객체 배열만 뽑아 --json 인자로 넘긴다.

  2) python3 audit_compare.py --json remote_statements.json \
         --migrations-dir ../../../supabase/migrations

이 스크립트는 원격 접근을 하지 않는다(순수 로컬 비교) — 1)의 덤프가 최신이어야 한다.

정규화 규칙(설계 근거는 README.md 참고, 여기서는 규칙만):
  - 파일 끝 트레일링 개행을 몇 개든 전부 무시한다(rstrip('\\n') — 1개만 지우는 게 아니다,
    35일차 BOARD 교차검증이 문서-구현 불일치를 잡아 정정). 이 이상의 정규화는 하지 않는다
    — 주석 한 줄 차이도 실제 사후편집일 수 있으므로(I-167 원 사례) "형식이려니" 하고
    지우지 않는다.
  - 심각도 태그는 별도 계산으로만 쓴다: '--'로 시작하는 줄(또는 빈 줄)을 제외한 나머지
    ("코드 줄")이 로컬·원격 사이에 완전히 같으면 COMMENT_ONLY, 다르면 CODE로 표시한다.
    이 태그는 보고서 우선순위 정렬용일 뿐 — CODE가 아니라고 안전하다는 뜻이 아니다.
    (COMMENT_ONLY도 "이미 적용된 파일 사후편집 금지" 규칙 위반이다.)
"""
import argparse
import hashlib
import json
import os
import re
import sys


def load_remote_statements(json_path=None, raw_tool_output_path=None):
    if json_path:
        with open(json_path, encoding="utf-8") as f:
            records = json.load(f)
        return {r["version"]: r["stmt"] for r in records}
    if raw_tool_output_path:
        with open(raw_tool_output_path, encoding="utf-8") as f:
            outer = json.load(f)
        text = outer["result"]
        m = re.search(
            r"<untrusted-data-[a-f0-9-]+>\n(.*)\n</untrusted-data-[a-f0-9-]+>",
            text,
            re.DOTALL,
        )
        inner = m.group(1)
        data = json.loads(inner)
        records = data[0]["data"]
        return {r["version"]: r["stmt"] for r in records}
    raise SystemExit("--json 또는 --raw-tool-output 중 하나가 필요하다")


def load_local(migrations_dir):
    # 버전(파일명 앞 14자리)을 키로 쓰므로, 두 파일이 같은 버전을 쓰면 뒤에 읽은 파일이
    # 앞 파일을 조용히 덮어써 그 파일 하나가 대조에서 통째로 빠진다(35일차 BOARD 교차검증
    # 지적 — I-051류 함정). 방어로 중복을 먼저 검사한다.
    filenames = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))
    versions = [fn.split("_")[0] for fn in filenames]
    dupes = sorted({v for v in versions if versions.count(v) > 1})
    if dupes:
        raise SystemExit(
            f"버전 접두어 중복 발견 — 대조가 조용히 파일을 누락시킬 수 있다: {dupes}"
        )

    local = {}
    for fn in filenames:
        version = fn.split("_")[0]
        with open(os.path.join(migrations_dir, fn), encoding="utf-8") as f:
            local[version] = (fn, f.read())
    return local


def code_lines(s):
    out = []
    for line in s.rstrip("\n").split("\n"):
        stripped = line.strip()
        if stripped == "" or stripped.startswith("--"):
            continue
        out.append(line)
    return out


def md5(s):
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="원격 [{version, stmt}, ...] JSON 파일")
    ap.add_argument("--raw-tool-output", help="execute_sql 도구 원본 저장 파일(토큰 한도 초과 시)")
    ap.add_argument("--migrations-dir", required=True)
    args = ap.parse_args()

    remote = load_remote_statements(args.json, args.raw_tool_output)
    local = load_local(args.migrations_dir)

    local_versions = set(local)
    remote_versions = set(remote)

    print(f"로컬 파일 수: {len(local_versions)}")
    print(f"원격 행 수:   {len(remote_versions)}")
    only_local = sorted(local_versions - remote_versions)
    only_remote = sorted(remote_versions - local_versions)
    if only_local:
        print(f"로컬에만 있음(원격 미적용 — I-051 패턴 의심): {only_local}")
    if only_remote:
        print(f"원격에만 있음(로컬 파일 누락): {only_remote}")

    divergent = []
    exact = 0
    for v, (fn, content) in sorted(local.items()):
        r = remote.get(v)
        if r is None:
            continue
        if content.rstrip("\n") == r.rstrip("\n"):
            exact += 1
            continue
        sev = "CODE" if code_lines(content) != code_lines(r) else "COMMENT_ONLY"
        divergent.append((v, fn, sev, md5(content), md5(r)))

    print(f"\n내용 일치(trailing-newline만 정규화): {exact}")
    print(f"내용 불일치: {len(divergent)}\n")
    for v, fn, sev, lmd5, rmd5 in divergent:
        print(f"  [{sev:12s}] {v}  {fn}")
        print(f"               local_md5={lmd5}  remote_md5={rmd5}")

    if divergent:
        sys.exit(1)


if __name__ == "__main__":
    main()
