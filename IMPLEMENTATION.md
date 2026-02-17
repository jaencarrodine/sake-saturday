# Sake Saturday — Implementation Guide

## Architecture

```
Taster → WhatsApp → Twilio webhook → OpenClaw (Jean Bot) → Sake Saturday API → Supabase
                                                                                    ↓
                                                              Taster ← Next.js (read-only)
```

Jean Bot (external) handles all conversation logic, vision extraction, and web search.
The Sake Saturday app exposes **API endpoints** for CRUD operations and serves **read-only web pages**.

## Build Order

1. Database schema (Supabase)
2. API endpoints (Next.js API routes)
3. Web app pages (read-only)
4. Twilio WhatsApp setup (separate — Jean Bot handles conversation)

---

## Phase 1: Database Schema

Run in Supabase SQL editor. Order matters (FKs depend on parent tables).

### Drop old tables

```sql
-- Migrate any useful data from kikizakes before dropping
DROP TABLE IF EXISTS kikizakes;
DROP TABLE IF EXISTS users;
```

### Create tables

```sql
CREATE TABLE sakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  prefecture TEXT,
  grade TEXT,
  type TEXT,
  rice TEXT,
  smv NUMERIC,
  polishing_ratio NUMERIC,
  alc_percentage NUMERIC,
  opacity TEXT,
  profile TEXT,
  recommended_serving_temperatures TEXT,
  bottling_company TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sakes_name ON sakes(name);

CREATE TABLE tasters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone_number TEXT UNIQUE,
  profile_pic TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tasters_phone ON tasters(phone_number);
CREATE INDEX idx_tasters_name ON tasters(name);

CREATE TABLE tastings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sake_id UUID NOT NULL REFERENCES sakes(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  location_name TEXT,
  location_coordinates POINT,
  front_image TEXT,
  back_image TEXT,
  created_by UUID REFERENCES tasters(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tastings_sake ON tastings(sake_id);
CREATE INDEX idx_tastings_date ON tastings(date DESC);

CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tasting_id UUID NOT NULL REFERENCES tastings(id) ON DELETE CASCADE,
  taster_id UUID NOT NULL REFERENCES tasters(id) ON DELETE CASCADE,
  score NUMERIC(3,1) NOT NULL CHECK (score >= 1 AND score <= 10),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tasting_id, taster_id)
);
CREATE INDEX idx_scores_tasting ON scores(tasting_id);
CREATE INDEX idx_scores_taster ON scores(taster_id);
```

### Views

```sql
CREATE VIEW sake_rankings AS
SELECT
  s.id,
  s.name,
  s.prefecture,
  s.grade,
  s.type,
  ROUND(AVG(sc.score), 1) AS avg_score,
  COUNT(DISTINCT sc.id) AS total_scores,
  COUNT(DISTINCT t.id) AS total_tastings
FROM sakes s
LEFT JOIN tastings t ON t.sake_id = s.id
LEFT JOIN scores sc ON sc.tasting_id = t.id
GROUP BY s.id
ORDER BY avg_score DESC NULLS LAST;

CREATE VIEW taster_leaderboard AS
SELECT
  ta.id,
  ta.name,
  ta.profile_pic,
  COUNT(sc.id) AS tastings_count,
  ROUND(AVG(sc.score), 1) AS avg_score_given
FROM tasters ta
LEFT JOIN scores sc ON sc.taster_id = ta.id
GROUP BY ta.id
ORDER BY tastings_count DESC;
```

### Row Level Security

```sql
ALTER TABLE sakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tastings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- Public read for web app (anon key)
CREATE POLICY "Public read sakes" ON sakes FOR SELECT USING (true);
CREATE POLICY "Public read tasters" ON tasters FOR SELECT USING (true);
CREATE POLICY "Public read tastings" ON tastings FOR SELECT USING (true);
CREATE POLICY "Public read scores" ON scores FOR SELECT USING (true);

-- Service role handles all writes (from API endpoints)
CREATE POLICY "Service write sakes" ON sakes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write tasters" ON tasters FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write tastings" ON tastings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write scores" ON scores FOR ALL USING (auth.role() = 'service_role');
```

### Storage bucket

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('sake-images', 'sake-images', true);
```

---

## Phase 2: API Endpoints

All endpoints are called by Jean Bot (external). Protected by API key in `Authorization` header.

### Auth Middleware

**File:** `lib/api/auth.ts`

```typescript
export function validateApiKey(request: Request): boolean {
  const key = request.headers.get('Authorization');
  return key === process.env.SAKE_API_KEY;
}
```

**`.env.local`:**
```env
SUPABASE_URL=https://tvypdpvnpuugxknqdbyb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx
SAKE_API_KEY=xxx
NEXT_PUBLIC_URL=https://sakesaturday.com
```

### POST /api/sakes — Create or find sake

**File:** `app/api/sakes/route.ts`

Request body:
```json
{
  "name": "Akita Shun Daiginjo",
  "prefecture": "Akita",
  "grade": "Daiginjo",
  "type": "Daiginjo",
  "rice": "Yamada Nishiki",
  "smv": 3,
  "polishing_ratio": 45,
  "alc_percentage": 15.5,
  "opacity": "Clear",
  "profile": "Smooth, fruity, floral",
  "recommended_serving_temperatures": "Chilled",
  "bottling_company": "Akita Brewing Co."
}
```

Logic:
1. Validate API key
2. Check if sake with matching name exists (case-insensitive)
3. If exists, return existing record
4. If not, insert and return new record

Response: `{ sake: { id, name, ... }, created: true/false }`

### GET /api/sakes — List sakes with rankings

**File:** `app/api/sakes/route.ts`

Query from `sake_rankings` view. Support `?search=` and `?sort=avg_score|name`.

### GET /api/sakes/[id] — Sake detail

**File:** `app/api/sakes/[id]/route.ts`

Return sake + all tastings + all scores with taster names.

### POST /api/tasters — Create or find taster

**File:** `app/api/tasters/route.ts`

Request body:
```json
{
  "name": "Zach",
  "phone_number": "+1234567890"
}
```

Logic: Find by phone_number OR name (case-insensitive). Create if not found.

Response: `{ taster: { id, name, ... }, created: true/false }`

### POST /api/tastings — Create a tasting

**File:** `app/api/tastings/route.ts`

Request body:
```json
{
  "sake_id": "uuid",
  "date": "2026-02-17",
  "location_name": "Niseko, Hokkaido",
  "front_image": "https://...",
  "back_image": "https://...",
  "created_by": "taster-uuid"
}
```

Response: `{ tasting: { id, ... } }`

### POST /api/scores — Add scores to a tasting

**File:** `app/api/scores/route.ts`

Request body:
```json
{
  "tasting_id": "uuid",
  "scores": [
    { "taster_id": "uuid", "score": 8.5, "notes": "Smooth and fruity" },
    { "taster_id": "uuid", "score": 7.0, "notes": "A bit dry" }
  ]
}
```

Logic: Upsert scores (on conflict tasting_id + taster_id, update score and notes).

Response: `{ saved: 3 }`

### POST /api/images/upload — Upload bottle image

**File:** `app/api/images/upload/route.ts`

Accept multipart form data or base64. Upload to Supabase Storage `sake-images` bucket.

Response: `{ url: "https://xxx.supabase.co/storage/v1/object/public/sake-images/xxx.jpg" }`

---

## Phase 3: Web App Pages (Read-Only)

### File Structure

```
app/
  page.tsx                     # Home — rankings, leaderboard, recent
  sake/[id]/page.tsx           # Sake detail
  tasting/[id]/page.tsx        # Tasting detail
  taster/[id]/page.tsx         # Taster profile
  api/
    sakes/
      route.ts                 # GET (list), POST (create/find)
      [id]/route.ts            # GET (detail)
    tasters/
      route.ts                 # POST (create/find)
    tastings/
      route.ts                 # POST (create)
    scores/
      route.ts                 # POST (add scores)
    images/
      upload/route.ts          # POST (upload image)
components/
  SakeCard.tsx
  ScoreBadge.tsx
  TasterCard.tsx
  TastingCard.tsx
  Leaderboard.tsx
lib/
  supabase/client.ts           # Browser client (anon key)
  supabase/server.ts           # Server client (service role for API routes)
  api/auth.ts                  # API key validation
types/
  database.ts                  # Regenerate with: pnpm gen-supabase
```

### Home Page (`app/page.tsx`)

Server component. Three sections:

1. **Sake Rankings** — grid of sake cards sorted by avg score. Each card: name, grade, avg score badge, number of tastings.
2. **Taster Leaderboard** — horizontal scroll of taster cards. Name, tastings count, avg score given.
3. **Recent Tastings** — timeline list. Sake name, date, scores summary, link to tasting page.

```typescript
const supabase = createServerClient();
const { data: sakes } = await supabase.from('sake_rankings').select();
const { data: tasters } = await supabase.from('taster_leaderboard').select();
const { data: tastings } = await supabase
  .from('tastings')
  .select('*, sakes(name, grade), scores(score, tasters(name))')
  .order('created_at', { ascending: false })
  .limit(10);
```

### Sake Page (`app/sake/[id]/page.tsx`)

- Bottle image (front)
- Name, grade, prefecture, rice, polish ratio, SMV, ABV
- Average score (large)
- All tastings for this sake with individual scores

### Tasting Page (`app/tasting/[id]/page.tsx`)

- Sake info header
- Date, location
- Score breakdown: each taster's score + notes
- Average score
- Bottle images

### Taster Page (`app/taster/[id]/page.tsx`)

- Name, profile pic
- Stats: tastings count, avg score given, highest/lowest rated
- List of all scores with sake name and date

### Design System

- Background: `#0a0a0a` to `#1a1a1a`
- Accent: warm gold `#c4a35a`
- Font: Inter + Noto Sans JP for Japanese text
- Cards: `bg-zinc-900 border-zinc-800 rounded-xl`
- Score badges: red (< 5), yellow (5-7), green (> 7)
- Responsive: mobile-first (this is primarily viewed on phones)

---

## Phase 4: Twilio WhatsApp Setup

This is handled separately from the app. Jean Bot on OpenClaw manages conversation.

1. Create Twilio account at twilio.com
2. Get a phone number with WhatsApp capability
3. Configure WhatsApp sender (Twilio Sandbox for dev, apply for production sender later)
4. Set incoming message webhook to route to OpenClaw
5. Jean Bot receives messages, handles conversation state, calls Sake Saturday API endpoints

Jean Bot's responsibilities:
- Require front AND back bottle photos before proceeding
- Use vision model to extract sake details from photos
- **Web search** to fill in missing/incomplete details (brewery info, rice variety, tasting profiles)
- Confirm details with user
- Collect scores (group or individual format)
- Call API endpoints to persist everything
- Share tasting page link when done

---

## MVP Build Checklist

1. [ ] Run SQL schema in Supabase (Phase 1)
2. [ ] Regenerate types: `pnpm gen-supabase`
3. [ ] Implement API auth middleware
4. [ ] `POST /api/sakes` — create/find
5. [ ] `POST /api/tasters` — create/find
6. [ ] `POST /api/tastings` — create
7. [ ] `POST /api/scores` — add scores
8. [ ] `POST /api/images/upload` — image upload
9. [ ] `GET /api/sakes` — list with rankings
10. [ ] Home page (`app/page.tsx`)
11. [ ] Tasting page (`app/tasting/[id]/page.tsx`)
12. [ ] Sake page (`app/sake/[id]/page.tsx`)
13. [ ] Deploy to Vercel
14. [ ] Twilio WhatsApp number setup
15. [ ] Jean Bot "sake saturday mode" configuration

## Build Later

- Taster profile pages
- Location tracking
- Stats page with map
- OG image generation for sharing
- 3D bottle render
- AI tasting summaries
- Sake recommendations
- QR code for quick tasting access
