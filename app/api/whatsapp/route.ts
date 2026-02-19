import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { processMessage } from '@/lib/ai/chat';
import twilio from 'twilio';

const validateEnvVars = () => {
	const requiredVars = {
		ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
		TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
		TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
		TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
	};

	const missing = Object.entries(requiredVars)
		.filter(([_, value]) => !value)
		.map(([key]) => key);

	if (missing.length > 0) {
		const errorMsg = `Missing required environment variables: ${missing.join(', ')}`;
		console.error('[WhatsApp Webhook] ' + errorMsg);
		throw new Error(errorMsg);
	}
};

const twilioClient = twilio(
	process.env.TWILIO_ACCOUNT_SID,
	process.env.TWILIO_AUTH_TOKEN
);

export const POST = async (req: NextRequest) => {
	try {
		validateEnvVars();
		
		const formData = await req.formData();
		
		const from = formData.get('From') as string;
		const to = formData.get('To') as string;
		const body = formData.get('Body') as string;
		const messageSid = formData.get('MessageSid') as string;
		const numMedia = parseInt(formData.get('NumMedia') as string) || 0;
		
		const mediaUrls: string[] = [];
		for (let i = 0; i < numMedia; i++) {
			const mediaUrl = formData.get(`MediaUrl${i}`) as string;
			if (mediaUrl) {
				mediaUrls.push(mediaUrl);
			}
		}
		
		if (!from || !to || !messageSid) {
			console.error('Missing required fields:', { from, to, messageSid });
			return new Response('<Response></Response>', {
				headers: { 'Content-Type': 'text/xml' },
				status: 400,
			});
		}
		
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
		}
		
		processAndReply(from, to, body, mediaUrls).catch(err => {
			console.error('Error in async processing:', err);
		});
		
		return new Response('<Response></Response>', {
			headers: { 'Content-Type': 'text/xml' },
		});
	} catch (error) {
		console.error('Error in POST /api/whatsapp:', error);
		return new Response('<Response></Response>', {
			headers: { 'Content-Type': 'text/xml' },
		});
	}
};

const sendTypingIndicator = async (from: string, to: string): Promise<void> => {
	try {
		const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER || to;
		const formattedFrom = twilioFrom.startsWith('whatsapp:') ? twilioFrom : `whatsapp:${twilioFrom}`;
		const formattedTo = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
		
		await twilioClient.messages.create({
			from: formattedFrom,
			to: formattedTo,
			body: '...',
		});
		
		console.log('[sendTypingIndicator] Typing indicator sent');
	} catch (error) {
		console.warn('[sendTypingIndicator] Failed to send typing indicator (non-critical):', error instanceof Error ? error.message : String(error));
	}
};

const processAndReply = async (
	from: string,
	to: string,
	body: string | null,
	mediaUrls: string[]
) => {
	let aiResponse: string;
	
	try {
		console.log('[processAndReply] Starting processing for:', { from, hasBody: !!body, mediaCount: mediaUrls.length });
		
		await sendTypingIndicator(from, to);
		
		aiResponse = await processMessage(from, body, mediaUrls.length > 0 ? mediaUrls : null);
		
		console.log('[processAndReply] AI response generated, length:', aiResponse.length);
	} catch (error) {
		console.error('[processAndReply] Error in AI processing:', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			from,
			body,
		});
		
		aiResponse = "Ahh, the sake gods cloud my vision. A technical disturbance in the flow. Try again, perhaps?";
	}
	
	try {
		const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER || to;
		
		if (!twilioFrom.startsWith('whatsapp:')) {
			console.warn('[processAndReply] TWILIO_WHATSAPP_NUMBER missing whatsapp: prefix, adding it');
		}
		
		const formattedFrom = twilioFrom.startsWith('whatsapp:') ? twilioFrom : `whatsapp:${twilioFrom}`;
		const formattedTo = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
		
		console.log('[processAndReply] Sending Twilio message:', { from: formattedFrom, to: formattedTo });
		
		const message = await twilioClient.messages.create({
			from: formattedFrom,
			to: formattedTo,
			body: aiResponse,
		});
		
		console.log('[processAndReply] Message sent successfully:', message.sid);
		
		const supabase = createServiceClient();
		await supabase.from('whatsapp_messages').insert({
			direction: 'outbound',
			from_number: formattedFrom,
			to_number: formattedTo,
			body: aiResponse,
			media_urls: null,
			twilio_sid: message.sid,
			processed: true,
		});
		
		await supabase
			.from('whatsapp_messages')
			.update({ processed: true, processed_at: new Date().toISOString() })
			.eq('from_number', from)
			.eq('processed', false);
		
		console.log('[processAndReply] Database updated successfully');
	} catch (error) {
		console.error('[processAndReply] Error sending reply:', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			from,
			to,
			aiResponse: aiResponse?.substring(0, 100),
		});
	}
};
