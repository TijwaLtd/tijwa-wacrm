# Inbox Architecture Audit

**Date:** 2026-08-19
**Scope:** Conversation list, message thread, media handling, WhatsApp-like behavior

---

## 1. Conversation List

### Data Flow
1. `ConversationList` fetches conversations on mount via `useEffect` keyed on `[resyncToken, workspaceFilter]`
2. **Single workspace** → direct query: `supabase.from('conversations').select(CONVERSATION_SELECT).eq('account_id', workspaceFilter)`
3. **All workspaces** → RPC: `supabase.rpc('get_user_conversations', { p_user_id })` — returns flat rows normalized to conversation shape
4. `CONVERSATION_SELECT = "*, contact:contacts(*, contact_tags(tags(*)))"` — embeds contact + tags in one query
5. `normalizeConversations()` flattens the `contact_tags(tags(*))` join into `contact.tags`

### Filtering
- **Status filter:** `all | unread | open | pending | closed` — client-side on loaded data
- **Tag filter:** OR logic — conversation matches if contact has ANY selected tag
- **Company filter:** exact match on `contact.company`
- **Search:** case-insensitive substring on `contact.name`, `contact.phone`, `last_message_text`

### Realtime Updates
- Parent page subscribes to `postgres_changes` on `conversations` and `messages` tables
- INSERT: prepends new conversation + hydrates contact join (realtime payloads don't include joins)
- UPDATE: patches `last_message_text`, `last_message_at`, `unread_count` inline
- Message INSERT: patches parent conversation's preview + unread count in-place
- `knownConvIdsRef` — synchronous Set mirror of conversation IDs to avoid redundant hydrates (documented bug fix for #105/#106)

### Reconnection Safety
- `resyncToken` bumped on: WS reconnect, tab visibility → visible, manual refresh
- Children refetch when `resyncToken` changes
- `wasConnectedRef` / `initialConnectDoneRef` prevent false reconnection on initial mount

### Active State
- Active conversation highlighted with `border-l-2 border-primary bg-muted/70`
- Re-clicking same conversation bails out (no re-fetch, no message clear)
- URL reflects selection: `/inbox?c={convId}` via `router.replace`

---

## 2. Message Thread

### Message Loading
- **Every conversation open = fresh DB fetch** — no cached messages
- Effect keyed on `[conversationId, resyncToken]`
- Query: `supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })`
- Results passed to parent via `onMessagesLoadedRef.current(data ?? [])`

### Auto-Scroll
- `useEffect` on `[messages]` sets `scrollRef.current.scrollTop = scrollRef.current.scrollHeight`
- Always scrolls to bottom on new messages

### Unread Reset
- Effect on `[conversationId, hasUnread]` → `UPDATE conversations SET unread_count = 0 WHERE id = conversationId`
- Guard: only fires when `hasUnread > 0`, preventing update loops
- Optimistic: parent zeroes unread count in list immediately on click (before server round-trip)

### 24-Hour Session Timer
- Computed from last customer message via `differenceInHours`
- Shows remaining time or "Expired" badge
- Expired sessions disable free-form text but allow templates

### Date Separators
- Messages grouped by `format(new Date(msg.created_at), "yyyy-MM-dd")`
- Rendered as pill badges: "Today", "Yesterday", or "MMMM d, yyyy"

---

## 3. Message Bubble — Content Types

### Supported `content_type` values:
| Type | Rendering | Media Support |
|------|-----------|---------------|
| `text` | Plain text with `whitespace-pre-wrap` | None |
| `image` | `MediaImageBubble` — thumbnail with click-to-expand | `media_url` required |
| `video` | `MediaVideoBubble` — inline `<video>` with controls | `media_url` required |
| `audio` | `MediaAudioBubble` — `<audio>` player + download | `media_url` required |
| `document` | `MediaDocumentBubble` — filename link + download | `media_url` required |
| `template` | Badge + rendered body text | Optional header media |
| `location` | Map pin icon + text | None |
| `interactive` | `InteractivePreview` — buttons/list rendered | `interactive_payload` |
| fallback | Plain text fallback | None |

### Message Status Icons (outbound only)
| Status | Icon | Color |
|--------|------|-------|
| `sending` | Clock | muted |
| `sent` | Single check | muted |
| `delivered` | Double check | muted |
| `read` | Double check | blue |
| `failed` | X circle | red |

### AI Badge
- Shows on messages where `message.ai_generated === true`
- Sparkles icon + "AI" label on primary-filled bubbles

---

## 4. Media Handling — Full Audit

### Supported Media Types (sending)
| Kind | Picker Accept | Max Size | Notes |
|------|---------------|----------|-------|
| Image | `image/png, image/jpeg, image/webp` | 5 MB (Meta cap) | Caption allowed |
| Video | `video/mp4, video/3gpp` | 16 MB | Caption allowed |
| Audio | N/A (recorded in-browser) | 16 MB | No caption (Meta rejects) |
| Document | PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT | 16 MB | Filename shown to recipient |

### Upload Pipeline
1. User picks file or records voice → `stageUpload()` in `MessageComposer`
2. Size validated against `MEDIA_MAX_BYTES_BY_KIND[kind]`
3. Uploaded to `chat-media` bucket via `uploadAccountMedia()` → `supabase.storage.from(bucket).upload(path, file)`
4. Path convention: `account-{accountId}/{timestamp}-{safeBasename}.{ext}` (matches RLS policy)
5. Public URL obtained via `supabase.storage.from(bucket).getPublicUrl(path)`
6. Shown in draft preview with caption input (except audio)
7. On send → `POST /api/whatsapp/send` with `media_url`, `message_type`, `content_text`
8. On success → optimistic bubble replaced by realtime INSERT
9. On failure → bubble marked `failed`, orphaned storage object GC'd via `deleteAccountMedia()`

### Voice Recording
- **Library:** `opus-recorder` — encodes Ogg/Opus entirely in-browser
- **Worker:** `/opus/encoderWorker.min.js` (lazy-loaded on first record)
- **Format:** Ogg/Opus — natively playable by WhatsApp
- **Max duration:** 5 minutes (auto-stop)
- **Flow:** Start → live timer + red pulse indicator → Stop → `ondataavailable` fires → `finalizeRecording()` → File uploaded as `voice-{timestamp}.ogg`
- **No caption** — Meta rejects audio captions
- **Cancel:** discards recording, no upload

### Media Display (receiving)
| Type | Component | Behavior |
|------|-----------|----------|
| Image | `MediaImageBubble` | Blob-cached thumbnail (via `useMediaBlobUrl`), click opens `MediaLightbox`, hover shows download button |
| Video | `MediaVideoBubble` | Direct `<video>` with controls (not blob — streams), expand/download buttons |
| Audio | `MediaAudioBubble` | `<audio>` with controls + download button |
| Document | `MediaDocumentBubble` | Filename link (opens in new tab) + download button |
| Unavailable | `MediaUnavailable` | Gray placeholder with "Photo/Video/Audio unavailable" |

### Media Lightbox (`MediaLightbox`)
- Full-size viewer for images + videos in the thread
- Pages through all images/videos with ← / → arrows (keyboard + click)
- Zoom toggle on images (natural size ↔ fit-to-screen)
- Download button + open-original link
- Caption displayed below media
- Author label + timestamp in header
- Counter: "3 of 12"

### Media Gallery
- `collectMediaGallery(messages)` — filters to images + videos with `media_url`
- Only images and videos (audio has nothing to view, documents are OS-handled)
- Maintains thread order for sequential browsing

### Media Download
- `downloadMediaMessage(message)` — handles both proxy URLs and direct bucket URLs
- Uses `blob-cache` for Meta proxy URLs (which need auth headers)
- Falls back to `<a download>` for direct bucket URLs

---

## 5. Composer Features

### Text Input
- Auto-resizing textarea (max 4 lines / 96px)
- Enter to send, Shift+Enter for newline
- Reply-to support with quote preview

### Attach Menu (Paperclip)
- Photo, Video, Document, Voice Note — four options
- Each opens native file picker (except voice → starts recording)

### Plus Menu
- Interactive Message Builder — buttons/list creator
- Quick Reply Picker — saved snippets

### AI Draft
- Sparkles button → `POST /api/ai/draft` → suggested reply fills textarea
- Read-only until agent edits + sends

### Template Picker
- Opens modal with WhatsApp template list
- Supports body params, header media, button params
- Rendered body shown in optimistic bubble

---

## 6. WhatsApp-Like Behaviors Present

| Feature | Status | Notes |
|---------|--------|-------|
| Chat bubbles (right=agent, left=customer) | ✅ | Rounded corners, primary/muted fill |
| Message status ticks (✓ ✓✓ blue) | ✅ | Clock → Check → Double-check → Blue double-check |
| Date separators ("Today", "Yesterday") | ✅ | Pill badges between message groups |
| Auto-scroll to bottom | ✅ | On new messages |
| Reply/quote | ✅ | Inline quote preview above bubble |
| Reactions (emoji) | ✅ | WhatsApp's 6-emoji quick bar (👍❤️😂😮😢🙏) |
| Voice notes | ✅ | In-browser Ogg/Opus recording, no server transcode |
| Image viewer (tap to expand) | ✅ | Full lightbox with zoom, ←/→ navigation |
| Video player (inline) | ✅ | Native `<video>` controls |
| Document sharing | ✅ | Filename link + download |
| Interactive messages (buttons/lists) | ✅ | Builder + preview |
| Template messages | ✅ | With param substitution |
| 24-hour session timer | ✅ | Badge in header, expires free-form text |
| Read receipts (blue ticks) | ✅ | `content_type` → `status` flow |
| Typing indicator | ❌ | Not implemented |
| Online/offline presence | ✅ | Via `usePresence` hook + `PresenceDot` |
| Unread badge | ✅ | Per-conversation count, optimistic zero on click |
| Contact sidebar | ✅ | Tags, deals, notes — collapsible |
| Agent assignment | ✅ | Dropdown with presence indicators |
| Status workflow (open/pending/closed) | ✅ | Dropdown in thread header |
| Mobile back navigation | ✅ | Single-pane mobile, back arrow |
| Deep-link support | ✅ | `?c={convId}` URL param |
| WhatsApp doodle background | ✅ | SVG tile pattern in chat area |

---

## 7. Gaps / Missing vs WhatsApp

| Gap | Severity | Notes |
|-----|----------|-------|
| Typing indicator | Medium | No real-time "typing..." bubble |
| Sticker support | Low | Not in `content_type` enum |
| GIF support | Low | Could send as video, no native GIF picker |
| Contact/vCard sharing | Low | Not in `content_type` enum |
| Location sharing (inbound) | Low | `location` type exists for display but no map embed |
| Message forwarding | Low | No forward action in `MessageActions` |
| Star/pin messages | Low | No star/pin feature |
| Search within conversation | Low | No thread-level search |
| Threaded replies (nested) | Low | Flat reply-to only, no nested threads |

---

## 8. Key Files Reference

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/inbox/page.tsx` | Inbox page — owns all state, realtime, routing |
| `src/components/inbox/conversation-list.tsx` | Left panel — conversation list with filters |
| `src/components/inbox/message-thread.tsx` | Center panel — message thread, header, composer |
| `src/components/inbox/message-bubble.tsx` | Individual message rendering per content_type |
| `src/components/inbox/message-media.tsx` | Media bubble renderers (image/video/audio/document) |
| `src/components/inbox/message-composer.tsx` | Input area — text, attach, voice, AI draft, interactive |
| `src/components/inbox/message-actions.tsx` | Hover/long-press toolbar (reply, react, copy) |
| `src/components/inbox/media-lightbox.tsx` | Full-size image/video viewer with navigation |
| `src/components/inbox/contact-sidebar.tsx` | Right panel — contact details, tags, deals |
| `src/lib/inbox/conversations.ts` | Conversation select, normalize, filter helpers |
| `src/lib/media/gallery.ts` | Media gallery collection for lightbox |
| `src/lib/media/download.ts` | Media download with blob-cache support |
| `src/lib/storage/upload-media.ts` | Account-scoped media upload/delete |
| `src/hooks/use-media-blob-url.ts` | Blob URL hook for proxied media |
| `src/types/index.ts` | Message, ContentType, SenderType definitions |
