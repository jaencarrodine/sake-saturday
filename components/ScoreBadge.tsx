import { cn } from '@/lib/utils';

type ScoreBadgeProps = {
	score: number;
	size?: 'sm' | 'md' | 'lg';
	className?: string;
};

export default function ScoreBadge({ score, size = 'md', className }: ScoreBadgeProps) {
	// Color by range: red <5, yellow 5-7, green >7
	const getColorClass = (score: number) => {
		if (score < 5) return 'bg-red-500/10 text-red-400 border-red-500/20';
		if (score <= 7) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
		return 'bg-green-500/10 text-green-400 border-green-500/20';
	};

	const getSizeClass = (size: string) => {
		switch (size) {
			case 'sm':
				return 'text-xs px-2 py-0.5';
			case 'lg':
				return 'text-lg px-4 py-2';
			default:
				return 'text-sm px-3 py-1';
		}
	};

	return (
		<span
			className={cn(
				'inline-flex items-center justify-center rounded-full border font-semibold',
				getColorClass(score),
				getSizeClass(size),
				className
			)}
		>
			{score.toFixed(1)}
		</span>
	);
}
