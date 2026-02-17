import Link from 'next/link';
import Image from 'next/image';
import ScoreBadge from './ScoreBadge';
import { cn } from '@/lib/utils';

type TastingCardProps = {
	tasting: {
		id: string;
		date: string;
		location_name?: string | null;
		front_image?: string | null;
		sake?: {
			id: string;
			name: string;
		};
		average_score?: number;
		score_count?: number;
	};
	className?: string;
};

export default function TastingCard({ tasting, className }: TastingCardProps) {
	const date = new Date(tasting.date);
	const formattedDate = date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});

	return (
		<Link
			href={`/tasting/${tasting.id}`}
			className={cn(
				'group block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-gold/50 transition-all duration-300',
				className
			)}
		>
			<div className="aspect-video relative bg-zinc-800">
				{tasting.front_image ? (
					<Image
						src={tasting.front_image}
						alt="Tasting"
						fill
						className="object-cover group-hover:scale-105 transition-transform duration-300"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center text-zinc-600">
						<svg
							className="w-12 h-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1}
								d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
							/>
						</svg>
					</div>
				)}
				{tasting.average_score !== undefined && (
					<div className="absolute top-3 right-3">
						<ScoreBadge score={tasting.average_score} />
					</div>
				)}
			</div>
			<div className="p-4 space-y-2">
				{tasting.sake && (
					<>
						<h3 className="font-semibold text-foreground line-clamp-1">
							{tasting.sake.name}
						</h3>
					</>
				)}
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>{formattedDate}</span>
					{tasting.score_count !== undefined && (
						<span>{tasting.score_count} scores</span>
					)}
				</div>
				{tasting.location_name && (
					<p className="text-xs text-muted-foreground line-clamp-1">
						📍 {tasting.location_name}
					</p>
				)}
			</div>
		</Link>
	);
}
