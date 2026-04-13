INSERT INTO public.messages (
  conversation_id,
  workspace_id,
  direction,
  type,
  content,
  media_url,
  media_type,
  wamid,
  status,
  metadata,
  created_at
)
SELECT
  p.conversation_id,
  p.workspace_id,
  'inbound',
  p.message_type,
  p.content,
  p.media_url,
  p.media_type,
  p.wamid,
  'delivered',
  COALESCE(p.metadata, '{}'::jsonb),
  p.created_at
FROM public.pending_inbound p
LEFT JOIN public.messages m
  ON m.wamid = p.wamid
WHERE m.id IS NULL;