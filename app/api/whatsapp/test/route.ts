import { NextRequest, NextResponse } from 'next/server';
import { processMessage } from '@/lib/ai/chat';
import { createServiceClient } from '@/lib/supabase/server';

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
	
	try {
		const body = await req.json();
		const { message, phone } = body;

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

		const testPhone = phone || 'whatsapp:+1234567890';

		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'Test endpoint processing message',
			data: {
				testPhone,
				messagePreview: message.substring(0, 100),
			},
			timestamp: new Date().toISOString(),
		}));

		const aiResponse = await processMessage(testPhone, message, null, requestId);

		return NextResponse.json({
			success: true,
			requestId,
			input: {
				phone: testPhone,
				message,
			},
			output: {
				response: aiResponse,
				responseLength: aiResponse.length,
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
				timestamp: new Date().toISOString(),
			},
			{ status: 500 }
		);
	}
};
