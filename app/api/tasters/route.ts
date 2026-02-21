import { NextRequest, NextResponse } from 'next/server';
import { ensurePhoneLinkForTaster, hashPhoneNumber, resolveTasterByPhone } from '@/lib/phoneHash';
import { createServiceClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase/databaseTypes';
import { withApiAuth } from '@/lib/api/auth';

type Taster = Database['public']['Tables']['tasters']['Row'];

const sanitizeTaster = (taster: Taster) => {
	const { phone_number: _, phone_hash: __, ...safeTaster } = taster;
	return safeTaster;
};

// POST /api/tasters - Create or find taster by phone hash or name
const postHandler = async (req: NextRequest) => {
	try {
		const body = await req.json();
		const { name, profile_pic } = body;
		const phoneInput = body.phone || body.phone_number;

		if (!name || typeof name !== 'string') {
			return NextResponse.json(
				{ error: 'Name is required' },
				{ status: 400 }
			);
		}

		const supabase = createServiceClient();

		// Try to find an existing taster by privacy-safe phone hash first
		if (phoneInput) {
			const phoneResolution = await resolveTasterByPhone(supabase, phoneInput);

			if (phoneResolution.tasterId) {
				const { data: linkedTaster, error: linkedTasterError } = await supabase
					.from('tasters')
					.select('*')
					.eq('id', phoneResolution.tasterId)
					.maybeSingle();

				if (linkedTasterError) {
					console.error('Error finding taster by phone hash:', linkedTasterError);
					return NextResponse.json(
						{ error: 'Database error' },
						{ status: 500 }
					);
				}

				if (linkedTaster) {
					await ensurePhoneLinkForTaster(supabase, linkedTaster.id, phoneInput);
					return NextResponse.json({
						taster: sanitizeTaster(linkedTaster),
						created: false,
					});
				}
			}
		}

		// Otherwise try by name (case-insensitive)
		const { data: tasterByName, error: tasterByNameError } = await supabase
			.from('tasters')
			.select('*')
			.ilike('name', name)
			.maybeSingle();

		if (tasterByNameError) {
			console.error('Error finding taster by name:', tasterByNameError);
			return NextResponse.json(
				{ error: 'Database error' },
				{ status: 500 }
			);
		}

		if (tasterByName) {
			if (phoneInput) {
				await ensurePhoneLinkForTaster(supabase, tasterByName.id, phoneInput);
			}

			return NextResponse.json({
				taster: sanitizeTaster(tasterByName),
				created: false,
			});
		}

		// Create new taster
		const { data: newTaster, error: createError } = await supabase
			.from('tasters')
			.insert({
				name,
				profile_pic,
				phone_hash: phoneInput ? hashPhoneNumber(phoneInput) : null,
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

		if (phoneInput) {
			await ensurePhoneLinkForTaster(supabase, newTaster.id, phoneInput);
		}

		return NextResponse.json({
			taster: sanitizeTaster(newTaster),
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
