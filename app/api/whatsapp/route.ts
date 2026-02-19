import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { processMessage } from '@/lib/ai/chat';
import twilio from 'twilio';

const twilioClient = twilio(
	process.env.TWILIO_ACCOUNT_SID,
	process.env.TWILIO_AUTH_TOKEN
);

export const POST = async (req: NextRequest) => {
	try {
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

const processAndReply = async (
	from: string,
	to: string,
	body: string | null,
	mediaUrls: string[]
) => {
	try {
		const aiResponse = await processMessage(from, body, mediaUrls.length > 0 ? mediaUrls : null);
		
		const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER || to;
		const message = await twilioClient.messages.create({
			from: twilioFrom,
			to: from,
			body: aiResponse,
		});
		
		const supabase = createServiceClient();
		await supabase.from('whatsapp_messages').insert({
			direction: 'outbound',
			from_number: twilioFrom,
			to_number: from,
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
		
	} catch (error) {
		console.error('Error processing and replying:', error);
	}
};
