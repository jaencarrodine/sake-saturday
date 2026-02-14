-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create sakes table
CREATE TABLE IF NOT EXISTS sakes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  brewery TEXT,
  prefecture TEXT,
  grade TEXT,
  type TEXT,
  alc_pct DECIMAL(4,2),
  smv DECIMAL(5,2),
  rice TEXT,
  polishing_ratio DECIMAL(4,2),
  opacity TEXT,
  profile TEXT,
  serving_temp TEXT,
  front_image_url TEXT,
  back_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

-- Create tasters table
CREATE TABLE IF NOT EXISTS tasters (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  profile_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tastings table
CREATE TABLE IF NOT EXISTS tastings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sake_id UUID NOT NULL REFERENCES sakes(id) ON DELETE CASCADE,
  date TIMESTAMPTZ DEFAULT NOW(),
  location_name TEXT,
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  notes TEXT,
  images TEXT[], -- Array of image URLs
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tasting_scores table
CREATE TABLE IF NOT EXISTS tasting_scores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tasting_id UUID NOT NULL REFERENCES tastings(id) ON DELETE CASCADE,
  taster_id UUID NOT NULL REFERENCES tasters(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tasting_id, taster_id)
);

-- Create tasting_tasters junction table
CREATE TABLE IF NOT EXISTS tasting_tasters (
  tasting_id UUID NOT NULL REFERENCES tastings(id) ON DELETE CASCADE,
  taster_id UUID NOT NULL REFERENCES tasters(id) ON DELETE CASCADE,
  PRIMARY KEY (tasting_id, taster_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tastings_sake_id ON tastings(sake_id);
CREATE INDEX IF NOT EXISTS idx_tastings_created_at ON tastings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasting_scores_tasting_id ON tasting_scores(tasting_id);
CREATE INDEX IF NOT EXISTS idx_tasting_scores_taster_id ON tasting_scores(taster_id);
CREATE INDEX IF NOT EXISTS idx_tasting_tasters_tasting_id ON tasting_tasters(tasting_id);
CREATE INDEX IF NOT EXISTS idx_tasting_tasters_taster_id ON tasting_tasters(taster_id);

-- Enable Row Level Security (RLS)
ALTER TABLE sakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tastings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_tasters ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (permissive for MVP - allow all authenticated users to read/write)
-- For MVP, we're not using auth, so we'll make these public readable/writable

-- Sakes policies
CREATE POLICY "Allow public read access to sakes"
  ON sakes FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to sakes"
  ON sakes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to sakes"
  ON sakes FOR UPDATE
  USING (true);

-- Tasters policies
CREATE POLICY "Allow public read access to tasters"
  ON tasters FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to tasters"
  ON tasters FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to tasters"
  ON tasters FOR UPDATE
  USING (true);

-- Tastings policies
CREATE POLICY "Allow public read access to tastings"
  ON tastings FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to tastings"
  ON tastings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to tastings"
  ON tastings FOR UPDATE
  USING (true);

-- Tasting scores policies
CREATE POLICY "Allow public read access to tasting_scores"
  ON tasting_scores FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to tasting_scores"
  ON tasting_scores FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to tasting_scores"
  ON tasting_scores FOR UPDATE
  USING (true);

-- Tasting tasters policies
CREATE POLICY "Allow public read access to tasting_tasters"
  ON tasting_tasters FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to tasting_tasters"
  ON tasting_tasters FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to tasting_tasters"
  ON tasting_tasters FOR UPDATE
  USING (true);

-- Create a view for sake averages (helpful for the home page)
CREATE OR REPLACE VIEW sake_averages AS
SELECT 
  s.id,
  s.name,
  s.brewery,
  s.type,
  s.front_image_url,
  COALESCE(AVG(ts.score), 0) as avg_score,
  COUNT(DISTINCT t.id) as tasting_count
FROM sakes s
LEFT JOIN tastings t ON s.id = t.sake_id
LEFT JOIN tasting_scores ts ON t.id = ts.tasting_id
GROUP BY s.id, s.name, s.brewery, s.type, s.front_image_url;
