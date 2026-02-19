# AI Sake Sensei Chatbot Setup

## Overview
This document describes the AI-powered WhatsApp chatbot for Sake Saturday tastings.

## Architecture

### Components
1. **WhatsApp Webhook** (`/app/api/whatsapp/route.ts`)
   - Receives messages from Twilio
   - Saves to Supabase
   - Processes with AI (async)
   - Sends responses via Twilio

2. **AI Chat Engine** (`/lib/ai/chat.ts`)
   - Manages conversation history
   - Calls Claude API with tools
   - Maintains conversation context

3. **Tool Functions** (`/lib/ai/tools.ts`)
   - Database interactions for sake, tastings, scores, tasters
   - Used by AI to perform actions

4. **Vision Support** (`/lib/ai/vision.ts`)
   - Downloads images from Twilio
   - Processes sake bottle photos with Claude Vision

5. **Personality** (`/lib/ai/personality.ts`)
   - System prompt defining the Sake Sensei character
   - Configuration constants

## Required Environment Variables

Add these to your `.env.local` file and to Vercel/deployment environment:

```bash
# Anthropic API (for Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Twilio (existing)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# API Auth (existing)
SAKE_API_KEY=...
```

## Database Setup

### Required Table: `conversation_state`

If the table doesn't exist, run the migration:

```bash
# Using Supabase CLI
supabase db push

# Or manually run the SQL in supabase/migrations/20260219_create_conversation_state.sql
```

The table schema:
- `phone_number` (TEXT, PRIMARY KEY) - User's WhatsApp number
- `context` (JSONB) - Current conversation context (sake_id, tasting_id, etc.)
- `updated_at` (TIMESTAMPTZ) - Last update timestamp

### Existing Tables Used
- `whatsapp_messages` - Message history
- `sakes` - Sake database
- `tastings` - Tasting sessions
- `scores` - Taster scores
- `tasters` - Taster profiles
- `sake_rankings` - Aggregated sake rankings (view)

## How It Works

### Message Flow
1. User sends WhatsApp message → Twilio webhook
2. Webhook saves message to `whatsapp_messages` table
3. Webhook returns empty TwiML immediately (prevents timeout)
4. Async process:
   - Load conversation history (last 20 messages)
   - Load conversation context from `conversation_state`
   - If images: download and include in Claude request
   - Call Claude API with system prompt + tools
   - Claude may call tools (identify_sake, create_tasting, etc.)
   - Extract text response
   - Send via Twilio
   - Save outbound message to `whatsapp_messages`
   - Update `conversation_state` if needed

### AI Tools Available
1. `identify_sake` - Find or create sake from photo/description
2. `create_tasting` - Create tasting session
3. `record_scores` - Record scores from tasters
4. `lookup_taster` - Find/create taster profile
5. `get_tasting_history` - Retrieve past tastings
6. `get_sake_rankings` - Get leaderboard

### Conversation Context
The AI maintains state in `conversation_state.context`:
- `sake_id` - Current sake being discussed
- `tasting_id` - Current tasting session
- `last_sake_name` - Last sake identified
- Other contextual data

This helps the AI maintain continuity across messages.

## Personality

The **Sake Sensei** is:
- A mystical sake master
- Wise but slightly unhinged
- Speaks in koans and sake metaphors
- Think Mr. Miyagi meets a sake sommelier
- Keeps messages concise for WhatsApp
- Makes tasting feel mystical and fun

Example responses:
- "Ahh, a Junmai Daiginjo from Niigata... the snow country breeds clarity in both water and spirit. How did this one speak to your palate?"
- "The sake that tastes of defeat teaches more than the sake that tastes of victory."

## Development

### Install Dependencies
```bash
npm install
```

Dependencies added:
- `@anthropic-ai/sdk` - Claude API client
- `twilio` - Twilio REST API client

### Local Testing
1. Set up `.env.local` with all required variables
2. Run dev server: `npm run dev`
3. Use ngrok or similar to expose webhook for Twilio
4. Configure Twilio WhatsApp sandbox to point to your webhook

### Deployment
1. Deploy to Vercel (or your platform)
2. Add all environment variables to deployment
3. Update Twilio webhook URL to production endpoint
4. Run database migration if needed

## Security Notes

- Webhook validates Twilio signature (via form data)
- API key auth on internal routes (existing pattern)
- Supabase service role key used server-side only
- Twilio credentials used for media download auth
- All AI processing happens server-side

## Troubleshooting

### AI not responding
- Check `ANTHROPIC_API_KEY` is set
- Check Anthropic API quota/billing
- Check logs for errors

### Messages not saving
- Check Supabase connection
- Verify `whatsapp_messages` table exists
- Check service role key permissions

### Twilio errors
- Verify webhook URL is accessible
- Check Twilio credentials
- Ensure `TWILIO_WHATSAPP_NUMBER` matches your number

### Tool execution errors
- Check database schema matches code
- Verify foreign key relationships
- Check tool input validation

## Monitoring

Watch these:
- Anthropic API usage/costs
- Twilio message costs
- Supabase database size
- Response latency
- Error rates in logs

## Future Enhancements

Potential improvements:
- Add image upload for bottle photos (front/back)
- Support group chats
- Add taster leaderboard queries
- Implement sake recommendations
- Add conversation memory limits/cleanup
- Support multiple languages
- Add analytics dashboard
