-- Privacy-safe phone linking for WhatsApp users.
-- Stores only normalized SHA-256 hashes in user-facing profile tables.

ALTER TABLE tasters
ADD COLUMN IF NOT EXISTS phone_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasters_phone_hash
ON tasters (phone_hash)
WHERE phone_hash IS NOT NULL;

COMMENT ON COLUMN tasters.phone_hash IS 'SHA-256 hash of normalized phone number. Raw numbers should not be stored in tasters.';

CREATE TABLE IF NOT EXISTS taster_phone_links (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	taster_id UUID NOT NULL REFERENCES tasters(id) ON DELETE CASCADE,
	phone_hash TEXT NOT NULL UNIQUE,
	linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (taster_id, phone_hash)
);

CREATE INDEX IF NOT EXISTS idx_taster_phone_links_taster_id
ON taster_phone_links (taster_id);

CREATE INDEX IF NOT EXISTS idx_taster_phone_links_linked_at
ON taster_phone_links (linked_at DESC);

ALTER TABLE taster_phone_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'taster_phone_links'
			AND policyname = 'Service role full access to taster_phone_links'
	) THEN
		CREATE POLICY "Service role full access to taster_phone_links"
		ON taster_phone_links
		FOR ALL
		USING (auth.role() = 'service_role')
		WITH CHECK (auth.role() = 'service_role');
	END IF;
END $$;
