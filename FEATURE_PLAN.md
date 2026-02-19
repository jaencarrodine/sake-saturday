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

## 2. Post-Tasting Profile Setup Flow

**Problem:** Tastings have tasters by name only, no profiles set up, no way to connect them later.

**After a tasting is recorded, Sake Sensei should:**
1. Check which tasters in the group DON'T have profiles (no phone link, no profile pic)
2. Ask the tasting creator: "Want to set up profiles for your crew?"
3. For each unlinked taster:
   - Fuzzy-match against existing tasters (name similarity + same tasting group history) to avoid duplicates
   - Ask "Is this the same Ade from the Feb 17 tasting?" if ambiguous
   - Optionally invite them via WhatsApp link to claim their profile
4. Generate rank-based AI profile pics for newly set up profiles (see #4)

**Dedup logic:**
- Exact name match → same person (confirm with creator)
- Fuzzy name match (Levenshtein ≤ 2) + shared tasting history → likely same person
- New name, no matches → create new taster

---

## 3. Rank Awareness & Level-Up Notifications

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
4. If someone hit a new rank → trigger AI profile pic generation

**New Sake Sensei tools:**
- `get_taster_rank` — returns current rank, progress, next milestone
- `get_tasting_summary` — generates the post-tasting recap with level-ups

---

## 4. Rank-Based AI Profile Pictures

**Problem:** Tasters have no profile pics. The rank system is cool but purely text.

**Art Direction:** Cyberpunk Edo Pixel Art (see `STYLE_GUIDE.md`)

**Approach:**
- When a taster levels up OR sets up their profile for the first time:
  1. If they have a photo (selfie, group photo crop) → use it as source
  2. Generate via Gemini (Nano Banana): rank-specific cyberpunk Edo prompt
  3. Store as their profile pic, replacing the old one on level-up

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

- If no source photo: generate stylized avatar (silhouette/symbolic, no face)
- Store both source photo and generated pic for re-generation on level-up

**DB Changes:**
```sql
ALTER TABLE tasters ADD COLUMN source_photo_url TEXT;
ALTER TABLE tasters ADD COLUMN rank_at_generation TEXT;
ALTER TABLE tastings ADD COLUMN summary JSONB;
```

---

## Implementation Order

1. **Phone linking + dedup** — foundation for everything else
2. **Rank awareness in Sake Sensei** — new tools + prompts
3. **Post-tasting summary with level-ups** — uses rank awareness
4. **Profile setup flow** — uses phone linking + dedup
5. **Cyberpunk Edo profile pic generation** — uses rank awareness + image gen

---

## Status

- [x] Art direction chosen: Cyberpunk Edo Pixel Art
- [x] Style guide committed: `STYLE_GUIDE.md`
- [x] Tasting images feature merged (PR #8, #10)
- [ ] Phone linking
- [ ] Rank awareness tools
- [ ] Post-tasting summaries
- [ ] Profile setup flow
- [ ] AI profile pic generation
