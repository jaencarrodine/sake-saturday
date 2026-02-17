import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const POST = async (req: NextRequest) => {
	try {
		// Parse form data from Twilio webhook
		const formData = await req.formData();
		
		// Extract required fields
		const from = formData.get('From') as string;
		const to = formData.get('To') as string;
		const body = formData.get('Body') as string;
		const messageSid = formData.get('MessageSid') as string;
		const numMedia = parseInt(formData.get('NumMedia') as string) || 0;
		
		// Extract media URLs if present
		const mediaUrls: string[] = [];
		for (let i = 0; i < numMedia; i++) {
			const mediaUrl = formData.get(`MediaUrl${i}`) as string;
			if (mediaUrl) {
				mediaUrls.push(mediaUrl);
			}
		}
		
		// Validate required fields
		if (!from || !to || !messageSid) {
			console.error('Missing required fields:', { from, to, messageSid });
			return new Response('<Response></Response>', {
				headers: { 'Content-Type': 'text/xml' },
				status: 400,
			});
		}
		
		// Insert message into Supabase
		const supabase = createServiceClient();
		const { error } = await supabase.from('whatsapp_messages').insert({
			direction: 'inbound',
			from_number: from,
			to_number: to,
			body: body || null,
			media_urls: mediaUrls.length > 0 ? mediaUrls : null,
			twilio_sid: messageSid,
			processed: false,
		});
		
		if (error) {
			console.error('Error inserting message:', error);
			// Still return 200 to Twilio so it doesn't retry
		}
		
		// Return empty TwiML response (no auto-reply)
		return new Response('<Response></Response>', {
			headers: { 'Content-Type': 'text/xml' },
		});
	} catch (error) {
		console.error('Error in POST /api/whatsapp:', error);
		// Return empty TwiML even on error to prevent Twilio retries
		return new Response('<Response></Response>', {
			headers: { 'Content-Type': 'text/xml' },
		});
	}
};
