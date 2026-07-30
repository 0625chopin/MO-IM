# I-057 검증 — 비밀번호 재설정 이메일 템플릿 실왕복 판정

- **일자**: 2026-07-30(29일차, 팀장 지시로는 30일차 배치) / **담당**: CORE / **관련**: I-057
- **번호 규칙**: 이 문서는 새 번호를 붙이지 않는다(D-082). I-057의 상태 갱신(해소/유지)만 이
  문서의 판정에 따라 `docs/ISSUES.md`에 팀장이 반영한다.
- **승인 근거**: 사용자가 "실제 메일 1회 발송 후 확인"을 명시적으로 승인함(팀장 배정 지시,
  30일차). Gmail SMTP 시간당 한도 때문에 **재시도 없이 정확히 1회만** 발송했다.

## 1. 코드가 기대하는 링크 계약 (발송 전 확정)

`src/app/(shell)/auth/confirm/route.ts`(`GET`)가 유일한 소비자다. 이 라우트가 실제로
읽는 쿼리 파라미터는 다음 3개뿐이다(코드 30~34행):

| 파라미터 | 필수 | 값 | 처리 |
| --- | --- | --- | --- |
| `token_hash` | 예 | PKCE 토큰 해시 | `verifyEmailOtp(type, tokenHash)` → `supabase.auth.verifyOtp({ type, token_hash })` |
| `type` | 예 | `"signup" \| "recovery"` | 이 두 값이 아니면 이 분기 자체를 타지 않음(35행 `if`) |
| `next` | 아니오(없으면 빈 문자열) | 리다이렉트 목적지 | `sanitizeRedirectTarget()`으로 오픈 리다이렉트 방어 후 성공 시 `redirect(next)` |

**둘 중 하나라도 없거나(`token_hash` 없음, `type`이 signup/recovery가 아님) `verifyEmailOtp`가
실패를 반환하면** 무조건 `/auth/confirm-error`로 리다이렉트한다(43행) — 중간 분기가 없다.

이 계약을 만족하려면 대시보드 이메일 템플릿(FR-003용, "Reset Password")이 Supabase 공식
Next.js PKCE 패턴대로

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password/confirm
```

형태여야 한다. 이 값을 대시보드에서 MCP로 조회하는 도구는 없다(I-057 원문, 19일차 재확인과
동일한 결론 — `search_docs`/`get_logs`/`execute_sql`/`list_*` 어디에도 이메일 템플릿 접근
경로가 없다). **템플릿이 기본값(`{{ .ConfirmationURL }}`)이면** 링크가

```
https://{project-ref}.supabase.co/auth/v1/verify?token={{ .TokenHash }}&type=recovery&redirect_to=...
```

형태로 발급된다 — `token_hash`가 아니라 `token`이고, 이 라우트가 아니라 Supabase 자체
`/verify` 엔드포인트로 직접 가서 리다이렉트되므로 이 프로젝트의 `/auth/confirm` 라우트를
전혀 거치지 않는다. **이 두 형태 중 어느 쪽인지는 실제 수신 메일의 링크를 보기 전까지는
추측하지 않는다** — 배정 지시대로 관측된 URL만 근거로 삼는다.

`requestPasswordReset(email, redirectTo)`(`src/lib/auth/session.ts`)가 `redirectTo`로
넘기는 값은 호출자(`requestPasswordResetAction`, `src/lib/actions/request-password-reset.ts`)가
요청 헤더에서 조립한 `${protocol}://${host}/reset-password/confirm`이다 — 로컬 개발 서버 기준
`http://localhost:3000/reset-password/confirm`.

## 2. 실제 발송 (1회만)

`POST {SUPABASE_URL}/auth/v1/recover?redirect_to=http%3A%2F%2Flocalhost%3A3000%2Freset-password%2Fconfirm`
을 publishable key(`apikey` 헤더)로, 본문 `{"email":"chopin0625@gmail.com"}`으로 정확히
1회 호출했다.

| 항목 | 값 |
| --- | --- |
| 요청 시각(UTC) | 2026-07-30T05:00:08Z (curl 시작) |
| HTTP 상태 코드 | **200** |
| 응답 본문 | `{}` |
| `redirect_to` | `http://localhost:3000/reset-password/confirm` |
| 대상 이메일 | `chopin0625@gmail.com` |

**`get_logs(service: "auth")` 교차 확인** — 같은 요청이 GoTrue 쪽에도 정상 접수됨을 확인했다:

```
action: "user_recovery_requested"
actor_id: "30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a"
actor_username: "chopin0625@gmail.com"
path: "/recover"
method: "POST"
status: 200
referer: "http://localhost:3000/reset-password/confirm"
request_id: "019fb164-ed5d-76ca-8a9f-0e1ebd6aa632"
time: "2026-07-30T05:00:13Z"
```

**19일차(DESIGN) 재시도와 같은 결론이 이번에도 성립한다**: 이 API 로그는 GoTrue가 요청을
정상 접수했음만 보여주고, 실제 발송된 메일 본문·링크 형식(`token_hash` PKCE vs 구식
`ConfirmationURL`)은 담지 않는다. **판정은 실제 수신 메일의 링크를 봐야 끝난다.**

## 3. 링크 왕복 판정 — 대기 중

이 절은 팀장이 사용자에게 메일함의 실제 링크를 요청해 CORE에게 전달한 뒤 채운다. 판정 절차:

1. 수신한 링크의 쿼리 파라미터를 확인한다.
2. `token_hash`(정확히 이 이름) + `type=recovery` 존재 → **PKCE 템플릿 확정** → `/auth/confirm`
   라우트가 실제로 호출되는 정상 계약 → **I-057 해소**로 판정.
3. `token`(`token_hash`가 아님) 또는 링크 호스트가 `{project-ref}.supabase.co/auth/v1/verify`
   → **기본 템플릿(`ConfirmationURL`) 확정** → `/auth/confirm` 라우트를 거치지 않음 →
   **I-057 (C) 유지**(대시보드 템플릿을 PKCE로 바꿔야 해소)로 판정.
4. 메일이 도착하지 않았거나 확인 자체가 불가능했다면(예: 발신자가 확인할 수단이 끊김)
   **그 사실 자체를 결과로 기록**하고 "열림, 검증 수단 재확보 필요"로 판정 — 성공한 것처럼
   쓰지 않는다.

### 판정 결과 — 30일차 마감 시점: **판정 4번 · I-057 (C) 유지**

**링크를 전달받지 못한 채 회차가 마감됐다.** 팀장이 사용자에게 두 차례 링크 회신을 요청했고
(회차 중반·마감 직전), 마감 시점에 사용자가 **"링크 없이 마감 — (C) 유지"**를 명시적으로
선택했다. 따라서 위 판정 기준 중 **4번**이 적용된다 — 템플릿이 PKCE인지 기본형인지는
**여전히 미확정**이다.

**이번 회차가 실제로 확정한 것과 확정하지 못한 것을 구분해 둔다** — 이 구분이 다음 회차의
출발점이다:

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| GoTrue가 재설정 요청을 접수하는가 | **확정 — 예** | `POST /auth/v1/recover` → HTTP 200, `get_logs(auth)`에 `user_recovery_requested`·status 200(§2). DESIGN이 교차검증에서 `/recover` 요청이 **정확히 1건**임을 독립 카운트 |
| 코드가 기대하는 링크 계약 | **확정** | `token_hash`+`type`(signup\|recovery) 필수, `next` 선택(§1) — 발송 **전에** 문서화됐다 |
| 실제 메일이 발송·도달했는가 | **미확정** | 수신 확인이 없다. GoTrue 접수(200)는 SMTP 전달 성공을 의미하지 않는다 |
| 대시보드 템플릿이 PKCE인가 | **미확정** | 이 판정의 유일한 근거인 수신 링크가 없다 |

**다음에 이 건을 집을 때 추가 발송이 필요한지**: 그렇다 — 이번 발송(2026-07-30T05:00:08Z)의
링크를 사후에 확인할 수 있다면 재발송 없이 판정이 끝나지만(토큰 만료 전이라면), 확인할 수
없으면 1회 재발송이 필요하다. **판정 기준(§1)과 판정 절차는 이 문서에 이미 완성돼 있으므로
링크만 확보되면 즉시 끝난다** — 다시 조사할 필요는 없다.

**(C) 소진 경로 관점에서**: 29일차가 실증한 세 번째 경로("원문이 기다린다고 적은 조건이 이미
충족돼 있는지 확인")는 이 건에 적용되지 않았다. I-057이 기다리는 것은 **팀 밖의 계정 접근
권한**이고, 그것은 조용히 충족될 성질이 아니다 — 29일차 트리아지 §6이 남은 4건에 대해
"실제로 줄어들 여지는 I-040보다 작다"고 적은 예상이 이번 회차에 그대로 확인됐다.

## 4. 남긴 것

- 재시도·반복 발송은 하지 않았다(Gmail SMTP 시간당 한도 보호, 배정 지시 준수) — 이 문서의
  1회 호출이 이 회차의 유일한 실측 기회다.
- 대시보드 이메일 템플릿 값을 MCP로 직접 조회하는 방법은 여전히 없다(I-057 원문·19일차
  재확인과 동일 결론) — 이번에도 간접 관측(수신 링크)에 의존한다.
