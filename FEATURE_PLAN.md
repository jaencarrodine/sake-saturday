# Sake Saturday — Feature Plan v2

## 1. Phone-to-Profile Linking (Privacy-Safe)

**Problem:** Sake Sensei talks to people via WhatsApp phone numbers, but taster profiles have no phone linkage.

**Approach:**
- Add `phone_hash` column to `tasters` (SHA-256 of normalized phone number) — never store raw numbers in the tasters table
- The WhatsApp webhook already has the sender's phone. When Sake Sensei interacts with someone, hash their number and look up the taster by `phone_hash`
- A separate `taster_phone_links` table stores `taster_id` + `phone_hash` (no raw number stored in any user-facing table)
- The WhatsApp handler resolves phone → taster using the hash, but the phone number itself only lives in the WhatsApp message context (already in `whatsapp_messages` table)
- **No phone numbers ever exposed through the app UI or API**

**Flow:** User texts Sake Sensei → hash their number → match to taster profile → context-aware conversation

**DB Changes:**
```sql
ALTER TABLE tasters ADD COLUMN phone_hash TEXT UNIQUE;
CREATE INDEX idx_tasters_phone_hash ON tasters(phone_hash);
```

---

## 2. Multi-Message Agent Flow

**Problem:** Currently the agent sends one reply per interaction. Real conversations need multiple messages (acknowledge → process → respond → ask follow-up).

**Approach:**
- Refactor `processAndReply` to support sending multiple Twilio messages per interaction
- Give tools the ability to send intermediate messages (e.g., "Analyzing your sake photo..." before running the analysis)
- Flow example for sake submission:
  1. User sends sake photo
  2. Agent: "Let me take a look at that bottle..." (immediate acknowledgment)
  3. Agent runs vision analysis + sake research tool
  4. Agent: "Found it! This is Dewazakura Oka Ginjo from Yamagata..." (summary with details)
  5. Agent: "I filled in what I could find. Anything you want to add or correct?" (follow-up)
- The Twilio client should be accessible from tool execute functions, or tools return a `messages: string[]` array that gets sent sequentially

---

## 3. Sake Research & Auto-Fill

**Problem:** When a sake is identified (from photo or name), we only store what the user tells us. We should research and fill as many fields as possible.

**Approach:**
- Add a `research_sake` tool that takes a sake name/details and searches for:
  - Brewery/bottling company
  - Prefecture
  - Grade/type
  - Rice variety
  - Polishing ratio
  - ABV
  - SMV
  - Tasting notes / flavor profile
- Use the AI model's knowledge + optionally web search
- Auto-fill missing fields in the sake record
- Present the researched info to the user for confirmation

---

## 4. Admin Privileges (Jaen's Number)

**Problem:** Need an admin who can manage all data via WhatsApp.

**Jaen's number:** `whatsapp:+14439941537`

**Approach:**
- Define `ADMIN_NUMBERS` constant (or env var) with admin phone numbers
- In the webhook handler, check if the sender is an admin
- Pass `isAdmin` flag to `processMessage`
- **Admin-only tools** (only loaded when `isAdmin === true`):
  - `admin_edit_sake` — update any sake field
  - `admin_edit_taster` — update any taster profile (name, rank override, etc.)
  - `admin_edit_tasting` — modify tasting details, scores, delete tastings
  - `admin_delete_record` — delete sakes, tasters, tastings, scores
  - `admin_list_all` — list all records in any table with filters
- Regular users only get the standard tools (identify, create tasting, record scores, etc.)
- Admin tools include the standard tools too
- System prompt gets an admin addendum when `isAdmin` is true

---

## 5. Post-Tasting Profile Setup Flow

**Problem:** Tastings have tasters by name only, no profiles set up, no way to connect them later.

**After a tasting is recorded, Sake Sensei should:**
1. Check which tasters in the group DON'T have profiles (no phone link, no profile pic)
2. Ask the tasting creator: "Want to set up profiles for your crew?"
3. For each unlinked taster:
   - Fuzzy-match against existing tasters (name similarity + same tasting group history) to avoid duplicates
   - Ask "Is this the same Ade from the Feb 17 tasting?" if ambiguous
   - Optionally invite them via WhatsApp link to claim their profile
4. Generate rank-based AI profile pics for newly set up profiles (see #7)

**Dedup logic:**
- Exact name match → same person (confirm with creator)
- Fuzzy name match (Levenshtein ≤ 2) + shared tasting history → likely same person
- New name, no matches → create new taster

---

## 6. Rank Awareness & Level-Up Notifications

**Problem:** The rank system exists in code (`lib/tasterRanks.ts`) but the agent doesn't use it.

**Current Ranks:**
| Rank | Kanji | Min Sakes |
|------|-------|-----------|
| Murabito (Villager) | 村人 | 0 |
| Ashigaru (Foot Soldier) | 足軽 | 3 |
| Ronin | 浪人 | 6 |
| Samurai | 侍 | 10 |
| Daimyō (Feudal Lord) | 大名 | 15 |
| Shōgun | 将軍 | 20 |
| Tennō (Emperor) | 天皇 | 30 |

**After each tasting, Sake Sensei should:**
1. Calculate each taster's updated sake count
2. Check if anyone leveled up (compare before/after rank)
3. Generate a tasting summary message:
   ```
   Tasting Complete — Dewazakura Daiginjo
   
   Scores: Jaen 8.5 | Ade 7.0 | Claire 9.0
   Average: 8.2
   
   Level Ups:
   Jaen → 侍 Samurai (10 sakes tasted!)
   Claire → 足軽 Ashigaru (3 sakes!)
   
   Next milestones:
   Ade: 2 more to Ashigaru
   ```
4. If someone hit a new rank → trigger AI profile pic generation + share in chat

**New Sake Sensei tools:**
- `get_taster_rank` — returns current rank, progress, next milestone
- `get_tasting_summary` — generates the post-tasting recap with level-ups

---

## 7. AI Image System (Unified)

**Art Direction:** Cyberpunk Edo Pixel Art (see `STYLE_GUIDE.md`)

Three types of AI-generated images, all following the same style guide:

### 7a. Profile Pictures (Rank-Based)

**Flow:**
1. When a new taster is created, the agent asks for a **base photo** (selfie/photo of the person)
2. Base photo is stored as `source_photo_url` on the taster
3. Agent generates their first profile pic using the base photo + their current rank prompt
4. **Every time their rank changes**, a new profile pic is generated with the new rank's scene
5. Generated image is shared in the WhatsApp chat and set as their profile pic
6. If no base photo provided, generate a stylized avatar (silhouette/symbolic, no face)

**Rank-specific scenes:**
| Rank | Scene |
|------|-------|
| Murabito | Humble farmer in neon-lit village, simple clothes with circuit patterns |
| Ashigaru | Foot soldier with bamboo spear and light cyber-armor, holographic targets |
| Ronin | Lone swordsman in rain, tattered cloak with glowing seams, neon alley |
| Samurai | Full cyber-armored warrior, holographic katana, cherry blossom glitch storm |
| Daimyō | Noble lord in circuit-thread robes, holographic maps, gold and cyan neon |
| Shōgun | Warlord in mech-enhanced armor, floating tactical displays, red and cyan |
| Tennō | Divine emperor on golden throne, holographic light, floating neon kanji |

### 7b. Sake Bottle Art (AI-Generated)

- When a sake is added, generate a stylized Cyberpunk Edo bottle portrait
- Uses the bottle photo (if provided) as source for the AI edit
- Displayed on the sake detail page alongside/instead of the raw photo
- Prompt: base style prefix + "sake bottle portrait, dramatic lighting, the bottle rendered as a glowing artifact with neon label, circuit-pattern condensation, cyberpunk bar counter setting"

### 7c. Tasting Images (Group Photo Transform)

- Users submit group photos from tastings
- AI transforms them into Cyberpunk Edo scenes (samurai era, neon dojo, etc.)
- Displayed on the tasting page
- Agent shares the transformed image in the WhatsApp chat after generation

### Image Generation Infrastructure

- Use Gemini (Nano Banana Pro) API for all image generation
- Store images in Supabase Storage
- `tasting_images` table already exists for tasting images
- Add `ai_bottle_image_url` to `sakes` table
- Add `source_photo_url`, `ai_profile_image_url`, `rank_at_generation` to `tasters` table
- **Agent sends generated images via Twilio MMS** in the WhatsApp chat so users see results immediately

**DB Changes:**
```sql
ALTER TABLE tasters ADD COLUMN source_photo_url TEXT;
ALTER TABLE tasters ADD COLUMN ai_profile_image_url TEXT;
ALTER TABLE tasters ADD COLUMN rank_at_generation TEXT;
ALTER TABLE sakes ADD COLUMN ai_bottle_image_url TEXT;
ALTER TABLE tastings ADD COLUMN summary JSONB;
```

---

## Implementation Order

1. **Admin privileges** — quick win, needed for testing
2. **Multi-message agent flow** — foundation for better UX
3. **Phone linking + dedup** — foundation for profiles
4. **Sake research & auto-fill** — better data quality
5. **Rank awareness in Sake Sensei** — new tools + prompts
6. **Post-tasting summary with level-ups** — uses rank awareness
7. **Profile setup flow** — uses phone linking + dedup
8. **AI image system** — profile pics, sake art, tasting transforms

---

## Status

- [x] Art direction chosen: Cyberpunk Edo Pixel Art
- [x] Style guide committed: `STYLE_GUIDE.md`
- [x] Tasting images feature merged (PR #8, #10)
- [x] WhatsApp bot working with Vercel AI SDK
- [x] Cyberpunk Terminal design direction chosen
- [x] Fix tool schemas (inputSchema + stopWhen in agent loop)
- [x] Admin privileges (admin phone gate + admin tool suite + admin prompt addendum)
- [x] Multi-message agent flow foundation (`send_message` tool supports intermediate WhatsApp messages)
- [ ] Phone linking (in progress: phone hash migration + taster phone-link resolution wired in code)
- [ ] Sake research & auto-fill
- [ ] Rank awareness tools
- [ ] Post-tasting summaries
- [ ] Profile setup flow
- [ ] AI profile pic generation
- [ ] AI sake bottle art
- [ ] Tasting image transforms via agent
