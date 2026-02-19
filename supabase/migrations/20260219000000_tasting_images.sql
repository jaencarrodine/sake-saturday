-- Create tasting_images table for AI-generated images
CREATE TABLE IF NOT EXISTS tasting_images (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tasting_id UUID NOT NULL REFERENCES tastings(id) ON DELETE CASCADE,
  original_image_url TEXT,
  generated_image_url TEXT,
  image_type TEXT NOT NULL CHECK (image_type IN ('bottle_art', 'group_transform', 'original')),
  prompt_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_tasting_images_tasting_id ON tasting_images(tasting_id);
CREATE INDEX IF NOT EXISTS idx_tasting_images_image_type ON tasting_images(image_type);

-- Enable Row Level Security (RLS)
ALTER TABLE tasting_images ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (public read/write for MVP, same as existing tables)
CREATE POLICY "Allow public read access to tasting_images"
  ON tasting_images FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to tasting_images"
  ON tasting_images FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to tasting_images"
  ON tasting_images FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete to tasting_images"
  ON tasting_images FOR DELETE
  USING (true);
