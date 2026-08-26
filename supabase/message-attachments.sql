-- Slice 4c: attachments shown on the conversation bubble. Each message can carry
-- the files that arrived with it — [{ fileName, docId }] linking to matter_messages'
-- stored documents. Inbound only for now (the client's attachments).

alter table matter_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
