-- Create conversation_state table for AI chatbot context
CREATE TABLE IF NOT EXISTS conversation_state (
    phone_number TEXT PRIMARY KEY,
    context JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversation_state_updated_at ON conversation_state(updated_at);

-- Add comment for documentation
COMMENT ON TABLE conversation_state IS 'Stores conversation context for AI chatbot to maintain continuity between WhatsApp messages';
