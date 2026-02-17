import { createClient } from '@/lib/supabase/server';
import Image from 'next/image';
import Link from 'next/link';
import ScoreBadge from '@/components/ScoreBadge';
import { notFound } from 'next/navigation';

type RouteParams = {
	params: Promise<{ id: string }>;
};

export default async function TastingPage({ params }: RouteParams) {
	const { id } = await params;
	const supabase = await createClient();

	// Get tasting details
	const { data: tasting, error: tastingError } = await supabase
		.from('tastings')
		.select(`
			*,
			sakes (
				id,
				name,
				name_japanese,
				image_url,
				brewery,
				prefecture,
				type,
				grade
			)
		`)
		.eq('id', id)
		.single();

	if (tastingError || !tasting) {
		notFound();
	}

	// Get all scores for this tasting
	const { data: scores } = await supabase
		.from('scores')
		.select(`
			*,
			tasters (
				id,
				name,
				avatar_url
			)
		`)
		.eq('tasting_id', id)
		.order('score', { ascending: false });

	// Calculate statistics
	const allScores = scores?.map(s => s.score) || [];
	const averageScore = allScores.length > 0
		? allScores.reduce((a, b) => a + b, 0) / allScores.length
		: null;

	const date = new Date(tasting.tasting_date);
	const formattedDate = date.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});

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
							{/* Tasting Image */}
							{tasting.image_url && (
								<div className="aspect-video relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
									<Image
										src={tasting.image_url}
										alt="Tasting"
										fill
										className="object-cover"
										priority
									/>
								</div>
							)}

							{/* Sake Info Card */}
							{tasting.sakes && (
								<Link
									href={`/sake/${tasting.sakes.id}`}
									className="block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-gold/50 transition-all duration-300"
								>
									<div className="aspect-[3/4] relative bg-zinc-800">
										{tasting.sakes.image_url ? (
											<Image
												src={tasting.sakes.image_url}
												alt={tasting.sakes.name}
												fill
												className="object-cover"
											/>
										) : (
											<div className="w-full h-full flex items-center justify-center text-zinc-600">
												<svg
													className="w-16 h-16"
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
										)}
									</div>
									<div className="p-4">
										<h3 className="font-semibold text-foreground line-clamp-2">
											{tasting.sakes.name}
										</h3>
										{tasting.sakes.name_japanese && (
											<p className="text-sm text-muted-foreground font-noto line-clamp-1 mt-1">
												{tasting.sakes.name_japanese}
											</p>
										)}
										{tasting.sakes.brewery && (
											<p className="text-sm text-muted-foreground mt-2">
												{tasting.sakes.brewery}
											</p>
										)}
									</div>
								</Link>
							)}

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
								</div>
							</div>
						</div>
					</div>

					{/* Main Content */}
					<div className="lg:col-span-2 space-y-8">
						{/* Tasting Info */}
						<div>
							<h1 className="text-4xl font-bold text-foreground mb-2">Tasting Session</h1>
							<p className="text-xl text-muted-foreground mb-4">{formattedDate}</p>

							{tasting.location && (
								<div className="flex items-center gap-2 text-muted-foreground mb-4">
									<span>📍</span>
									<span>{tasting.location}</span>
								</div>
							)}

							{tasting.notes && (
								<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mt-6">
									<h3 className="font-semibold text-lg mb-2">Notes</h3>
									<p className="text-muted-foreground whitespace-pre-wrap">{tasting.notes}</p>
								</div>
							)}
						</div>

						{/* Scores Breakdown */}
						<div>
							<h2 className="text-2xl font-bold text-foreground mb-4">Scores by Taster</h2>
							{scores && scores.length > 0 ? (
								<div className="space-y-4">
									{scores.map((score: any) => (
										<div
											key={score.id}
											className="bg-zinc-900 border border-zinc-800 rounded-xl p-6"
										>
											<div className="flex items-start justify-between mb-4">
												<Link
													href={`/taster/${score.taster_id}`}
													className="flex items-center gap-3 hover:text-gold transition-colors"
												>
													<div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0">
														{score.tasters?.avatar_url ? (
															<Image
																src={score.tasters.avatar_url}
																alt={score.tasters.name}
																width={48}
																height={48}
																className="object-cover"
															/>
														) : (
															<div className="w-full h-full flex items-center justify-center text-zinc-600 font-semibold text-xl">
																{score.tasters?.name?.charAt(0).toUpperCase()}
															</div>
														)}
													</div>
													<div>
														<h3 className="font-semibold text-lg">{score.tasters?.name}</h3>
													</div>
												</Link>
												<ScoreBadge score={score.score} size="lg" />
											</div>

											{/* Detailed Scores */}
											{(score.aroma_score || score.flavor_score || score.finish_score) && (
												<div className="grid grid-cols-3 gap-4 mb-4">
													{score.aroma_score !== null && (
														<div className="text-center">
															<div className="text-sm text-muted-foreground mb-1">Aroma</div>
															<ScoreBadge score={score.aroma_score} size="sm" />
														</div>
													)}
													{score.flavor_score !== null && (
														<div className="text-center">
															<div className="text-sm text-muted-foreground mb-1">Flavor</div>
															<ScoreBadge score={score.flavor_score} size="sm" />
														</div>
													)}
													{score.finish_score !== null && (
														<div className="text-center">
															<div className="text-sm text-muted-foreground mb-1">Finish</div>
															<ScoreBadge score={score.finish_score} size="sm" />
														</div>
													)}
												</div>
											)}

											{/* Notes */}
											{score.notes && (
												<div className="bg-zinc-800/50 rounded-lg p-4">
													<p className="text-muted-foreground whitespace-pre-wrap">{score.notes}</p>
												</div>
											)}
										</div>
									))}
								</div>
							) : (
								<div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
									<p className="text-muted-foreground">No scores yet for this tasting.</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
