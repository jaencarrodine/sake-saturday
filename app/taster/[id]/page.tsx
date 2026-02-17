import { createClient } from '@/lib/supabase/server';
import Image from 'next/image';
import Link from 'next/link';
import ScoreBadge from '@/components/ScoreBadge';
import { notFound } from 'next/navigation';

type RouteParams = {
	params: Promise<{ id: string }>;
};

export default async function TasterPage({ params }: RouteParams) {
	const { id } = await params;
	const supabase = await createClient();

	// Get taster details
	const { data: taster, error: tasterError } = await supabase
		.from('tasters')
		.select('*')
		.eq('id', id)
		.single();

	if (tasterError || !taster) {
		notFound();
	}

	// Get all scores by this taster
	const { data: scores } = await supabase
		.from('scores')
		.select(`
			*,
			tastings (
				id,
				date,
				sake_id,
				sakes (
					id,
					name
				)
			)
		`)
		.eq('taster_id', id)
		.order('created_at', { ascending: false });

	// Calculate statistics
	const allScores = scores?.map((s: any) => s.score) || [];
	const averageScore = allScores.length > 0
		? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length
		: null;

	const highestScore = allScores.length > 0 ? Math.max(...allScores) : null;
	const lowestScore = allScores.length > 0 ? Math.min(...allScores) : null;

	// Get unique sakes tasted
	const uniqueSakes = new Set(scores?.map((s: any) => s.tastings?.sake_id).filter(Boolean));
	const totalSakesTasted = uniqueSakes.size;

	// Get favorite sake (most frequently tasted)
	const sakeFrequency = new Map<string, number>();
	scores?.forEach((score: any) => {
		const sakeId = score.tastings?.sake_id;
		if (sakeId) {
			sakeFrequency.set(sakeId, (sakeFrequency.get(sakeId) || 0) + 1);
		}
	});

	const favoriteSakeId = Array.from(sakeFrequency.entries())
		.sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0]?.[0];

	const favoriteSake = scores?.find((s: any) => s.tastings?.sake_id === favoriteSakeId)?.tastings?.sakes;

	return (
		<div className="min-h-screen bg-gradient-to-b from-background to-zinc-950">
			{/* Header */}
			<header className="border-b border-zinc-800 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
				<div className="container mx-auto px-4 py-4">
					<Link href="/" className="text-gold hover:text-gold/80 transition-colors">
						← Back to Home
					</Link>
				</div>
			</header>

			<main className="container mx-auto px-4 py-8">
				<div className="grid lg:grid-cols-3 gap-8">
					{/* Sidebar */}
					<div className="lg:col-span-1">
						<div className="sticky top-24 space-y-6">
							{/* Taster Avatar */}
							<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
								<div className="w-32 h-32 mx-auto rounded-full overflow-hidden bg-zinc-800 mb-4">
									{taster.profile_pic ? (
										<Image
											src={taster.profile_pic}
											alt={taster.name}
											width={128}
											height={128}
											className="object-cover"
											priority
										/>
									) : (
										<div className="w-full h-full flex items-center justify-center text-zinc-600 font-bold text-5xl">
											{taster.name.charAt(0).toUpperCase()}
										</div>
									)}
								</div>
								<h1 className="text-2xl font-bold text-foreground text-center mb-2">
									{taster.name}
								</h1>
								{taster.phone_number && (
									<p className="text-sm text-muted-foreground text-center">{taster.phone_number}</p>
								)}
							</div>

							{/* Stats */}
							<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
								<h3 className="font-semibold text-lg">Statistics</h3>
								<div className="space-y-3">
									{averageScore !== null && (
										<div>
											<div className="text-sm text-muted-foreground mb-1">Average Score</div>
											<ScoreBadge score={averageScore} size="lg" />
										</div>
									)}
									<div>
										<div className="text-sm text-muted-foreground mb-1">Total Scores</div>
										<div className="text-2xl font-bold text-foreground">{scores?.length || 0}</div>
									</div>
									<div>
										<div className="text-sm text-muted-foreground mb-1">Sakes Tasted</div>
										<div className="text-2xl font-bold text-foreground">{totalSakesTasted}</div>
									</div>
									{highestScore !== null && (
										<div>
											<div className="text-sm text-muted-foreground mb-1">Highest Score</div>
											<div className="text-2xl font-bold text-green-400">{highestScore.toFixed(1)}</div>
										</div>
									)}
									{lowestScore !== null && (
										<div>
											<div className="text-sm text-muted-foreground mb-1">Lowest Score</div>
											<div className="text-2xl font-bold text-red-400">{lowestScore.toFixed(1)}</div>
										</div>
									)}
								</div>
							</div>

							{/* Favorite Sake */}
							{favoriteSake && (
								<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
									<h3 className="font-semibold text-lg mb-3">Most Tasted Sake</h3>
									<Link
										href={`/sake/${favoriteSake.id}`}
										className="block hover:opacity-80 transition-opacity"
									>
										<div className="aspect-[3/4] relative bg-zinc-800 rounded-lg overflow-hidden mb-3">
											<div className="w-full h-full flex items-center justify-center text-zinc-600">
												<svg
													className="w-12 h-12"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={1}
														d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
													/>
												</svg>
											</div>
										</div>
										<h4 className="font-medium text-foreground">{favoriteSake.name}</h4>
									</Link>
								</div>
							)}
						</div>
					</div>

					{/* Main Content */}
					<div className="lg:col-span-2 space-y-8">
						{/* All Scores */}
						<div>
							<h2 className="text-2xl font-bold text-foreground mb-4">All Scores</h2>
							{scores && scores.length > 0 ? (
								<div className="space-y-4">
									{scores.map((score: any) => {
										const sake = score.tastings?.sakes;
										const tastingDate = score.tastings?.date
											? new Date(score.tastings.date).toLocaleDateString('en-US', {
													month: 'short',
													day: 'numeric',
													year: 'numeric',
											  })
											: null;

										return (
											<div
												key={score.id}
												className="bg-zinc-900 border border-zinc-800 rounded-xl p-6"
											>
												<div className="flex items-start gap-4">
													{/* Sake Image */}
													{sake && (
														<Link
															href={`/sake/${sake.id}`}
															className="flex-shrink-0 w-20 h-28 relative bg-zinc-800 rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
														>
															<div className="w-full h-full flex items-center justify-center text-zinc-600">
																<svg
																	className="w-8 h-8"
																	fill="none"
																	viewBox="0 0 24 24"
																	stroke="currentColor"
																>
																	<path
																		strokeLinecap="round"
																		strokeLinejoin="round"
																		strokeWidth={1}
																		d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
																	/>
																</svg>
															</div>
														</Link>
													)}

													{/* Score Info */}
													<div className="flex-1 min-w-0">
														<div className="flex items-start justify-between mb-2">
															<div>
																{sake && (
																	<Link
																		href={`/sake/${sake.id}`}
																		className="font-semibold text-foreground hover:text-gold transition-colors"
																	>
																		{sake.name}
																	</Link>
																)}
																{tastingDate && (
																	<Link
																		href={`/tasting/${score.tasting_id}`}
																		className="text-xs text-muted-foreground hover:text-gold transition-colors mt-1 block"
																	>
																		{tastingDate}
																	</Link>
																)}
															</div>
															<ScoreBadge score={score.score} />
														</div>

														{/* Notes */}
														{score.notes && (
															<div className="bg-zinc-800/50 rounded-lg p-3">
																<p className="text-sm text-muted-foreground whitespace-pre-wrap">
																	{score.notes}
																</p>
															</div>
														)}
													</div>
												</div>
											</div>
										);
									})}
								</div>
							) : (
								<div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
									<p className="text-muted-foreground">No scores yet for this taster.</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
