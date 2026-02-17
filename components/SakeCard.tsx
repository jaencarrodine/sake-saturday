import Link from 'next/link';
import Image from 'next/image';
import ScoreBadge from './ScoreBadge';
import { cn } from '@/lib/utils';

type SakeCardProps = {
	sake: {
		id: string | null;
		name: string | null;
		prefecture: string | null;
		grade: string | null;
		type: string | null;
		avg_score: number | null;
		total_tastings: number | null;
		total_scores: number | null;
	};
	className?: string;
};

export default function SakeCard({ sake, className }: SakeCardProps) {
	if (!sake.id) return null;

	return (
		<Link
			href={`/sake/${sake.id}`}
			className={cn(
				'group block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-gold/50 transition-all duration-300',
				className
			)}
		>
			<div className="aspect-[3/4] relative bg-zinc-800">
				<div className="w-full h-full flex items-center justify-center text-zinc-600">
					<svg
						className="w-16 h-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1}
							d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
						/>
					</svg>
				</div>
				{sake.avg_score !== null && (
					<div className="absolute top-3 right-3">
						<ScoreBadge score={sake.avg_score} size="lg" />
					</div>
				)}
			</div>
			<div className="p-4 space-y-2">
				<h3 className="font-semibold text-foreground line-clamp-1">
					{sake.name}
				</h3>
				{sake.prefecture && (
					<p className="text-sm text-muted-foreground line-clamp-1">
						{sake.prefecture}
					</p>
				)}
				<div className="flex items-center gap-3 text-xs text-muted-foreground">
					<span>{sake.total_tastings || 0} tastings</span>
					<span>•</span>
					<span>{sake.total_scores || 0} scores</span>
				</div>
			</div>
		</Link>
	);
}
