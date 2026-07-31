alter policy "chat_messages_insert_members" on public.chat_messages
  with check (
    ((sender_id = ( SELECT auth.uid() AS uid)) AND (room_id IN ( SELECT cr.id
       FROM (chat_rooms cr
         JOIN crew_memberships cm ON ((cm.crew_id = cr.crew_id)))
      WHERE ((cm.profile_id = ( SELECT auth.uid() AS uid)) AND (cm.status = 'active'::text) AND private.is_crew_active(cr.crew_id)))))
    AND type = 'text'
  );

comment on policy "chat_messages_insert_members" on public.chat_messages is
  'I-063(36일차) 조건부 처분: WITH CHECK에 type=''text'' 게이트를 추가해 post_link 메시지의
   INSERT 자체를 막는다 — 원래 정책은 type 컬럼을 전혀 제한하지 않아, 활성 크루원이 raw
   REST로 크루 일치 없는 post_link 메시지를 삽입해 다른 크루원 화면에 오정보 카드를 띄울
   수 있었다(docs/design/post-link-card-disposition-36 §7). FR-052(게시글을 채팅에 공유)
   쓰기 경로가 실제로 생기면 이 리터럴 게이트를 단순 삭제하지 말고 크루 일치 검사로
   교체한다 — 삭제만 하면 이 구멍이 되돌아온다.';