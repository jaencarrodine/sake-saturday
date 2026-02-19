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

export const dynamic = 'force-dynamic';

export default function Home() {
	const { data: sakes, isLoading: sakesLoading } = useSakeRankings();
	const { data: tasterLeaderboard, isLoading: tastersLoading } = useTasterLeaderboard(8);
	const { data: tastings, isLoading: tastingsLoading } = useRecentTastings(6);
	const { data: stats, isLoading: statsLoading } = useStats();
	
	const tastingIds = useMemo(() => tastings?.map((t: any) => t.id) || [], [tastings]);
	const { data: tastingScores = [] } = useTastingScores(tastingIds);
	
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

	const totalSakes = stats?.sakeCount || 0;
	const totalTasters = stats?.tasterCount || 0;
	const totalTastings = stats?.tastingCount || 0;
	
	const isLoading = sakesLoading || tastersLoading || tastingsLoading || statsLoading;

	return (
		<Frame>
			{/* Stats Panel - Full Width */}
			<div className="mb-6">
				<GridArea title="SYSTEM STATS" titleJa="統計">
					<div className="grid grid-cols-3 gap-4 text-center">
						<div>
							<div className="font-pixel text-2xl md:text-3xl mb-2">
								<NumberScramble value={totalSakes} decimals={0} isLoading={isLoading} />
							</div>
							<div className="text-muted text-sm uppercase tracking-wider">SAKES LOGGED</div>
						</div>
						<div>
							<div className="font-pixel text-2xl md:text-3xl mb-2">
								<NumberScramble value={totalTastings} decimals={0} isLoading={isLoading} />
							</div>
							<div className="text-muted text-sm uppercase tracking-wider">TASTINGS</div>
						</div>
						<div>
							<div className="font-pixel text-2xl md:text-3xl mb-2">
								<NumberScramble value={totalTasters} decimals={0} isLoading={isLoading} />
							</div>
							<div className="text-muted text-sm uppercase tracking-wider">ACTIVE TASTERS</div>
						</div>
					</div>
				</GridArea>
			</div>

			{/* Main Content - 2 Column Layout */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
				{/* Sake Rankings - Left Column (7/12) */}
				<div className="lg:col-span-7">
					<GridArea title="SAKE RANKINGS" titleJa="酒ランキング">
						<div className="space-y-3">
							{sakes && sakes.length > 0 ? (
								sakes.map((sake: any) => (
									<Link
										key={sake.id}
										href={`/sake/${sake.id}`}
										className="block border-b border-divider pb-3 last:border-0 hover:bg-neon-cyan hover:bg-opacity-5 transition-colors px-2 -mx-2 py-2"
									>
										<div className="flex items-start justify-between gap-4">
											<div className="flex-1 min-w-0">
												<div className="text-white text-lg truncate mb-1">
													{sake.name}
												</div>
												<div className="text-sm">
													{sake.grade && <span className="text-neon-pink">{sake.grade}</span>}
													{sake.prefecture && <span className="text-muted ml-2">{sake.prefecture}</span>}
												</div>
											</div>
											<div className="flex flex-col items-end gap-2">
												<div className="neon-cyan font-pixel text-lg">
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

				{/* Taster Board - Right Column (5/12) */}
				<div className="lg:col-span-5">
					<GridArea title="TASTER BOARD" titleJa="利酒師">
						<div className="space-y-2">
							{tasterLeaderboard && tasterLeaderboard.length > 0 ? (
								tasterLeaderboard.map((taster: any) => (
									<Link
										key={taster.id}
										href={`/taster/${taster.id}`}
										className="flex items-center justify-between text-sm hover:bg-neon-cyan hover:bg-opacity-5 transition-colors px-2 -mx-2 py-1"
									>
										<div className="flex items-center gap-2 flex-1 min-w-0">
											<span className="text-neon-cyan">&gt;</span>
											<span style={{ color: getRank(taster.tastings_count || 0).color }} title={getRank(taster.tastings_count || 0).romaji}>
												{getRank(taster.tastings_count || 0).kanji}
											</span>
											<span className="text-white truncate">{taster.name}</span>
										</div>
										<div className="flex items-center gap-2 flex-shrink-0">
											<span className="text-dots">...........</span>
											<span className="text-neon-pink font-pixel text-xs">{taster.tastings_count || 0}</span>
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
			</div>

			{/* Recent Tastings - Full Width */}
			<GridArea title="RECENT" titleJa="最近の利酒">
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
									className="panel hover:border-neon-cyan transition-colors"
								>
									<div className="p-4 space-y-2">
										<div className="flex items-start justify-between">
											<div className="text-muted text-sm">{formattedDate}</div>
											{tasting.average_score && (
												<div className="neon-cyan font-pixel text-base">
													{tasting.average_score.toFixed(1)}
												</div>
											)}
										</div>
										<div className="text-white truncate">
											{tasting.sake?.name || "Unknown Sake"}
										</div>
										{tasting.location_name && (
											<div className="text-muted text-sm truncate">
												{tasting.location_name}
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
		</Frame>
	);
}
