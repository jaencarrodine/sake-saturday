import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

type TasterCardProps = {
	taster: {
		id: string;
		name: string;
		avatar_url?: string | null;
		total_scores?: number;
		average_score?: number;
	};
	className?: string;
};

export default function TasterCard({ taster, className }: TasterCardProps) {
	return (
		<Link
			href={`/taster/${taster.id}`}
			className={cn(
				'group flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-gold/50 transition-all duration-300',
				className
			)}
		>
			<div className="relative w-12 h-12 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0">
				{taster.avatar_url ? (
					<Image
						src={taster.avatar_url}
						alt={taster.name}
						fill
						className="object-cover"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center text-zinc-600 font-semibold">
						{taster.name.charAt(0).toUpperCase()}
					</div>
				)}
			</div>
			<div className="flex-1 min-w-0">
				<h3 className="font-semibold text-foreground truncate">
					{taster.name}
				</h3>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					{taster.total_scores !== undefined && (
						<span>{taster.total_scores} scores</span>
					)}
					{taster.average_score !== undefined && (
						<>
							<span>•</span>
							<span>Avg: {taster.average_score.toFixed(1)}</span>
						</>
					)}
				</div>
			</div>
		</Link>
	);
}
