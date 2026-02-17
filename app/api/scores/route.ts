import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { withApiAuth } from '@/lib/api/auth';

// POST /api/scores - Add/upsert scores to a tasting (batch)
const postHandler = async (req: NextRequest) => {
	try {
		const body = await req.json();
		const { scores } = body;

		if (!Array.isArray(scores) || scores.length === 0) {
			return NextResponse.json(
				{ error: 'scores array is required and must not be empty' },
				{ status: 400 }
			);
		}

		// Validate each score object
		for (const score of scores) {
			if (!score.tasting_id || !score.taster_id || typeof score.score !== 'number') {
				return NextResponse.json(
					{ error: 'Each score must have tasting_id, taster_id, and score' },
					{ status: 400 }
				);
			}
			if (score.score < 0 || score.score > 10) {
				return NextResponse.json(
					{ error: 'Score must be between 0 and 10' },
					{ status: 400 }
				);
			}
		}

		const supabase = createServiceClient();

		// Prepare data for upsert
		const scoresData = scores.map(s => ({
			tasting_id: s.tasting_id,
			taster_id: s.taster_id,
			score: s.score,
			notes: s.notes,
		}));

		// Upsert scores (insert or update on conflict)
		// Using onConflict to handle duplicates based on (tasting_id, taster_id) unique constraint
		const { data: upsertedScores, error: upsertError } = await supabase
			.from('scores')
			.upsert(scoresData, {
				onConflict: 'tasting_id,taster_id',
			})
			.select();

		if (upsertError) {
			console.error('Error upserting scores:', upsertError);
			return NextResponse.json(
				{ error: 'Failed to save scores', details: upsertError.message },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			scores: upsertedScores,
			count: upsertedScores?.length || 0,
		}, { status: 201 });
	} catch (error) {
		console.error('Error in POST /api/scores:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

// POST requires authentication
export const POST = withApiAuth(postHandler);
