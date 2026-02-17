'use client';

import Frame from '@/components/Frame';
import GridArea from '@/components/GridArea';
import BlockGauge from '@/components/DataDisplay/BlockGauge';
import NumberScramble from '@/components/DataDisplay/NumberScramble';
import Link from 'next/link';
import { useSakeRankings } from '@/hooks/useSakeRankings';
import { useTasterLeaderboard } from '@/hooks/useTasterLeaderboard';
import { useRecentTastings } from '@/hooks/useRecentTastings';
import { useTastingScores } from '@/hooks/useTastingScores';
import { useStats } from '@/hooks/useStats';
import { getRank } from '@/lib/tasterRanks';
import { useMemo } from 'react';

export default function Home() {
	const { data: sakes, isLoading: sakesLoading } = useSakeRankings();
	const { data: tasterLeaderboard, isLoading: tastersLoading } = useTasterLeaderboard(8);
	const { data: tastings, isLoading: tastingsLoading } = useRecentTastings(6);
	const { data: stats, isLoading: statsLoading } = useStats();
	
	const tastingIds = useMemo(() => tastings?.map((t: any) => t.id) || [], [tastings]);
	const { data: tastingScores = [] } = useTastingScores(tastingIds);
	
	// Calculate average scores for tastings
	const tastingsWithScores = useMemo(() => {
		return tastings?.map((tasting: {
			id: string;
			date: string;
			location_name: string | null;
			front_image: string | null;
			sake_id: string;
			sakes: { id: string; name: string } | null;
		}) => {
			const scores = tastingScores.filter((s: { tasting_id: string; score: number }) => s.tasting_id === tasting.id);
			const averageScore = scores.length > 0
				? scores.reduce((sum: number, s: { score: number }) => sum + s.score, 0) / scores.length
				: undefined;

			return {
				...tasting,
				sake: tasting.sakes ? {
					id: tasting.sakes.id,
					name: tasting.sakes.name,
				} : undefined,
				average_score: averageScore,
				score_count: scores.length,
			};
		}) || [];
	}, [tastings, tastingScores]);

	// Get stats from dedicated query
	const totalSakes = stats?.sakeCount || 0;
	const totalTasters = stats?.tasterCount || 0;
	const totalTastings = stats?.tastingCount || 0;
	
	const isLoading = sakesLoading || tastersLoading || tastingsLoading || statsLoading;

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
		<Frame>
			{/* Grid Dashboard - Desktop: 12 column grid, Mobile: stacked */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
				{/* Sake Rankings - Large left section */}
				<div className="lg:col-span-7">
					<GridArea title="ake Rankings" titleJa="酒ランキング" highlight="S">
						<div className="space-y-3">
							{sakes && sakes.length > 0 ? (
								sakes.map((sake: any) => (
									<Link
										key={sake.id}
										href={`/sake/${sake.id}`}
										className="block border-b border-divider pb-3 hover:border-primary-highlight transition-colors"
									>
										<div className="flex items-start justify-between gap-4">
											<div className="flex-1 min-w-0">
												<div className="text-white text-lg truncate">
													{sake.name}
												</div>
												<div className="text-muted text-sm mt-1">
													{sake.grade && <span className="text-sake-gold">{sake.grade}</span>}
													{sake.prefecture && <span className="ml-2">{sake.prefecture}</span>}
												</div>
											</div>
											<div className="flex flex-col items-end gap-1">
												<div className={`text-lg ${
													(sake.avg_score || 0) >= 8 ? 'text-green' :
													(sake.avg_score || 0) >= 7 ? 'text-sake-gold' :
													'text-white'
												}`}>
													{sake.avg_score?.toFixed(1) || "N/A"}
												</div>
												<BlockGauge value={(sake.avg_score || 0) / 10} blockLength={10} />
											</div>
										</div>
									</Link>
								))
							) : (
								<div className="text-muted text-center py-8">
									NO SAKE DATA // START ADDING TASTINGS
								</div>
							)}
						</div>
					</GridArea>
				</div>

				{/* Right column - Stats and Taster Board */}
				<div className="lg:col-span-5 space-y-6">
					{/* Stats */}
					<GridArea title="tats" titleJa="統計" highlight="S">
						<div className="grid grid-cols-3 gap-4 text-center">
							<div>
								<div className="text-3xl text-sake-gold">
									<NumberScramble value={totalSakes} decimals={0} isLoading={isLoading} />
								</div>
								<div className="text-muted text-sm mt-1">SAKES</div>
							</div>
							<div>
								<div className="text-3xl text-neon-pink">
									<NumberScramble value={totalTastings} decimals={0} isLoading={isLoading} />
								</div>
								<div className="text-muted text-sm mt-1">TASTINGS</div>
							</div>
							<div>
								<div className="text-3xl text-white">
									<NumberScramble value={totalTasters} decimals={0} isLoading={isLoading} />
								</div>
								<div className="text-muted text-sm mt-1">TASTERS</div>
							</div>
						</div>
					</GridArea>

					{/* Taster Board */}
					<GridArea title="aster Board" titleJa="利酒師" highlight="T">
						<div className="space-y-2">
							{tasterLeaderboard && tasterLeaderboard.length > 0 ? (
								tasterLeaderboard.map((taster: any, index: number) => (
									<Link
										key={taster.id}
										href={`/taster/${taster.id}`}
										className="flex items-center justify-between text-sm hover:text-primary-highlight transition-colors"
									>
										<div className="flex items-center gap-2 flex-1 min-w-0">
											<span className="text-primary-highlight">&gt;</span>
											<span style={{ color: getRank(taster.tastings_count || 0).color }} title={getRank(taster.tastings_count || 0).romaji}>
												{getRank(taster.tastings_count || 0).kanji}
											</span>
											<span className="text-white truncate">{taster.name}</span>
										</div>
										<div className="flex items-center gap-2">
											<span className="text-dots">...........</span>
											<span className="text-neon-pink">{taster.tastings_count || 0} tastings</span>
											<span className="text-dots">..</span>
											<span className={`text-lg ${
												taster.avg_score_given >= 8 ? 'text-green' :
												taster.avg_score_given >= 7 ? 'text-sake-gold' :
												'text-white'
											}`}>
												avg: {taster.avg_score_given?.toFixed(1) || "N/A"}
											</span>
										</div>
									</Link>
								))
							) : (
								<div className="text-muted text-center py-4">
									NO TASTERS YET
								</div>
							)}
						</div>
					</GridArea>
				</div>

				{/* Recent Tastings - Full width bottom section */}
				<div className="lg:col-span-12">
					<GridArea title="ecent" titleJa="最近の利酒" highlight="R">
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{tastingsWithScores.length > 0 ? (
								tastingsWithScores.map((tasting: any) => {
									const tastingDate = new Date(tasting.date);
									const formattedDate = tastingDate.toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										year: 'numeric',
									});

									return (
										<Link
											key={tasting.id}
											href={`/tasting/${tasting.id}`}
											className="border border-divider p-4 hover:border-primary-highlight transition-colors"
										>
											<div className="space-y-2">
												<div className="flex items-start justify-between">
													<div className="text-muted text-sm">{formattedDate}</div>
													{tasting.average_score && (
														<div className="text-white text-lg">
															{tasting.average_score.toFixed(1)}
														</div>
													)}
												</div>
												<div className="text-white truncate">
													{tasting.sake?.name || "Unknown Sake"}
												</div>
												{tasting.location_name && (
													<div className="text-muted text-sm truncate">
														📍 {tasting.location_name}
													</div>
												)}
												{tasting.average_score && (
													<BlockGauge 
														value={tasting.average_score / 10} 
														blockLength={10}
													/>
												)}
											</div>
										</Link>
									);
								})
							) : (
								<div className="text-muted text-center py-8 col-span-full">
									NO RECENT TASTINGS
								</div>
							)}
						</div>
					</GridArea>
				</div>
			</div>
		</Frame>
	);
}
