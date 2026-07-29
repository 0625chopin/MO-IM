-- I-101 CRITICAL — meetups_insert_proposal_author_or_staff RLS's WITH CHECK never verified
-- polls.status. Any proposal author could INSERT a meetups row referencing their OWN poll
-- regardless of its status (open/closed_rejected/cancelled) via direct REST, fabricating a
-- fully-formed "confirmed" Meetup indistinguishable from a real one. Any staff/owner could
-- INSERT a meetups row using ANY poll_id in the whole database (not required to belong to
-- their own crew), fabricating a Meetup for a crew that never voted on it at all. Confirmed
-- by real REST reproduction (4/5 exploit scenarios succeeded; only a non-privileged,
-- non-author crew member was correctly blocked).
--
-- There is no BEFORE INSERT trigger on meetups (trg_meetups_guard_attendee_scope, Task 032,
-- is BEFORE UPDATE only) — RLS was the *only* gate on INSERT, and it didn't check the one
-- invariant that matters (D-003 "Meetup은 오직 투표(가결)로만 확정된다", FR-060 "행위자:
-- 시스템"). No permission-matrix action for a manual "staff creates Meetup without a poll"
-- exists — confirmed against requirements.md this is not a designed feature, it's a gap.
--
-- The one legitimate creation path is public.finalize_closed_poll (SECURITY DEFINER, owned
-- by `postgres`, invoked only from trg_finalize_closed_poll AFTER UPDATE ON polls). Table
-- owners retain full DML rights on their own tables regardless of REVOKE targeting other
-- roles, so revoking client grants does not affect this path.
--
-- Fix follows the I-090 precedent for the same domain (meetup_attendances): forbid direct
-- client writes entirely rather than trying to patch the WITH CHECK expression with more
-- conditions (poll status + poll's crew = target crew_id) — a REVOKE is fewer moving parts
-- and cannot be subtly wrong the way a hand-written boolean expression can. TRUNCATE/DELETE
-- are revoked too as hygiene (I-090 precedent again): no DELETE policy exists for meetups
-- (cancellation is `status='cancelled'` via UPDATE, FR-065 AC1) so the grant was already
-- inert, but leaving it in place is exactly the kind of "dormant grant" that opened I-090's
-- own DELETE gap once a policy was later added. UPDATE grant is untouched — it's legitimately
-- used (cancelMeetup, respond_meetup_attendance's attending_count writes) and independently
-- guarded by trg_meetups_guard_attendee_scope + meetups_update_members_scoped_by_trigger RLS.

revoke insert, delete, truncate on public.meetups from anon, authenticated;

-- Dead code after the revoke above (INSERT is blocked at the grant level before RLS is even
-- consulted) — removing it so it doesn't read as "the defense" when it no longer is one
-- (same reasoning CORE/CREW used dropping meetup_attendances_insert_self/_update_self in I-090).
drop policy if exists meetups_insert_proposal_author_or_staff on public.meetups;
