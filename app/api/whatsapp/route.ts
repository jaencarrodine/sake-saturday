import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { processMessage } from '@/lib/ai/chat';
import twilio from 'twilio';

export const maxDuration = 30;

const ADMIN_NUMBERS = ["whatsapp:+14439941537"];

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
	const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	
	try {
		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'WhatsApp webhook received',
			timestamp: new Date().toISOString(),
		}));
		
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
		
		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'Webhook payload parsed',
			data: {
				from,
				to,
				messageSid,
				bodyPreview: body?.substring(0, 100),
				mediaCount: mediaUrls.length,
			},
			timestamp: new Date().toISOString(),
		}));
		
		if (!from || !to || !messageSid) {
			console.error(JSON.stringify({
				level: 'error',
				requestId,
				message: 'Missing required fields',
				data: { from, to, messageSid },
				timestamp: new Date().toISOString(),
			}));
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
			console.error(JSON.stringify({
				level: 'error',
				requestId,
				message: 'Failed to insert message to database',
				error: {
					message: error.message,
					code: error.code,
					details: error.details,
				},
				timestamp: new Date().toISOString(),
			}));
		} else {
			console.log(JSON.stringify({
				level: 'info',
				requestId,
				message: 'Message saved to database',
				timestamp: new Date().toISOString(),
			}));
		}
		
		// IMPORTANT: Must await processing before returning response.
		// On Vercel serverless, the function is killed once the response is sent.
		// Fire-and-forget does NOT work on serverless.
		try {
			const isAdmin = ADMIN_NUMBERS.includes(from);
			await processAndReply(from, to, body, mediaUrls, requestId, isAdmin);
		} catch (err) {
			console.error(JSON.stringify({
				level: 'error',
				requestId,
				message: 'Unhandled error in async processing',
				error: {
					message: err instanceof Error ? err.message : String(err),
					stack: err instanceof Error ? err.stack : undefined,
				},
				timestamp: new Date().toISOString(),
			}));
		}
		
		return new Response('<Response></Response>', {
			headers: { 'Content-Type': 'text/xml' },
		});
	} catch (error) {
		console.error(JSON.stringify({
			level: 'error',
			requestId,
			message: 'Critical error in webhook handler',
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			timestamp: new Date().toISOString(),
		}));
		return new Response('<Response></Response>', {
			headers: { 'Content-Type': 'text/xml' },
		});
	}
};

const processAndReply = async (
	from: string,
	to: string,
	body: string | null,
	mediaUrls: string[],
	requestId: string,
	isAdmin: boolean = false
) => {
	const processStart = Date.now();
	let aiResponse: string | null = null;
	let processingError: Error | unknown = null;
	
	// Step 1: Process message with AI
	try {
		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'Starting AI processing',
			data: {
				from,
				hasBody: !!body,
				bodyPreview: body?.substring(0, 100),
				mediaCount: mediaUrls.length,
			},
			timestamp: new Date().toISOString(),
		}));
		
		const aiStart = Date.now();
		aiResponse = await processMessage(from, to, body, mediaUrls.length > 0 ? mediaUrls : null, requestId, isAdmin, twilioClient);
		
		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'AI response generated successfully',
			data: {
				responseLength: aiResponse.length,
				responsePreview: aiResponse.substring(0, 150),
				durationMs: Date.now() - aiStart,
			},
			timestamp: new Date().toISOString(),
		}));
	} catch (error) {
		processingError = error;
		console.error(JSON.stringify({
			level: 'error',
			requestId,
			message: 'AI processing failed',
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Unknown',
			},
			data: {
				from,
				bodyPreview: body?.substring(0, 100),
			},
			durationMs: Date.now() - processStart,
			timestamp: new Date().toISOString(),
		}));
		
		aiResponse = "Ahh, the sake gods cloud my vision. A technical disturbance in the flow. Try again, perhaps?";
	}

	// Step 2: Send reply via Twilio (ALWAYS try to send something to the user)
	if (!aiResponse) {
		console.error(JSON.stringify({
			level: 'error',
			requestId,
			message: 'CRITICAL: aiResponse is null/undefined, this should never happen',
			timestamp: new Date().toISOString(),
		}));
		aiResponse = "Technical difficulties. The sake sensei will return shortly.";
	}

	const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER || to;
	const formattedFrom = twilioFrom.startsWith('whatsapp:') ? twilioFrom : `whatsapp:${twilioFrom}`;
	const formattedTo = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
	
	try {
		if (!twilioFrom.startsWith('whatsapp:')) {
			console.log(JSON.stringify({
				level: 'warn',
				requestId,
				message: 'TWILIO_WHATSAPP_NUMBER missing whatsapp: prefix, adding it',
				timestamp: new Date().toISOString(),
			}));
		}
		
		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'Sending Twilio message',
			data: {
				from: formattedFrom,
				to: formattedTo,
				bodyPreview: aiResponse.substring(0, 100),
				wasError: !!processingError,
			},
			timestamp: new Date().toISOString(),
		}));
		
		const twilioStart = Date.now();
		const message = await twilioClient.messages.create({
			from: formattedFrom,
			to: formattedTo,
			body: aiResponse,
		});
		
		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'Twilio message sent successfully',
			data: {
				messageSid: message.sid,
				status: message.status,
				durationMs: Date.now() - twilioStart,
			},
			timestamp: new Date().toISOString(),
		}));
		
		// Step 3: Save outbound message to database (non-critical)
		try {
			const supabase = createServiceClient();
			const dbStart = Date.now();
			
			const { error: insertError } = await supabase.from('whatsapp_messages').insert({
				direction: 'outbound',
				from_number: formattedFrom,
				to_number: formattedTo,
				body: aiResponse,
				media_urls: null,
				twilio_sid: message.sid,
				processed: true,
			});
			
			if (insertError) {
				console.error(JSON.stringify({
					level: 'error',
					requestId,
					message: 'Failed to save outbound message to database (non-critical)',
					error: {
						message: insertError.message,
						code: insertError.code,
						details: insertError.details,
					},
					durationMs: Date.now() - dbStart,
					timestamp: new Date().toISOString(),
				}));
			}
			
			// Step 4: Mark inbound message as processed (non-critical)
			const { error: updateError } = await supabase
				.from('whatsapp_messages')
				.update({ processed: true, processed_at: new Date().toISOString() })
				.eq('from_number', from)
				.eq('processed', false);
			
			if (updateError) {
				console.error(JSON.stringify({
					level: 'error',
					requestId,
					message: 'Failed to update inbound message status (non-critical)',
					error: {
						message: updateError.message,
						code: updateError.code,
					},
					timestamp: new Date().toISOString(),
				}));
			} else {
				console.log(JSON.stringify({
					level: 'info',
					requestId,
					message: 'Database updated successfully',
					durationMs: Date.now() - dbStart,
					timestamp: new Date().toISOString(),
				}));
			}
		} catch (dbError) {
			console.error(JSON.stringify({
				level: 'error',
				requestId,
				message: 'Database operations failed (non-critical)',
				error: {
					message: dbError instanceof Error ? dbError.message : String(dbError),
					stack: dbError instanceof Error ? dbError.stack : undefined,
				},
				timestamp: new Date().toISOString(),
			}));
			// Don't throw, database errors are non-critical after message was sent
		}

		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'processAndReply completed successfully',
			totalDurationMs: Date.now() - processStart,
			timestamp: new Date().toISOString(),
		}));
	} catch (error) {
		console.error(JSON.stringify({
			level: 'error',
			requestId,
			message: 'CRITICAL: Failed to send reply via Twilio',
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Unknown',
			},
			data: {
				from,
				to,
				aiResponsePreview: aiResponse?.substring(0, 100),
			},
			totalDurationMs: Date.now() - processStart,
			timestamp: new Date().toISOString(),
		}));
		
		// Last resort: Attempt to send error message to user
		try {
			console.log(JSON.stringify({
				level: 'info',
				requestId,
				message: 'Attempting to send fallback error message',
				timestamp: new Date().toISOString(),
			}));

			await twilioClient.messages.create({
				from: formattedFrom,
				to: formattedTo,
				body: "Gomen! The sake delivery has been delayed. Technical issues. Please try again in a moment.",
			});
			
			console.log(JSON.stringify({
				level: 'info',
				requestId,
				message: 'Fallback error message sent successfully',
				timestamp: new Date().toISOString(),
			}));
		} catch (fallbackError) {
			console.error(JSON.stringify({
				level: 'error',
				requestId,
				message: 'CRITICAL: Failed to send fallback error message - user will not receive any response',
				error: {
					message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
					stack: fallbackError instanceof Error ? fallbackError.stack : undefined,
				},
				timestamp: new Date().toISOString(),
			}));
		}
	}
};
