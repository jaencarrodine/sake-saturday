'use client';

import Image from 'next/image';
import Link from 'next/link';
import Frame from '@/components/Frame';
import GridArea from '@/components/GridArea';
import BlockGauge from '@/components/DataDisplay/BlockGauge';
import NumberScramble from '@/components/DataDisplay/NumberScramble';
import { notFound } from 'next/navigation';
import { useTasterDetail } from '@/hooks/useTasterDetail';
import { getRank, getNextRank } from '@/lib/tasterRanks';
import { use, useMemo } from 'react';

type RouteParams = {
	params: Promise<{ id: string }>;
};

export default function TasterPage({ params }: RouteParams) {
	const { id } = use(params);
	const { data, isLoading, error } = useTasterDetail(id);

	if (error || (!isLoading && !data?.taster)) {
		notFound();
	}

	const taster = data?.taster;
	const scores = data?.scores || [];

	const allScores = scores?.map((s: any) => s.score) || [];
	const averageScore = allScores.length > 0
		? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length
		: null;

	const highestScore = allScores.length > 0 ? Math.max(...allScores) : null;
	const lowestScore = allScores.length > 0 ? Math.min(...allScores) : null;

	const uniqueSakes = useMemo(() => {
		return new Set(scores?.map((s: any) => s.tastings?.sake_id).filter(Boolean));
	}, [scores]);
	const totalSakesTasted = uniqueSakes.size;
	const rank = getRank(totalSakesTasted);
	const nextRankInfo = getNextRank(totalSakesTasted);
	const profileImageUrl = taster?.ai_profile_image_url || taster?.profile_pic;

	const favoriteSake = useMemo(() => {
		const sakeFrequency = new Map<string, number>();
		scores?.forEach((score: any) => {
			const sakeId = score.tastings?.sake_id;
			if (sakeId) {
				sakeFrequency.set(sakeId, (sakeFrequency.get(sakeId) || 0) + 1);
			}
		});

		const favoriteSakeId = Array.from(sakeFrequency.entries())
			.sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0]?.[0];

		return scores?.find((s: any) => s.tastings?.sake_id === favoriteSakeId)?.tastings?.sakes;
	}, [scores]);

	const getScoreLabel = (score: number) => {
		if (score >= 9) return "LEGENDARY";
		if (score >= 8) return "EXCELLENT";
		if (score >= 7) return "GREAT";
		if (score >= 6) return "GOOD";
		if (score >= 5) return "DECENT";
		return "FAIR";
	};

	if (!taster) {
		return null;
	}

	return (
		<Frame title="TASTER PROFILE">
			<div className="space-y-6">
				<div className="text-neon-cyan hover:opacity-80 transition-opacity">
					<Link href="/">← BACK TO HOME</Link>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
					<div className="lg:col-span-4 space-y-6">
						<GridArea title="TASTER CARD" titleJa="利酒師カード">
							<div className="space-y-4">
								<div className="panel overflow-hidden">
									<div className="relative aspect-[3/4] bg-black">
										{profileImageUrl ? (
											<Image
												src={profileImageUrl}
												alt={taster.name}
												fill
												className="object-cover"
												priority
											/>
										) : (
											<div className="w-full h-full flex items-center justify-center bg-inactive text-white text-8xl">
												{taster.name.charAt(0).toUpperCase()}
											</div>
										)}

										<div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

										<div className="absolute inset-x-0 top-0 p-4">
											<div className="inline-block rounded-sm border border-neon-cyan bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-neon-cyan">
												PLAYER CARD
											</div>
										</div>

										<div className="absolute inset-x-0 bottom-0 p-4">
											<div className="text-2xl text-sake-gold font-noto leading-tight">{taster.name}</div>
											<div className="mt-2 flex items-end justify-between gap-3">
												<div>
													<div className="text-[10px] uppercase tracking-[0.2em] text-white/70">RANK</div>
													<div className="text-sm text-white">
														{rank.romaji} — {rank.english}
													</div>
												</div>
												<div className="text-4xl leading-none font-noto" style={{ color: rank.color }}>
													{rank.kanji}
												</div>
											</div>
										</div>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-2">
									<div className="border border-divider bg-black/30 px-3 py-2 text-center">
										<div className="text-[10px] uppercase tracking-[0.2em] text-muted">Scores</div>
										<div className="font-pixel text-lg text-white">{scores.length}</div>
									</div>
									<div className="border border-divider bg-black/30 px-3 py-2 text-center">
										<div className="text-[10px] uppercase tracking-[0.2em] text-muted">Sakes</div>
										<div className="font-pixel text-lg neon-pink">{totalSakesTasted}</div>
									</div>
									<div className="border border-divider bg-black/30 px-3 py-2 text-center">
										<div className="text-[10px] uppercase tracking-[0.2em] text-muted">Average</div>
										<div className="font-pixel text-lg text-sake-gold">
											{averageScore !== null ? averageScore.toFixed(1) : '--'}
										</div>
									</div>
									<div className="border border-divider bg-black/30 px-3 py-2 text-center">
										<div className="text-[10px] uppercase tracking-[0.2em] text-muted">Top</div>
										<div className="font-pixel text-lg text-green">
											{highestScore !== null ? highestScore.toFixed(1) : '--'}
										</div>
									</div>
								</div>

								{nextRankInfo && (
									<div className="border-t border-divider pt-3">
										<div className="text-xs text-muted mb-1 uppercase">
											NEXT: {nextRankInfo.nextRank.kanji} {nextRankInfo.nextRank.romaji} ({nextRankInfo.remaining} more)
										</div>
										<BlockGauge
											value={nextRankInfo.progress}
											blockLength={12}
											startColor="#79C39A"
											midColor="#79C39A"
											endColor="#79C39A"
										/>
									</div>
								)}

								{!nextRankInfo && totalSakesTasted > 0 && (
									<div className="text-xs neon-pink font-pixel text-center">MAX RANK</div>
								)}

								{averageScore !== null && (
									<div className="border-t border-divider pt-4">
										<div className="text-muted text-sm mb-2 text-center uppercase">AVERAGE SCORE:</div>
										<div className="text-center">
											<div className="neon-pink font-pixel text-3xl mb-2">{averageScore.toFixed(1)}</div>
											<BlockGauge value={averageScore / 10} blockLength={15} className="justify-center" />
										</div>
									</div>
								)}
							</div>
						</GridArea>

						<GridArea title="STATISTICS" titleJa="統計">
							<div className="grid grid-cols-2 gap-4">
								<div className="text-center">
									<div className="font-pixel text-2xl">
										<NumberScramble value={scores?.length || 0} decimals={0} isLoading={isLoading} />
									</div>
									<div className="text-muted text-sm mt-1 uppercase tracking-wider">SCORES</div>
								</div>
								<div className="text-center">
									<div className="font-pixel text-2xl neon-pink">
										<NumberScramble value={totalSakesTasted} decimals={0} isLoading={isLoading} />
									</div>
									<div className="text-muted text-sm mt-1 uppercase tracking-wider">SAKES</div>
								</div>
								{highestScore !== null && (
									<div className="text-center">
										<div className="font-pixel text-2xl text-green">
											<NumberScramble value={highestScore} decimals={1} isLoading={isLoading} />
										</div>
										<div className="text-muted text-sm mt-1 uppercase tracking-wider">HIGHEST</div>
									</div>
								)}
								{lowestScore !== null && (
									<div className="text-center">
										<div className="font-pixel text-2xl text-red">
											<NumberScramble value={lowestScore} decimals={1} isLoading={isLoading} />
										</div>
										<div className="text-muted text-sm mt-1 uppercase tracking-wider">LOWEST</div>
									</div>
								)}
							</div>
						</GridArea>

						{favoriteSake && (
							<GridArea title="MOST TASTED" titleJa="最多試飲">
								<Link
									href={`/sake/${favoriteSake.id}`}
									className="block hover:opacity-80 transition-opacity"
								>
									<div className="space-y-2">
										<div className="text-sake-gold text-lg font-noto">{favoriteSake.name}</div>
										<div className="text-neon-pink text-sm">→ VIEW SAKE DETAILS</div>
									</div>
								</Link>
							</GridArea>
						)}
					</div>

					<div className="lg:col-span-8">
						<GridArea title="SCORE HISTORY" titleJa="スコア履歴">
							<div className="space-y-4">
								{scores && scores.length > 0 ? (
									scores.map((score: any) => {
										const sake = score.tastings?.sakes;
										const sakeImageUrl = sake?.ai_bottle_image_url || sake?.image_url;
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
												className="panel p-4 hover:border-neon-cyan transition-colors"
											>
												<div className="flex items-start justify-between gap-3 mb-3">
													<div className="flex flex-1 min-w-0 gap-3">
														<div className="w-12 h-16 border border-divider overflow-hidden bg-black flex-shrink-0">
															{sakeImageUrl ? (
																<Image
																	src={sakeImageUrl}
																	alt={`${sake?.name || 'Sake'} bottle`}
																	width={48}
																	height={64}
																	className="w-full h-full object-cover"
																/>
															) : (
																<div className="w-full h-full flex items-center justify-center text-[10px] text-muted uppercase">
																	No Img
																</div>
															)}
														</div>

														<div className="flex-1 min-w-0">
															{sake && (
																<Link
																	href={`/sake/${sake.id}`}
																	className="text-white text-lg hover:text-neon-cyan transition-colors truncate block font-noto"
																>
																	{sake.name}
																</Link>
															)}
															{tastingDate && (
																<Link
																	href={`/tasting/${score.tasting_id}`}
																	className="text-muted text-sm hover:text-neon-cyan transition-colors mt-1 block"
																>
																	{tastingDate}
																</Link>
															)}
														</div>
													</div>

													<div className="text-right ml-4">
														<div className={`font-pixel text-2xl ${
															score.score >= 8 ? 'text-green' :
															score.score >= 7 ? 'text-sake-gold' :
															score.score >= 6 ? 'text-white' :
															'text-red'
														}`}>
															{score.score.toFixed(1)}
														</div>
														<div className="text-sm text-muted uppercase">{getScoreLabel(score.score)}</div>
													</div>
												</div>

												<BlockGauge value={score.score / 10} blockLength={20} className="mb-3" />

												{score.notes && (
													<div className="border-t border-divider pt-3 mt-3">
														<div className="text-muted text-sm mb-2 uppercase">NOTES:</div>
														<div className="text-white text-sm whitespace-pre-wrap">
															{score.notes}
														</div>
													</div>
												)}
											</div>
										);
									})
								) : (
									<div className="text-muted text-center py-12">
										NO SCORES YET FOR THIS TASTER
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
