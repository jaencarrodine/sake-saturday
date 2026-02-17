import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { withApiAuth } from '@/lib/api/auth';

// POST /api/tastings - Create a tasting
const postHandler = async (req: NextRequest) => {
	try {
		const body = await req.json();
		const { sake_id, tasting_date, location, notes, image_url } = body;

		if (!sake_id || typeof sake_id !== 'string') {
			return NextResponse.json(
				{ error: 'sake_id is required' },
				{ status: 400 }
			);
		}

		const supabase = createServiceClient();

		// Verify sake exists
		const { data: sake, error: sakeError } = await supabase
			.from('sakes')
			.select('id')
			.eq('id', sake_id)
			.single();

		if (sakeError || !sake) {
			return NextResponse.json(
				{ error: 'Sake not found' },
				{ status: 404 }
			);
		}

		// Create new tasting
		const { data: newTasting, error: createError } = await supabase
			.from('tastings')
			.insert({
				sake_id,
				tasting_date: tasting_date || new Date().toISOString(),
				location,
				notes,
				image_url,
			})
			.select()
			.single();

		if (createError) {
			console.error('Error creating tasting:', createError);
			return NextResponse.json(
				{ error: 'Failed to create tasting' },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			tasting: newTasting,
		}, { status: 201 });
	} catch (error) {
		console.error('Error in POST /api/tastings:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

// POST requires authentication
export const POST = withApiAuth(postHandler);
