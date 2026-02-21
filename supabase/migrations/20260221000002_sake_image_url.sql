-- Add image_url column to sakes table (for original bottle photo)
ALTER TABLE sakes ADD COLUMN image_url TEXT;

-- Add group_photo_url column to tastings table (for original group photo from the tasting)
ALTER TABLE tastings ADD COLUMN group_photo_url TEXT;
