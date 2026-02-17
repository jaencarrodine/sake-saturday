import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

type TasterCardProps = {
	taster: {
		id: string;
		name: string;
		profile_pic?: string | null;
		tastings_count?: number;
		avg_score_given?: number;
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
				{taster.profile_pic ? (
					<Image
						src={taster.profile_pic}
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
					{taster.tastings_count !== undefined && (
						<span>{taster.tastings_count} tastings</span>
					)}
					{taster.avg_score_given !== undefined && (
						<>
							<span>•</span>
							<span>Avg: {taster.avg_score_given.toFixed(1)}</span>
						</>
					)}
				</div>
			</div>
		</Link>
	);
}
