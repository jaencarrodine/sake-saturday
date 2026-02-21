'use client';

import Image from 'next/image';
import Link from 'next/link';
import Frame from '@/components/Frame';
import GridArea from '@/components/GridArea';
import BlockGauge from '@/components/DataDisplay/BlockGauge';
import NumberScramble from '@/components/DataDisplay/NumberScramble';
import ImageGallery from '@/components/ImageGallery';
import { notFound } from 'next/navigation';
import { useSakeDetail } from '@/hooks/useSakeDetail';
import { use, useMemo } from 'react';

export const dynamic = 'force-dynamic';

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
	const images = data?.images || [];
	
	const galleryImages = images
		.map((img: any) => {
			const imageUrl = img.generated_image_url || img.original_image_url;
			if (!imageUrl) return null;
			return {
				id: img.id,
				url: imageUrl,
				type: img.image_type,
				isAiGenerated: !!img.generated_image_url,
			};
		})
		.filter(Boolean) as Array<{ id: string; url: string; type: string; isAiGenerated: boolean }>;

	const bottleImageUrl =
		sake?.ai_bottle_image_url ||
		sake?.image_url ||
		galleryImages.find((image: any) =>
			['bottle_art', 'bottle', 'bottle_image', 'bottle_photo', 'original', 'original_photo'].includes(image.type)
		)?.url ||
		null;

	const allScores = scores.map((s: any) => s.score);
	const averageScore = allScores.length > 0
		? allScores.reduce((a, b) => a + b, 0) / allScores.length
		: null;

	const highestScore = allScores.length > 0 ? Math.max(...allScores) : null;
	const lowestScore = allScores.length > 0 ? Math.min(...allScores) : null;

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
		<Frame title={sake.name}>
			<div className="space-y-6">
				<div className="text-neon-cyan hover:opacity-80 transition-opacity">
					<Link href="/">← BACK TO HOME</Link>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
					<div className="lg:col-span-4 space-y-6">
						<GridArea title="SAKE INFO" titleJa="酒情報">
							<div className="space-y-4">
								<div className="panel overflow-hidden">
									<div className="relative aspect-[3/4] bg-black">
										{bottleImageUrl ? (
											<Image
												src={bottleImageUrl}
												alt={sake.name}
												fill
												className="object-cover"
												priority
											/>
										) : (
											<div className="w-full h-full flex items-center justify-center bg-inactive text-white text-center px-6">
												<div>
													<div className="text-xs uppercase tracking-[0.25em] text-muted mb-2">No Bottle Image</div>
													<div className="font-noto text-3xl text-sake-gold">{sake.name}</div>
												</div>
											</div>
										)}

										<div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

										<div className="absolute inset-x-0 top-0 p-4">
											<div className="inline-block rounded-sm border border-neon-cyan bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-neon-cyan">
												BOTTLE CARD
											</div>
										</div>

										<div className="absolute inset-x-0 bottom-0 p-4">
											<div className="text-2xl text-sake-gold font-noto leading-tight">{sake.name}</div>
											<div className="mt-1 text-sm text-white">
												{[sake.type, sake.grade].filter(Boolean).join(' • ') || 'SAKE PROFILE'}
											</div>
										</div>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-2">
									<div className="border border-divider bg-black/30 px-3 py-2 text-center">
										<div className="text-[10px] uppercase tracking-[0.2em] text-muted">Average</div>
										<div className="font-pixel text-lg neon-pink">
											{averageScore !== null ? averageScore.toFixed(1) : '--'}
										</div>
									</div>
									<div className="border border-divider bg-black/30 px-3 py-2 text-center">
										<div className="text-[10px] uppercase tracking-[0.2em] text-muted">Tastings</div>
										<div className="font-pixel text-lg text-white">{tastings.length}</div>
									</div>
									<div className="border border-divider bg-black/30 px-3 py-2 text-center">
										<div className="text-[10px] uppercase tracking-[0.2em] text-muted">Scores</div>
										<div className="font-pixel text-lg text-sake-gold">{scores.length}</div>
									</div>
									<div className="border border-divider bg-black/30 px-3 py-2 text-center">
										<div className="text-[10px] uppercase tracking-[0.2em] text-muted">Peak</div>
										<div className="font-pixel text-lg text-green">
											{highestScore !== null ? highestScore.toFixed(1) : '--'}
										</div>
									</div>
								</div>

								{averageScore !== null && (
									<div className="space-y-2 border-t border-divider pt-4">
										<div className="flex items-center justify-between">
											<span className="text-muted text-sm uppercase">SCORE:</span>
											<span className="neon-pink font-pixel text-2xl">{averageScore.toFixed(1)}</span>
										</div>
										<BlockGauge value={averageScore / 10} blockLength={15} />
										<div className="text-right text-sm text-green uppercase tracking-wider">
											{getScoreLabel(averageScore)}
										</div>
									</div>
								)}

								<div className="space-y-1 text-sm border-t border-divider pt-4">
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

								{sake.profile && (
									<div className="border-t border-divider pt-4">
										<div className="text-muted text-sm mb-2 uppercase">PROFILE:</div>
										<div className="text-white text-sm">{sake.profile}</div>
									</div>
								)}

								{sake.recommended_serving_temperatures && (
									<div className="border-t border-divider pt-4">
										<div className="text-muted text-sm mb-2 uppercase">SERVING:</div>
										<div className="text-white text-sm">{sake.recommended_serving_temperatures}</div>
									</div>
								)}
							</div>
						</GridArea>

						<GridArea title="STATISTICS" titleJa="統計">
							<div className="grid grid-cols-2 gap-4 text-center">
								<div>
									<div className="font-pixel text-2xl">
										<NumberScramble value={tastings?.length || 0} decimals={0} isLoading={isLoading} />
									</div>
									<div className="text-muted text-sm mt-1 uppercase tracking-wider">TASTINGS</div>
								</div>
								<div>
									<div className="font-pixel text-2xl neon-pink">
										<NumberScramble value={scores.length} decimals={0} isLoading={isLoading} />
									</div>
									<div className="text-muted text-sm mt-1 uppercase tracking-wider">SCORES</div>
								</div>
								{highestScore !== null && (
									<div>
										<div className="font-pixel text-2xl text-green">
											<NumberScramble value={highestScore} decimals={1} isLoading={isLoading} />
										</div>
										<div className="text-muted text-sm mt-1 uppercase tracking-wider">HIGHEST</div>
									</div>
								)}
								{lowestScore !== null && (
									<div>
										<div className="font-pixel text-2xl text-red">
											<NumberScramble value={lowestScore} decimals={1} isLoading={isLoading} />
										</div>
										<div className="text-muted text-sm mt-1 uppercase tracking-wider">LOWEST</div>
									</div>
								)}
							</div>
						</GridArea>
					</div>

					<div className="lg:col-span-8 space-y-6">
						{galleryImages.length > 0 && (
							<GridArea title="TASTING IMAGES" titleJa="画像">
								<ImageGallery images={galleryImages} />
							</GridArea>
						)}

						<GridArea title="TASTER SCORES" titleJa="利酒師スコア">
							<div className="space-y-2">
								{scores.length > 0 ? (
									scores.map((score: any) => {
										const tasterImageUrl = score.tasters?.ai_profile_image_url || score.tasters?.profile_pic;
										return (
											<Link
												key={score.id}
												href={`/taster/${score.taster_id}`}
												className="flex items-center justify-between py-2 border-b border-divider last:border-0 hover:bg-neon-cyan hover:bg-opacity-5 transition-colors px-2 -mx-2"
											>
												<div className="flex items-center gap-3 min-w-0">
													<span className="text-neon-cyan">&gt;</span>
													<div className="w-8 h-8 border border-divider overflow-hidden bg-black flex-shrink-0">
														{tasterImageUrl ? (
															<Image
																src={tasterImageUrl}
																alt={score.tasters?.name || 'Taster'}
																width={32}
																height={32}
																className="w-full h-full object-cover"
															/>
														) : (
															<div className="w-full h-full flex items-center justify-center text-xs text-muted">
																{score.tasters?.name?.charAt(0)?.toUpperCase() || '?'}
															</div>
														)}
													</div>
													<span className="text-white truncate">{score.tasters?.name}</span>
												</div>
												<div className="flex items-center gap-3">
													<BlockGauge value={score.score / 10} blockLength={10} />
													<span className={`font-pixel text-base w-12 text-right ${
														score.score >= 8 ? 'text-green' :
														score.score >= 7 ? 'text-sake-gold' :
														score.score >= 6 ? 'text-white' :
														'text-red'
													}`}>
														{score.score.toFixed(1)}
													</span>
												</div>
											</Link>
										);
									})
								) : (
									<div className="text-muted text-center py-8">
										NO SCORES YET
									</div>
								)}
							</div>
						</GridArea>

						<GridArea title="ALL TASTINGS" titleJa="全利酒">
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
											<div key={tasting.id} className="panel p-4">
												<div className="flex items-start justify-between mb-3">
													<div>
														<Link
															href={`/tasting/${tasting.id}`}
															className="text-neon-cyan hover:opacity-80 transition-opacity"
														>
															{formattedDate}
														</Link>
														{tasting.location_name && (
															<div className="text-muted text-sm mt-1">
																{tasting.location_name}
															</div>
														)}
													</div>
													{average_score !== null && (
														<div className="text-right">
															<div className="font-pixel text-xl neon-pink">{average_score.toFixed(1)}</div>
															<div className="text-sm text-muted uppercase">{getScoreLabel(average_score)}</div>
														</div>
													)}
												</div>

												<div className="space-y-1 text-sm">
													{tastingScores.map((score: any) => (
														<div
															key={score.id}
															className="flex items-center justify-between py-1"
														>
															<Link
																href={`/taster/${score.taster_id}`}
																className="text-white hover:text-neon-cyan transition-colors"
															>
																{score.tasters?.name}
															</Link>
															<div className="flex items-center gap-2">
																<BlockGauge value={score.score / 10} blockLength={8} />
																<span className="text-white w-8 text-right font-pixel text-xs">{score.score.toFixed(1)}</span>
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
