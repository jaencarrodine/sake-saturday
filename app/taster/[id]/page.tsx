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
						<GridArea title="TASTER INFO" titleJa="利酒師情報">
							<div className="space-y-4">
								<div className="w-32 h-32 mx-auto panel overflow-hidden">
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
										<div className="w-full h-full flex items-center justify-center bg-inactive text-white text-5xl">
											{taster.name.charAt(0).toUpperCase()}
										</div>
									)}
								</div>

								<div className="text-center">
									<div className="text-2xl text-sake-gold font-noto">{taster.name}</div>
									<div className="mt-2">
										<span className="text-3xl" style={{ color: rank.color }}>{rank.kanji}</span>
										<div className="text-sm text-muted mt-1">
											{rank.romaji} — {rank.english}
										</div>
									</div>
									{nextRankInfo && (
										<div className="mt-3 border-t border-divider pt-3">
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
										<div className="mt-3 text-xs neon-pink font-pixel">MAX RANK</div>
									)}
									{taster.phone_number && (
										<div className="text-muted text-sm mt-2">{taster.phone_number}</div>
									)}
								</div>

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
												<div className="flex items-start justify-between mb-3">
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
