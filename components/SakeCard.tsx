import Link from 'next/link';
import Image from 'next/image';
import ScoreBadge from './ScoreBadge';
import { cn } from '@/lib/utils';

type SakeCardProps = {
	sake: {
		sake_id: string | null;
		sake_name: string | null;
		sake_name_japanese: string | null;
		sake_image_url: string | null;
		average_score: number | null;
		total_tastings: number | null;
		total_scores: number | null;
	};
	className?: string;
};

export default function SakeCard({ sake, className }: SakeCardProps) {
	if (!sake.sake_id) return null;

	return (
		<Link
			href={`/sake/${sake.sake_id}`}
			className={cn(
				'group block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-gold/50 transition-all duration-300',
				className
			)}
		>
			<div className="aspect-[3/4] relative bg-zinc-800">
				{sake.sake_image_url ? (
					<Image
						src={sake.sake_image_url}
						alt={sake.sake_name || 'Sake'}
						fill
						className="object-cover group-hover:scale-105 transition-transform duration-300"
					/>
				) : (
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
				)}
				{sake.average_score !== null && (
					<div className="absolute top-3 right-3">
						<ScoreBadge score={sake.average_score} size="lg" />
					</div>
				)}
			</div>
			<div className="p-4 space-y-2">
				<h3 className="font-semibold text-foreground line-clamp-1">
					{sake.sake_name}
				</h3>
				{sake.sake_name_japanese && (
					<p className="text-sm text-muted-foreground font-noto line-clamp-1">
						{sake.sake_name_japanese}
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
