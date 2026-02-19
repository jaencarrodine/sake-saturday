import { NextRequest, NextResponse } from 'next/server';
import { processMessage } from '@/lib/ai/chat';
import { createServiceClient } from '@/lib/supabase/server';
import twilio from 'twilio';

const checkEnvVars = () => {
	const vars = {
		ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
		TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
		TWILIO_AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
		TWILIO_WHATSAPP_NUMBER: !!process.env.TWILIO_WHATSAPP_NUMBER,
		NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
	};

	return {
		vars,
		allPresent: Object.values(vars).every(v => v),
		missing: Object.entries(vars)
			.filter(([_, present]) => !present)
			.map(([key]) => key),
	};
};

export const GET = async () => {
	const envStatus = checkEnvVars();
	
	let supabaseStatus = 'unknown';
	try {
		const supabase = createServiceClient();
		const { error } = await supabase.from('whatsapp_messages').select('id').limit(1);
		supabaseStatus = error ? `error: ${error.message}` : 'connected';
	} catch (error) {
		supabaseStatus = `exception: ${error instanceof Error ? error.message : String(error)}`;
	}

	return NextResponse.json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		environment: {
			...envStatus,
			supabase: supabaseStatus,
		},
	});
};

export const POST = async (req: NextRequest) => {
	const requestId = `test_${Date.now()}`;
	const testStart = Date.now();
	
	try {
		const body = await req.json();
		const { message, phone, mediaUrls } = body;

		if (!message) {
			return NextResponse.json(
				{ error: 'Missing required field: message' },
				{ status: 400 }
			);
		}

		const envStatus = checkEnvVars();
		if (!envStatus.allPresent) {
			return NextResponse.json(
				{
					error: 'Missing required environment variables',
					missing: envStatus.missing,
				},
				{ status: 500 }
			);
		}

		// Support testing with real phone numbers to test conversation history
		const testPhone = phone || 'whatsapp:+1234567890';

		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'Test endpoint processing message',
			data: {
				testPhone,
				messagePreview: message.substring(0, 100),
				hasMediaUrls: !!mediaUrls,
				mediaCount: mediaUrls?.length || 0,
				isRealPhone: phone !== undefined && phone !== 'whatsapp:+1234567890',
			},
			timestamp: new Date().toISOString(),
		}));

		// If testing with real phone, query message history count
		let historyCount = 0;
		if (phone && phone !== 'whatsapp:+1234567890') {
			try {
				const supabase = createServiceClient();
				const { count } = await supabase
					.from('whatsapp_messages')
					.select('*', { count: 'exact', head: true })
					.or(`from_number.eq.${phone},to_number.eq.${phone}`);
				historyCount = count || 0;
				
				console.log(JSON.stringify({
					level: 'info',
					requestId,
					message: 'Testing with real phone number',
					data: {
						phone,
						existingMessageCount: historyCount,
					},
					timestamp: new Date().toISOString(),
				}));
			} catch (error) {
				console.warn(JSON.stringify({
					level: 'warn',
					requestId,
					message: 'Failed to get message count for real phone',
					error: {
						message: error instanceof Error ? error.message : String(error),
					},
					timestamp: new Date().toISOString(),
				}));
			}
		}

		const processStart = Date.now();
		
		const twilioClient = twilio(
			process.env.TWILIO_ACCOUNT_SID,
			process.env.TWILIO_AUTH_TOKEN
		);
		
		const testToNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+1234567890';
		
		const aiResponse = await processMessage(
			testPhone,
			testToNumber,
			message, 
			mediaUrls || null, 
			requestId,
			false,
			twilioClient
		);
		const processDuration = Date.now() - processStart;

		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'Test endpoint completed successfully',
			data: {
				processDurationMs: processDuration,
				totalDurationMs: Date.now() - testStart,
			},
			timestamp: new Date().toISOString(),
		}));

		return NextResponse.json({
			success: true,
			requestId,
			input: {
				phone: testPhone,
				message,
				mediaUrls: mediaUrls || null,
			},
			output: {
				response: aiResponse,
				responseLength: aiResponse.length,
			},
			metadata: {
				historyCount,
				processDurationMs: processDuration,
				totalDurationMs: Date.now() - testStart,
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error(JSON.stringify({
			level: 'error',
			requestId,
			message: 'Test endpoint error',
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Unknown',
			},
			totalDurationMs: Date.now() - testStart,
			timestamp: new Date().toISOString(),
		}));

		return NextResponse.json(
			{
				success: false,
				requestId,
				error: {
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				},
				totalDurationMs: Date.now() - testStart,
				timestamp: new Date().toISOString(),
			},
			{ status: 500 }
		);
	}
};
