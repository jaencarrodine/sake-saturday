import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { withApiAuth } from '@/lib/api/auth';

// POST /api/sakes - Create or find sake by name (case-insensitive)
const postHandler = async (req: NextRequest) => {
	try {
		const body = await req.json();
		const { name } = body;

		if (!name || typeof name !== 'string') {
			return NextResponse.json(
				{ error: 'Name is required' },
				{ status: 400 }
			);
		}

		const supabase = createServiceClient();

		// Try to find existing sake by name (case-insensitive)
		const { data: existingSake, error: findError } = await supabase
			.from('sakes')
			.select('*')
			.ilike('name', name)
			.single();

		if (findError && findError.code !== 'PGRST116') {
			// PGRST116 is "not found" error, which is expected
			console.error('Error finding sake:', findError);
			return NextResponse.json(
				{ error: 'Database error' },
				{ status: 500 }
			);
		}

		// If sake exists, return it
		if (existingSake) {
			return NextResponse.json({
				sake: existingSake,
				created: false,
			});
		}

		// Create new sake
		const { data: newSake, error: createError } = await supabase
			.from('sakes')
			.insert({
				name,
				name_japanese: body.name_japanese,
				brewery: body.brewery,
				prefecture: body.prefecture,
				type: body.type,
				grade: body.grade,
				rice: body.rice,
				polishing_ratio: body.polishing_ratio,
				alcohol_percentage: body.alcohol_percentage,
				smv: body.smv,
				acidity: body.acidity,
				image_url: body.image_url,
			})
			.select()
			.single();

		if (createError) {
			console.error('Error creating sake:', createError);
			return NextResponse.json(
				{ error: 'Failed to create sake' },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			sake: newSake,
			created: true,
		}, { status: 201 });
	} catch (error) {
		console.error('Error in POST /api/sakes:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

// GET /api/sakes - List sakes with search and sort
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const search = searchParams.get('search');
		const sort = searchParams.get('sort') || 'average_score';
		const order = searchParams.get('order') || 'desc';

		const supabase = createServiceClient();

		// Query the sake_rankings view for aggregated data
		let query = supabase.from('sake_rankings').select('*');

		// Apply search filter if provided
		if (search) {
			query = query.or(`sake_name.ilike.%${search}%,sake_name_japanese.ilike.%${search}%`);
		}

		// Apply sorting
		const validSortFields = ['average_score', 'total_tastings', 'total_scores', 'last_tasted', 'sake_name'];
		const sortField = validSortFields.includes(sort) ? sort : 'average_score';
		const sortOrder = order === 'asc' ? 'asc' : 'desc';
		
		query = query.order(sortField, { ascending: sortOrder === 'asc', nullsFirst: false });

		const { data, error } = await query;

		if (error) {
			console.error('Error fetching sakes:', error);
			return NextResponse.json(
				{ error: 'Failed to fetch sakes' },
				{ status: 500 }
			);
		}

		return NextResponse.json({ sakes: data || [] });
	} catch (error) {
		console.error('Error in GET /api/sakes:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

// POST requires authentication
export const POST = withApiAuth(postHandler);
