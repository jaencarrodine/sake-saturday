import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

type LeaderboardEntry = {
	id: string | null;
	name: string | null;
	profile_pic?: string | null;
	tastings_count: number | null;
	avg_score_given: number | null;
};

type LeaderboardProps = {
	tasters: LeaderboardEntry[] | null;
	className?: string;
};

export default function Leaderboard({ tasters, className }: LeaderboardProps) {
	if (!tasters) return null;

	return (
		<div className={cn('space-y-3', className)}>
			<h2 className="text-xl font-bold text-foreground">Taster Leaderboard</h2>
			<div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900">
				{tasters.length === 0 ? (
					<div className="w-full text-center py-8 text-muted-foreground">
						No tasters yet
					</div>
				) : (
					tasters.map((taster, index) => {
						if (!taster.id || !taster.name) return null;
						return (
							<Link
								key={taster.id}
								href={`/taster/${taster.id}`}
								className="group flex-shrink-0 w-32 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-gold/50 transition-all duration-300"
							>
								<div className="space-y-2">
									<div className="relative">
										<div className="relative w-20 h-20 mx-auto rounded-full overflow-hidden bg-zinc-800">
											{taster.profile_pic ? (
												<Image
													src={taster.profile_pic}
													alt={taster.name}
													fill
													className="object-cover"
												/>
											) : (
												<div className="w-full h-full flex items-center justify-center text-zinc-600 font-semibold text-2xl">
													{taster.name.charAt(0).toUpperCase()}
												</div>
											)}
										</div>
										{index < 3 && (
											<div
												className={cn(
													'absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
													index === 0 && 'bg-yellow-500 text-yellow-950',
													index === 1 && 'bg-gray-400 text-gray-900',
													index === 2 && 'bg-amber-700 text-amber-100'
												)}
											>
												{index + 1}
											</div>
										)}
									</div>
									<div className="text-center">
										<h3 className="font-semibold text-sm text-foreground truncate">
											{taster.name}
										</h3>
										{taster.avg_score_given !== null && (
											<div className="text-xs text-gold font-semibold">
												{taster.avg_score_given.toFixed(1)}
											</div>
										)}
										<div className="text-xs text-muted-foreground">
											{taster.tastings_count || 0} tastings
										</div>
									</div>
								</div>
							</Link>
						);
					})
				)}
			</div>
		</div>
	);
}
