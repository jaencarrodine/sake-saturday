import { NextRequest, NextResponse } from 'next/server';

export type ApiHandler = (req: NextRequest, context?: any) => Promise<NextResponse>;

/**
 * API key validation middleware
 * Checks Authorization header against SAKE_API_KEY env var
 */
export const withApiAuth = (handler: ApiHandler): ApiHandler => {
	return async (req: NextRequest, context?: any) => {
		const authHeader = req.headers.get('authorization');
		const expectedKey = process.env.SAKE_API_KEY;

		if (!expectedKey) {
			return NextResponse.json(
				{ error: 'API key not configured on server' },
				{ status: 500 }
			);
		}

		if (!authHeader) {
			return NextResponse.json(
				{ error: 'Missing Authorization header' },
				{ status: 401 }
			);
		}

		// Support both "Bearer <key>" and just "<key>" formats
		const providedKey = authHeader.startsWith('Bearer ')
			? authHeader.slice(7)
			: authHeader;

		if (providedKey !== expectedKey) {
			return NextResponse.json(
				{ error: 'Invalid API key' },
				{ status: 401 }
			);
		}

		// Auth successful, call the handler
		return handler(req, context);
	};
};
