-- Migration 102: allow inbound GIFs in the chat-media bucket.
--
-- image/gif was mapped to an extension by the webhook (MIME_TO_EXT) but
-- was never on the bucket's allowed_mime_types, so every inbound GIF
-- failed the storage check and silently fell back to the proxy URL.
-- WhatsApp does deliver animated GIFs, so put the bucket back in sync.
--
-- Note: outbound is unchanged — WhatsApp's Cloud API expects animated
-- GIFs as video/mp4, so image/gif stays off the composer picker.
UPDATE storage.buckets
SET allowed_mime_types =
      COALESCE(allowed_mime_types, ARRAY[]::text[]) || ARRAY['image/gif']
WHERE id = 'chat-media'
  AND NOT (COALESCE(allowed_mime_types, ARRAY[]::text[]) @> ARRAY['image/gif']);
