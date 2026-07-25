/**
 * 댓글 본문 필수 입력 검증 — 순수 함수(NFR-036, R-015, Task 041). `post-content-validation.ts`
 * 와 같은 원칙 — 글자 수 상한은 요구사항 문서에 값이 없어 임의로 두지 않는다.
 */
export type CommentContentViolation = "body_required";

/** 앞뒤 공백만 있는 입력은 빈 값으로 취급한다. */
export function validateCommentContent(body: string): CommentContentViolation[] {
  return body.trim().length === 0 ? ["body_required"] : [];
}
