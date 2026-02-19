-- RLS, kikizake scores structure, and auth
-- Owner can modify tasting data; tasters can modify their own scores/notes only if allowed

-- Sync auth.users to public.users on signup (so owner FK works)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add columns to kikizakes for tasting flow (notes, location - scores in separate table)
ALTER TABLE kikizakes
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS location_name TEXT;

-- Enable RLS on kikizakes
ALTER TABLE kikizakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to kikizakes" ON kikizakes;
DROP POLICY IF EXISTS "Allow public insert to kikizakes" ON kikizakes;
DROP POLICY IF EXISTS "Allow public update to kikizakes" ON kikizakes;
DROP POLICY IF EXISTS "Allow public delete to kikizakes" ON kikizakes;

CREATE POLICY "Authenticated users can read kikizakes"
  ON kikizakes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert own kikizakes"
  ON kikizakes FOR INSERT TO authenticated WITH CHECK (owner = auth.uid());

CREATE POLICY "Owners can update their kikizakes"
  ON kikizakes FOR UPDATE TO authenticated
  USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());

CREATE POLICY "Owners can delete their kikizakes"
  ON kikizakes FOR DELETE TO authenticated USING (owner = auth.uid());

-- Sakes: public read, authenticated insert/update
ALTER TABLE sakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to sakes" ON sakes;
DROP POLICY IF EXISTS "Allow public insert to sakes" ON sakes;
DROP POLICY IF EXISTS "Allow public update to sakes" ON sakes;
DROP POLICY IF EXISTS "Allow authenticated insert to sakes" ON sakes;

CREATE POLICY "Anyone can read sakes" ON sakes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert sakes" ON sakes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sakes" ON sakes FOR UPDATE TO authenticated USING (true);

-- Table: which tasters are allowed to add ratings (owner controls)
CREATE TABLE IF NOT EXISTS kikizake_allowed_tasters (
  kikizake_id UUID NOT NULL REFERENCES kikizakes(id) ON DELETE CASCADE,
  taster_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (kikizake_id, taster_id)
);

CREATE INDEX IF NOT EXISTS idx_kikizake_allowed_tasters_kikizake ON kikizake_allowed_tasters(kikizake_id);
CREATE INDEX IF NOT EXISTS idx_kikizake_allowed_tasters_taster ON kikizake_allowed_tasters(taster_id);

ALTER TABLE kikizake_allowed_tasters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and tasters can read allowed tasters"
  ON kikizake_allowed_tasters FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM kikizakes k WHERE k.id = kikizake_id AND k.owner = auth.uid())
    OR taster_id = auth.uid()
  );

CREATE POLICY "Owners can insert allowed tasters"
  ON kikizake_allowed_tasters FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM kikizakes k WHERE k.id = kikizake_id AND k.owner = auth.uid()));

CREATE POLICY "Owners can delete allowed tasters"
  ON kikizake_allowed_tasters FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM kikizakes k WHERE k.id = kikizake_id AND k.owner = auth.uid()));

-- Table: individual taster scores
CREATE TABLE IF NOT EXISTS kikizake_scores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  kikizake_id UUID NOT NULL REFERENCES kikizakes(id) ON DELETE CASCADE,
  taster_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(kikizake_id, taster_id)
);

CREATE INDEX IF NOT EXISTS idx_kikizake_scores_kikizake ON kikizake_scores(kikizake_id);
CREATE INDEX IF NOT EXISTS idx_kikizake_scores_taster ON kikizake_scores(taster_id);

ALTER TABLE kikizake_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scores" ON kikizake_scores FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allowed tasters or owner can insert score"
  ON kikizake_scores FOR INSERT TO authenticated
  WITH CHECK (
    taster_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM kikizakes k WHERE k.id = kikizake_id AND k.owner = auth.uid())
      OR EXISTS (SELECT 1 FROM kikizake_allowed_tasters kat WHERE kat.kikizake_id = kikizake_id AND kat.taster_id = auth.uid())
    )
  );

CREATE POLICY "Tasters can update their own score"
  ON kikizake_scores FOR UPDATE TO authenticated
  USING (taster_id = auth.uid()) WITH CHECK (taster_id = auth.uid());

CREATE POLICY "Tasters can delete their own score"
  ON kikizake_scores FOR DELETE TO authenticated USING (taster_id = auth.uid());

CREATE OR REPLACE FUNCTION update_kikizake_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kikizake_scores_updated_at ON kikizake_scores;
CREATE TRIGGER kikizake_scores_updated_at
  BEFORE UPDATE ON kikizake_scores
  FOR EACH ROW EXECUTE FUNCTION update_kikizake_scores_updated_at();

-- Users: authenticated can read (for inviting tasters by email)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Authenticated users can read users" ON users;
CREATE POLICY "Authenticated users can read users"
  ON users FOR SELECT TO authenticated USING (true);

-- View for home page
DROP VIEW IF EXISTS kikizake_sake_averages;
CREATE VIEW kikizake_sake_averages AS
SELECT
  s.id,
  s.name,
  s.bottling_company,
  (SELECT k.front_image FROM kikizakes k WHERE k.sake = s.id::text LIMIT 1) AS front_image_url,
  COALESCE(AVG(ks.score)::numeric, 0) AS avg_score,
  COUNT(DISTINCT k.id)::bigint AS tasting_count
FROM sakes s
LEFT JOIN kikizakes k ON k.sake = s.id::text
LEFT JOIN kikizake_scores ks ON ks.kikizake_id = k.id
GROUP BY s.id, s.name, s.bottling_company;
