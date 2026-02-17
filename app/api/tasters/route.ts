import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { withApiAuth } from '@/lib/api/auth';

// POST /api/tasters - Create or find taster by phone_number or name
const postHandler = async (req: NextRequest) => {
	try {
		const body = await req.json();
		const { name, phone_number, email, avatar_url } = body;

		if (!name || typeof name !== 'string') {
			return NextResponse.json(
				{ error: 'Name is required' },
				{ status: 400 }
			);
		}

		const supabase = createServiceClient();

		// Try to find existing taster by phone_number or name
		let existingTaster = null;
		
		// First try phone_number if provided
		if (phone_number) {
			const { data, error } = await supabase
				.from('tasters')
				.select('*')
				.eq('phone_number', phone_number)
				.single();

			if (!error) {
				existingTaster = data;
			}
		}

		// If not found by phone, try by name (case-insensitive)
		if (!existingTaster) {
			const { data, error } = await supabase
				.from('tasters')
				.select('*')
				.ilike('name', name)
				.single();

			if (!error) {
				existingTaster = data;
			}
		}

		// If taster exists, return it
		if (existingTaster) {
			return NextResponse.json({
				taster: existingTaster,
				created: false,
			});
		}

		// Create new taster
		const { data: newTaster, error: createError } = await supabase
			.from('tasters')
			.insert({
				name,
				phone_number,
				email,
				avatar_url,
			})
			.select()
			.single();

		if (createError) {
			console.error('Error creating taster:', createError);
			return NextResponse.json(
				{ error: 'Failed to create taster' },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			taster: newTaster,
			created: true,
		}, { status: 201 });
	} catch (error) {
		console.error('Error in POST /api/tasters:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

// POST requires authentication
export const POST = withApiAuth(postHandler);
