-- Add AI image system columns
-- For tasters: profile pic generation support
ALTER TABLE tasters ADD COLUMN source_photo_url TEXT;
ALTER TABLE tasters ADD COLUMN ai_profile_image_url TEXT;
ALTER TABLE tasters ADD COLUMN rank_at_generation TEXT;

-- For sakes: AI bottle art
ALTER TABLE sakes ADD COLUMN ai_bottle_image_url TEXT;

-- For tastings: summaries with level-ups
ALTER TABLE tastings ADD COLUMN summary JSONB;
