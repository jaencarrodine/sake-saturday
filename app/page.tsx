import { createClient } from '@/lib/supabase/server';
import SakeCard from '@/components/SakeCard';
import Leaderboard from '@/components/Leaderboard';
import TastingCard from '@/components/TastingCard';

export default async function Home() {
	const supabase = await createClient();

	// Fetch sake rankings
	const { data: sakes } = await supabase
		.from('sake_rankings')
		.select('*')
		.order('average_score', { ascending: false, nullsFirst: false })
		.limit(12);

	// Fetch taster leaderboard
	const { data: scoresData } = await supabase
		.from('scores')
		.select(`
			taster_id,
			score,
			tasters (
				id,
				name,
				avatar_url
			)
		`);

	// Calculate taster stats
	const tasterStats = new Map<string, { 
		id: string;
		name: string;
		avatar_url: string | null;
		scores: number[];
	}>();

	scoresData?.forEach((score: any) => {
		if (!score.tasters) return;
		
		const tasterId = score.taster_id;
		if (!tasterStats.has(tasterId)) {
			tasterStats.set(tasterId, {
				id: score.tasters.id,
				name: score.tasters.name,
				avatar_url: score.tasters.avatar_url,
				scores: [],
			});
		}
		tasterStats.get(tasterId)!.scores.push(score.score);
	});

	const tasterLeaderboard = Array.from(tasterStats.values())
		.map(taster => ({
			id: taster.id,
			name: taster.name,
			avatar_url: taster.avatar_url,
			total_scores: taster.scores.length,
			average_score: taster.scores.reduce((a, b) => a + b, 0) / taster.scores.length,
		}))
		.sort((a, b) => b.average_score - a.average_score)
		.slice(0, 10);

	// Fetch recent tastings
	const { data: tastings } = await supabase
		.from('tastings')
		.select(`
			id,
			tasting_date,
			location,
			image_url,
			sake_id,
			sakes (
				id,
				name,
				name_japanese
			)
		`)
		.order('tasting_date', { ascending: false })
		.limit(6);

	// Get scores for recent tastings
	const tastingIds = tastings?.map(t => t.id) || [];
	let tastingScores: any[] = [];
	
	if (tastingIds.length > 0) {
		const { data } = await supabase
			.from('scores')
			.select('tasting_id, score')
			.in('tasting_id', tastingIds);
		tastingScores = data || [];
	}

	// Calculate average scores for tastings
	const tastingsWithScores = tastings?.map(tasting => {
		const scores = tastingScores.filter(s => s.tasting_id === tasting.id);
		const averageScore = scores.length > 0
			? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
			: undefined;

		return {
			...tasting,
			sake: tasting.sakes ? {
				id: tasting.sakes.id,
				name: tasting.sakes.name,
				name_japanese: tasting.sakes.name_japanese,
			} : undefined,
			average_score: averageScore,
			score_count: scores.length,
		};
	}) || [];

	return (
		<div className="min-h-screen bg-gradient-to-b from-background to-zinc-950">
			{/* Header */}
			<header className="border-b border-zinc-800 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
				<div className="container mx-auto px-4 py-6">
					<h1 className="text-3xl md:text-4xl font-bold">
						<span className="text-gold">Sake Saturday</span>
						<span className="ml-3 text-2xl font-noto text-muted-foreground">酒の土曜日</span>
					</h1>
					<p className="text-muted-foreground mt-2">Track, rate, and explore sake tastings</p>
				</div>
			</header>

			<main className="container mx-auto px-4 py-8 space-y-12">
				{/* Sake Rankings */}
				<section>
					<div className="flex items-center justify-between mb-6">
						<h2 className="text-2xl font-bold text-foreground">Top Sake Rankings</h2>
					</div>
					{sakes && sakes.length > 0 ? (
						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
							{sakes.map((sake) => (
								<SakeCard key={sake.sake_id} sake={sake} />
							))}
						</div>
					) : (
						<div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
							<p className="text-muted-foreground">No sake ranked yet. Start adding tastings!</p>
						</div>
					)}
				</section>

				{/* Taster Leaderboard */}
				<section>
					<Leaderboard tasters={tasterLeaderboard} />
				</section>

				{/* Recent Tastings */}
				<section>
					<div className="flex items-center justify-between mb-6">
						<h2 className="text-2xl font-bold text-foreground">Recent Tastings</h2>
					</div>
					{tastingsWithScores.length > 0 ? (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{tastingsWithScores.map((tasting) => (
								<TastingCard key={tasting.id} tasting={tasting} />
							))}
						</div>
					) : (
						<div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
							<p className="text-muted-foreground">No tastings yet. Start adding tastings!</p>
						</div>
					)}
				</section>
			</main>

			{/* Footer */}
			<footer className="border-t border-zinc-800 mt-16">
				<div className="container mx-auto px-4 py-8 text-center text-sm text-muted-foreground">
					<p>Sake Saturday &copy; {new Date().getFullYear()}</p>
				</div>
			</footer>
		</div>
	);
}
