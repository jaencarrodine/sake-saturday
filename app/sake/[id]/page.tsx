'use client';

import Link from 'next/link';
import Frame from '@/components/Frame';
import GridArea from '@/components/GridArea';
import BlockGauge from '@/components/DataDisplay/BlockGauge';
import NumberScramble from '@/components/DataDisplay/NumberScramble';
import { notFound } from 'next/navigation';
import { useSakeDetail } from '@/hooks/useSakeDetail';
import { use, useMemo } from 'react';

type RouteParams = {
	params: Promise<{ id: string }>;
};

export default function SakePage({ params }: RouteParams) {
	const { id } = use(params);
	const { data, isLoading, error } = useSakeDetail(id);

	if (error || (!isLoading && !data?.sake)) {
		notFound();
	}

	const sake = data?.sake;
	const tastings = data?.tastings || [];
	const scores = data?.scores || [];

	// Calculate statistics
	const allScores = scores.map((s: any) => s.score);
	const averageScore = allScores.length > 0
		? allScores.reduce((a, b) => a + b, 0) / allScores.length
		: null;

	const highestScore = allScores.length > 0 ? Math.max(...allScores) : null;
	const lowestScore = allScores.length > 0 ? Math.min(...allScores) : null;

	// Group scores by tasting
	const scoresByTasting = useMemo(() => {
		return (tastings as any[])?.map((tasting: any) => {
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
	}, [tastings, scores]);

	// Helper function to get score label
	const getScoreLabel = (score: number) => {
		if (score >= 9) return "LEGENDARY";
		if (score >= 8) return "EXCELLENT";
		if (score >= 7) return "GREAT";
		if (score >= 6) return "GOOD";
		if (score >= 5) return "DECENT";
		return "FAIR";
	};

	if (!sake) {
		return null;
	}

	return (
		<Frame title={`【 ${sake.name} 】`}>
			<div className="space-y-6">
				{/* Navigation */}
				<div className="text-cyan hover:text-primary-highlight transition-colors">
					<Link href="/">← BACK TO HOME</Link>
				</div>

				{/* Main Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
					{/* Left Column - Sake Info */}
					<div className="lg:col-span-4">
						<GridArea title="ake Info" titleJa="酒情報" highlight="S">
							<div className="space-y-4">
								{/* Sake name with Japanese */}
								<div>
									<div className="text-2xl text-sake-gold mb-2">{sake.name}</div>
									{averageScore !== null && (
										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<span className="text-muted">SCORE:</span>
												<span className="text-3xl text-neon-pink">{averageScore.toFixed(1)}</span>
											</div>
											<BlockGauge value={averageScore / 10} blockLength={15} />
											<div className="text-right text-sm text-green">
												{getScoreLabel(averageScore)}
											</div>
										</div>
									)}
								</div>

								{/* Terminal-style key-value stats */}
								<div className="space-y-1 text-sm font-mono border-t border-divider pt-4">
									{sake.bottling_company && (
										<div className="flex">
											<span className="text-muted w-32">BREWERY:</span>
											<span className="text-white">{sake.bottling_company}</span>
										</div>
									)}
									{sake.prefecture && (
										<div className="flex">
											<span className="text-muted w-32">PREFECTURE:</span>
											<span className="text-white">{sake.prefecture}</span>
										</div>
									)}
									{sake.grade && (
										<div className="flex">
											<span className="text-muted w-32">GRADE:</span>
											<span className="text-sake-gold">{sake.grade}</span>
										</div>
									)}
									{sake.type && (
										<div className="flex">
											<span className="text-muted w-32">TYPE:</span>
											<span className="text-white">{sake.type}</span>
										</div>
									)}
									{sake.rice && (
										<div className="flex">
											<span className="text-muted w-32">RICE:</span>
											<span className="text-white">{sake.rice}</span>
										</div>
									)}
									{sake.polishing_ratio && (
										<div className="flex">
											<span className="text-muted w-32">POLISH:</span>
											<span className="text-white">{sake.polishing_ratio}%</span>
										</div>
									)}
									{sake.alc_percentage && (
										<div className="flex">
											<span className="text-muted w-32">ABV:</span>
											<span className="text-white">{sake.alc_percentage}%</span>
										</div>
									)}
									{sake.smv !== null && sake.smv !== undefined && (
										<div className="flex">
											<span className="text-muted w-32">SMV:</span>
											<span className="text-white">{sake.smv > 0 ? '+' : ''}{sake.smv}</span>
										</div>
									)}
									{sake.opacity && (
										<div className="flex">
											<span className="text-muted w-32">OPACITY:</span>
											<span className="text-white">{sake.opacity}</span>
										</div>
									)}
								</div>

								{/* Profile */}
								{sake.profile && (
									<div className="border-t border-divider pt-4">
										<div className="text-muted text-sm mb-2">PROFILE:</div>
										<div className="text-white text-sm">{sake.profile}</div>
									</div>
								)}

								{/* Serving temps */}
								{sake.recommended_serving_temperatures && (
									<div className="border-t border-divider pt-4">
										<div className="text-muted text-sm mb-2">SERVING:</div>
										<div className="text-white text-sm">{sake.recommended_serving_temperatures}</div>
									</div>
								)}
							</div>
						</GridArea>

						{/* Statistics */}
						<div className="mt-6">
							<GridArea title="tatistics" titleJa="統計" highlight="S">
								<div className="grid grid-cols-2 gap-4 text-center">
									<div>
										<div className="text-3xl text-cyan">
											<NumberScramble value={tastings?.length || 0} decimals={0} isLoading={isLoading} />
										</div>
										<div className="text-muted text-sm mt-1">TASTINGS</div>
									</div>
									<div>
										<div className="text-3xl text-neon-pink">
											<NumberScramble value={scores.length} decimals={0} isLoading={isLoading} />
										</div>
										<div className="text-muted text-sm mt-1">SCORES</div>
									</div>
									{highestScore !== null && (
										<div>
											<div className="text-3xl text-green">
												<NumberScramble value={highestScore} decimals={1} isLoading={isLoading} />
											</div>
											<div className="text-muted text-sm mt-1">HIGHEST</div>
										</div>
									)}
									{lowestScore !== null && (
										<div>
											<div className="text-3xl text-red">
												<NumberScramble value={lowestScore} decimals={1} isLoading={isLoading} />
											</div>
											<div className="text-muted text-sm mt-1">LOWEST</div>
										</div>
									)}
								</div>
							</GridArea>
						</div>
					</div>

					{/* Right Column - Taster Scores & Tastings */}
					<div className="lg:col-span-8 space-y-6">
						{/* Taster Scores */}
						<GridArea title="aster Scores" titleJa="利酒師スコア" highlight="T">
							<div className="space-y-2">
								{scores.length > 0 ? (
									scores.map((score: any) => (
										<Link
											key={score.id}
											href={`/taster/${score.taster_id}`}
											className="flex items-center justify-between py-2 border-b border-divider hover:border-primary-highlight transition-colors"
										>
											<div className="flex items-center gap-3">
												<span className="text-cyan">&gt;</span>
												<span className="text-white">{score.tasters?.name}</span>
											</div>
											<div className="flex items-center gap-3">
												<BlockGauge value={score.score / 10} blockLength={10} />
												<span className={`text-xl w-12 text-right ${
													score.score >= 8 ? 'text-green' :
													score.score >= 7 ? 'text-sake-gold' :
													score.score >= 6 ? 'text-white' :
													'text-red'
												}`}>
													{score.score.toFixed(1)}
												</span>
											</div>
										</Link>
									))
								) : (
									<div className="text-muted text-center py-8">
										NO SCORES YET
									</div>
								)}
							</div>
						</GridArea>

						{/* All Tastings */}
						<GridArea title="ll Tastings" titleJa="全利酒" highlight="A">
							<div className="space-y-4">
								{scoresByTasting.length > 0 ? (
									scoresByTasting.map(({ tasting, scores: tastingScores, average_score }: any) => {
										const tastingDate = new Date(tasting.date);
										const formattedDate = tastingDate.toLocaleDateString('en-US', {
											weekday: 'short',
											year: 'numeric',
											month: 'short',
											day: 'numeric',
										});

										return (
											<div key={tasting.id} className="border border-divider p-4">
												<div className="flex items-start justify-between mb-3">
													<div>
														<Link
															href={`/tasting/${tasting.id}`}
															className="text-cyan hover:text-primary-highlight transition-colors"
														>
															{formattedDate}
														</Link>
														{tasting.location_name && (
															<div className="text-muted text-sm mt-1">
																📍 {tasting.location_name}
															</div>
														)}
													</div>
													{average_score !== null && (
														<div className="text-right">
															<div className="text-2xl text-white">{average_score.toFixed(1)}</div>
															<div className="text-sm text-muted">{getScoreLabel(average_score)}</div>
														</div>
													)}
												</div>

												{/* Taster scores for this tasting */}
												<div className="space-y-1 text-sm">
													{tastingScores.map((score: any) => (
														<div
															key={score.id}
															className="flex items-center justify-between py-1"
														>
															<Link
																href={`/taster/${score.taster_id}`}
																className="text-white hover:text-cyan transition-colors"
															>
																{score.tasters?.name}
															</Link>
															<div className="flex items-center gap-2">
																<BlockGauge value={score.score / 10} blockLength={8} />
																<span className="text-white w-8 text-right">{score.score.toFixed(1)}</span>
															</div>
														</div>
													))}
												</div>
											</div>
										);
									})
								) : (
									<div className="text-muted text-center py-8">
										NO TASTINGS YET FOR THIS SAKE
									</div>
								)}
							</div>
						</GridArea>
					</div>
				</div>
			</div>
		</Frame>
	);
}
