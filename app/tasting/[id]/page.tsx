'use client';

import Image from 'next/image';
import Link from 'next/link';
import Frame from '@/components/Frame';
import GridArea from '@/components/GridArea';
import BlockGauge from '@/components/DataDisplay/BlockGauge';
import NumberScramble from '@/components/DataDisplay/NumberScramble';
import { notFound } from 'next/navigation';
import { useTastingDetail } from '@/hooks/useTastingDetail';
import { use } from 'react';

type RouteParams = {
	params: Promise<{ id: string }>;
};

export default function TastingPage({ params }: RouteParams) {
	const { id } = use(params);
	const { data, isLoading, error } = useTastingDetail(id);

	if (error || (!isLoading && !data?.tasting)) {
		notFound();
	}

	const tasting = data?.tasting;
	const scores = data?.scores || [];

	// Calculate statistics
	const allScores = scores?.map((s: any) => s.score) || [];
	const averageScore = allScores.length > 0
		? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length
		: null;

	if (!tasting) {
		return null;
	}

	const tastingDate = new Date(tasting.date);
	const formattedDate = tastingDate.toLocaleDateString('en-US', {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});

	// Helper function to get score label
	const getScoreLabel = (score: number) => {
		if (score >= 9) return "LEGENDARY";
		if (score >= 8) return "EXCELLENT";
		if (score >= 7) return "GREAT";
		if (score >= 6) return "GOOD";
		if (score >= 5) return "DECENT";
		return "FAIR";
	};

	return (
		<Frame title={`【 TASTING SESSION 利酒会 】`}>
			<div className="space-y-6">
				{/* Navigation */}
				<div className="text-cyan hover:text-primary-highlight transition-colors">
					<Link href="/">← BACK TO HOME</Link>
				</div>

				{/* Main Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
					{/* Left Column - Tasting Info */}
					<div className="lg:col-span-4">
						{/* Tasting Image */}
						{tasting.front_image && (
							<div className="mb-6 border border-primary overflow-hidden">
								<div className="aspect-video relative bg-black">
									<Image
										src={tasting.front_image}
										alt="Tasting"
										fill
										className="object-cover"
										priority
									/>
								</div>
							</div>
						)}

						{/* Tasting Details */}
						<GridArea title="asting Info" titleJa="利酒情報" highlight="T">
							<div className="space-y-4">
								<div>
									<div className="text-muted text-sm">DATE:</div>
									<div className="text-cyan text-xl">{formattedDate}</div>
								</div>

								{tasting.location_name && (
									<div>
										<div className="text-muted text-sm">LOCATION:</div>
										<div className="text-white">📍 {tasting.location_name}</div>
									</div>
								)}

								{averageScore !== null && (
									<div className="border-t border-divider pt-4">
										<div className="text-muted text-sm mb-2">AVERAGE SCORE:</div>
										<div className="flex items-center justify-between">
											<span className="text-3xl text-neon-pink">{averageScore.toFixed(1)}</span>
											<span className="text-green">{getScoreLabel(averageScore)}</span>
										</div>
										<BlockGauge value={averageScore / 10} blockLength={15} className="mt-2" />
									</div>
								)}

								<div className="border-t border-divider pt-4">
									<div className="text-center">
										<div className="text-3xl text-cyan">
											<NumberScramble value={scores?.length || 0} decimals={0} isLoading={isLoading} />
										</div>
										<div className="text-muted text-sm mt-1">TOTAL SCORES</div>
									</div>
								</div>
							</div>
						</GridArea>

						{/* Sake Info Card */}
						{tasting.sakes && (
							<div className="mt-6">
								<GridArea title="ake Tasted" titleJa="試飲酒" highlight="S">
									<Link
										href={`/sake/${tasting.sakes.id}`}
										className="block hover:text-cyan transition-colors"
									>
										<div className="space-y-2">
											<div className="text-sake-gold text-xl">{tasting.sakes.name}</div>
											{tasting.sakes.prefecture && (
												<div className="text-muted text-sm">{tasting.sakes.prefecture}</div>
											)}
											{(tasting.sakes.type || tasting.sakes.grade) && (
												<div className="text-white text-sm">
													{[tasting.sakes.type, tasting.sakes.grade].filter(Boolean).join(' • ')}
												</div>
											)}
											<div className="text-cyan text-sm mt-2">→ VIEW SAKE DETAILS</div>
										</div>
									</Link>
								</GridArea>
							</div>
						)}
					</div>

					{/* Right Column - Scores */}
					<div className="lg:col-span-8">
						<GridArea title="cores by Taster" titleJa="利酒師スコア" highlight="S">
							<div className="space-y-4">
								{scores && scores.length > 0 ? (
									scores.map((score: any) => (
										<div
											key={score.id}
											className="border border-divider p-4 hover:border-primary-highlight transition-colors"
										>
											{/* Taster Header */}
											<div className="flex items-start justify-between mb-4">
												<Link
													href={`/taster/${score.taster_id}`}
													className="flex items-center gap-3 hover:text-cyan transition-colors"
												>
													<span className="text-primary-highlight">&gt;</span>
													<div>
														<div className="text-white text-xl">{score.tasters?.name}</div>
													</div>
												</Link>
												<div className="text-right">
													<div className={`text-3xl ${
														score.score >= 8 ? 'text-green' :
														score.score >= 7 ? 'text-sake-gold' :
														score.score >= 6 ? 'text-white' :
														'text-red'
													}`}>
														{score.score.toFixed(1)}
													</div>
													<div className="text-sm text-muted">{getScoreLabel(score.score)}</div>
												</div>
											</div>

											{/* Block Gauge */}
											<BlockGauge value={score.score / 10} blockLength={20} className="mb-4" />

											{/* Notes */}
											{score.notes && (
												<div className="border-t border-divider pt-4 mt-4">
													<div className="text-muted text-sm mb-2">NOTES:</div>
													<div className="text-white text-sm whitespace-pre-wrap font-mono">
														{score.notes}
													</div>
												</div>
											)}
										</div>
									))
								) : (
									<div className="text-muted text-center py-12">
										NO SCORES YET FOR THIS TASTING
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
