import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

type RouteContext = {
	params: Promise<{ id: string }>;
};

// GET /api/sakes/[id] - Sake detail with tastings and scores
export async function GET(req: NextRequest, context: RouteContext) {
	try {
		const { id } = await context.params;
		const supabase = createServiceClient();

		// Get sake details
		const { data: sake, error: sakeError } = await supabase
			.from('sakes')
			.select('*')
			.eq('id', id)
			.single();

		if (sakeError || !sake) {
			return NextResponse.json(
				{ error: 'Sake not found' },
				{ status: 404 }
			);
		}

		// Get all tastings for this sake
		const { data: tastings, error: tastingsError } = await supabase
			.from('tastings')
			.select('*')
			.eq('sake_id', id)
			.order('tasting_date', { ascending: false });

		if (tastingsError) {
			console.error('Error fetching tastings:', tastingsError);
		}

		// Get all scores for each tasting
		const tastingIds = tastings?.map(t => t.id) || [];
		let scores: any[] = [];
		
		if (tastingIds.length > 0) {
			const { data: scoresData, error: scoresError } = await supabase
				.from('scores')
				.select(`
					*,
					tasters (
						id,
						name,
						avatar_url
					)
				`)
				.in('tasting_id', tastingIds);

			if (scoresError) {
				console.error('Error fetching scores:', scoresError);
			} else {
				scores = scoresData || [];
			}
		}

		// Calculate statistics
		const allScores = scores.map(s => s.score);
		const averageScore = allScores.length > 0
			? allScores.reduce((a, b) => a + b, 0) / allScores.length
			: null;

		return NextResponse.json({
			sake,
			tastings: tastings || [],
			scores,
			stats: {
				average_score: averageScore,
				total_tastings: tastings?.length || 0,
				total_scores: scores.length,
			},
		});
	} catch (error) {
		console.error('Error in GET /api/sakes/[id]:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
