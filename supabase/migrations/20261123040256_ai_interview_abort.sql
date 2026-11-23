-- Rejecting or withdrawing an application ends its open AI interview (closeOpenScheduling), and staff
-- do that as themselves. Without an update grant every such decision failed. Editors may only move
-- an open session to "aborted"; everything else about sessions stays with server code.

grant update (status) on public.ai_interview_sessions to authenticated;

create policy ai_interview_sessions_abort on public.ai_interview_sessions
  for update to authenticated
  using (private.can_edit_client(org_id, client_id) and status in ('invited', 'started'))
  with check (private.can_edit_client(org_id, client_id) and status = 'aborted');
