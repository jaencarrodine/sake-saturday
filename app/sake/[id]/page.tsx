import { createClient } from '@/lib/supabase/server';
import Image from 'next/image';
import Link from 'next/link';
import ScoreBadge from '@/components/ScoreBadge';
import { notFound } from 'next/navigation';

type RouteParams = {
	params: Promise<{ id: string }>;
};

export default async function SakePage({ params }: RouteParams) {
	const { id } = await params;
	const supabase = await createClient();

	// Get sake details
	const { data: sake, error: sakeError } = await supabase
		.from('sakes')
		.select('*')
		.eq('id', id)
		.single();

	if (sakeError || !sake) {
		notFound();
	}

	// Get all tastings for this sake
	const { data: tastings } = await supabase
		.from('tastings')
		.select('*')
		.eq('sake_id', id)
		.order('date', { ascending: false });

	// Get all scores for this sake
	const tastingIds = tastings?.map(t => t.id) || [];
	let scores: any[] = [];

	if (tastingIds.length > 0) {
		const { data: scoresData } = await supabase
			.from('scores')
			.select(`
				*,
				tasters (
					id,
					name,
					profile_pic
				),
				tastings (
					id,
					date
				)
			`)
			.in('tasting_id', tastingIds);
		scores = scoresData || [];
	}

	// Calculate statistics
	const allScores = scores.map((s: any) => s.score);
	const averageScore = allScores.length > 0
		? allScores.reduce((a, b) => a + b, 0) / allScores.length
		: null;

	const highestScore = allScores.length > 0 ? Math.max(...allScores) : null;
	const lowestScore = allScores.length > 0 ? Math.min(...allScores) : null;

	// Group scores by tasting
	const scoresByTasting = (tastings as any[])?.map((tasting: any) => {
		const tastingScores = scores.filter((s: any) => s.tasting_id === tasting.id);
		const avgScore = tastingScores.length > 0
			? tastingScores.reduce((sum: number, s: any) => sum + s.score, 0) / tastingScores.length
			: null;

		return {
			tasting,
			scores: tastingScores,
			average_score: avgScore,
		};
	}) || [];

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
							{/* Sake Image */}
							<div className="aspect-[3/4] relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
								<div className="w-full h-full flex items-center justify-center text-zinc-600">
									<svg
										className="w-24 h-24"
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
										<div className="text-sm text-muted-foreground mb-1">Total Tastings</div>
										<div className="text-2xl font-bold text-foreground">{tastings?.length || 0}</div>
									</div>
									<div>
										<div className="text-sm text-muted-foreground mb-1">Total Scores</div>
										<div className="text-2xl font-bold text-foreground">{scores.length}</div>
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
						</div>
					</div>

					{/* Main Content */}
					<div className="lg:col-span-2 space-y-8">
						{/* Sake Info */}
						<div>
							<h1 className="text-4xl font-bold text-foreground mb-2">{sake.name}</h1>

							<div className="grid grid-cols-2 gap-4 mt-6">
								{sake.bottling_company && (
									<div>
										<div className="text-sm text-muted-foreground">Bottling Company</div>
										<div className="font-medium">{sake.bottling_company}</div>
									</div>
								)}
								{sake.prefecture && (
									<div>
										<div className="text-sm text-muted-foreground">Prefecture</div>
										<div className="font-medium">{sake.prefecture}</div>
									</div>
								)}
								{sake.type && (
									<div>
										<div className="text-sm text-muted-foreground">Type</div>
										<div className="font-medium">{sake.type}</div>
									</div>
								)}
								{sake.grade && (
									<div>
										<div className="text-sm text-muted-foreground">Grade</div>
										<div className="font-medium">{sake.grade}</div>
									</div>
								)}
								{sake.rice && (
									<div>
										<div className="text-sm text-muted-foreground">Rice</div>
										<div className="font-medium">{sake.rice}</div>
									</div>
								)}
								{sake.polishing_ratio && (
									<div>
										<div className="text-sm text-muted-foreground">Polishing Ratio</div>
										<div className="font-medium">{sake.polishing_ratio}%</div>
									</div>
								)}
								{sake.alc_percentage && (
									<div>
										<div className="text-sm text-muted-foreground">Alcohol</div>
										<div className="font-medium">{sake.alc_percentage}%</div>
									</div>
								)}
								{sake.smv !== null && sake.smv !== undefined && (
									<div>
										<div className="text-sm text-muted-foreground">SMV</div>
										<div className="font-medium">{sake.smv}</div>
									</div>
								)}
								{sake.opacity && (
									<div>
										<div className="text-sm text-muted-foreground">Opacity</div>
										<div className="font-medium">{sake.opacity}</div>
									</div>
								)}
							</div>

							{sake.profile && (
								<div className="mt-6">
									<div className="text-sm text-muted-foreground mb-2">Profile</div>
									<div className="text-foreground">{sake.profile}</div>
								</div>
							)}

							{sake.recommended_serving_temperatures && (
								<div className="mt-4">
									<div className="text-sm text-muted-foreground mb-2">Recommended Serving Temperatures</div>
									<div className="text-foreground">{sake.recommended_serving_temperatures}</div>
								</div>
							)}
						</div>

						{/* Tastings */}
						<div>
							<h2 className="text-2xl font-bold text-foreground mb-4">All Tastings</h2>
							{scoresByTasting.length > 0 ? (
								<div className="space-y-6">
									{scoresByTasting.map(({ tasting, scores: tastingScores, average_score }: any) => {
										const tastingDate = new Date(tasting.date);
										const formattedDate = tastingDate.toLocaleDateString('en-US', {
											weekday: 'long',
											year: 'numeric',
											month: 'long',
											day: 'numeric',
										});

										return (
											<div key={tasting.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
												<div className="flex items-start justify-between mb-4">
													<div>
														<Link
															href={`/tasting/${tasting.id}`}
															className="text-lg font-semibold text-gold hover:text-gold/80 transition-colors"
														>
															{formattedDate}
														</Link>
														{tasting.location_name && (
															<p className="text-sm text-muted-foreground mt-1">📍 {tasting.location_name}</p>
														)}
													</div>
													{average_score !== null && (
														<ScoreBadge score={average_score} />
													)}
												</div>

												{/* Scores */}
												<div className="space-y-2">
													<h4 className="text-sm font-semibold text-muted-foreground">Scores</h4>
													{tastingScores.map((score: any) => (
														<div
															key={score.id}
															className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-3"
														>
															<Link
																href={`/taster/${score.taster_id}`}
																className="flex items-center gap-3 hover:text-gold transition-colors"
															>
																<div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 flex-shrink-0">
																	{score.tasters?.profile_pic ? (
																		<Image
																			src={score.tasters.profile_pic}
																			alt={score.tasters.name}
																			width={32}
																			height={32}
																			className="object-cover"
																		/>
																	) : (
																		<div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs font-semibold">
																			{score.tasters?.name?.charAt(0).toUpperCase()}
																		</div>
																	)}
																</div>
																<span className="font-medium">{score.tasters?.name}</span>
															</Link>
															<ScoreBadge score={score.score} size="sm" />
														</div>
													))}
												</div>
											</div>
										);
									})}
								</div>
							) : (
								<div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
									<p className="text-muted-foreground">No tastings yet for this sake.</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
