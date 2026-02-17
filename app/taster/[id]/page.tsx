import { createClient } from '@/lib/supabase/server';
import Image from 'next/image';
import Link from 'next/link';
import Frame from '@/components/Frame';
import GridArea from '@/components/GridArea';
import BlockGauge from '@/components/DataDisplay/BlockGauge';
import NumberScramble from '@/components/DataDisplay/NumberScramble';
import { notFound } from 'next/navigation';

type RouteParams = {
	params: Promise<{ id: string }>;
};

export default async function TasterPage({ params }: RouteParams) {
	const { id } = await params;
	const supabase = await createClient();

	// Get taster details
	const { data: taster, error: tasterError } = await supabase
		.from('tasters')
		.select('*')
		.eq('id', id)
		.single();

	if (tasterError || !taster) {
		notFound();
	}

	// Get all scores by this taster
	const { data: scores } = await supabase
		.from('scores')
		.select(`
			*,
			tastings (
				id,
				date,
				sake_id,
				sakes (
					id,
					name
				)
			)
		`)
		.eq('taster_id', id)
		.order('created_at', { ascending: false });

	// Calculate statistics
	const allScores = scores?.map((s: any) => s.score) || [];
	const averageScore = allScores.length > 0
		? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length
		: null;

	const highestScore = allScores.length > 0 ? Math.max(...allScores) : null;
	const lowestScore = allScores.length > 0 ? Math.min(...allScores) : null;

	// Get unique sakes tasted
	const uniqueSakes = new Set(scores?.map((s: any) => s.tastings?.sake_id).filter(Boolean));
	const totalSakesTasted = uniqueSakes.size;

	// Get favorite sake (most frequently tasted)
	const sakeFrequency = new Map<string, number>();
	scores?.forEach((score: any) => {
		const sakeId = score.tastings?.sake_id;
		if (sakeId) {
			sakeFrequency.set(sakeId, (sakeFrequency.get(sakeId) || 0) + 1);
		}
	});

	const favoriteSakeId = Array.from(sakeFrequency.entries())
		.sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0]?.[0];

	const favoriteSake = scores?.find((s: any) => s.tastings?.sake_id === favoriteSakeId)?.tastings?.sakes;

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
		<Frame title={`【 TASTER PROFILE 利酒師 】`}>
			<div className="space-y-6">
				{/* Navigation */}
				<div className="text-cyan hover:text-primary-highlight transition-colors">
					<Link href="/">← BACK TO HOME</Link>
				</div>

				{/* Main Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
					{/* Left Column - Taster Info */}
					<div className="lg:col-span-4 space-y-6">
						{/* Taster Card */}
						<GridArea title="aster Info" titleJa="利酒師情報" highlight="T">
							<div className="space-y-4">
								{/* Avatar */}
								<div className="w-32 h-32 mx-auto border border-primary overflow-hidden">
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

								{/* Name */}
								<div className="text-center">
									<div className="text-2xl text-sake-gold">{taster.name}</div>
									{taster.phone_number && (
										<div className="text-muted text-sm mt-2">{taster.phone_number}</div>
									)}
								</div>

								{/* Average Score */}
								{averageScore !== null && (
									<div className="border-t border-divider pt-4">
										<div className="text-muted text-sm mb-2 text-center">AVERAGE SCORE:</div>
										<div className="text-center">
											<div className="text-4xl text-neon-pink mb-2">{averageScore.toFixed(1)}</div>
											<BlockGauge value={averageScore / 10} blockLength={15} className="justify-center" />
										</div>
									</div>
								)}
							</div>
						</GridArea>

						{/* Statistics */}
						<GridArea title="tatistics" titleJa="統計" highlight="S">
							<div className="grid grid-cols-2 gap-4">
								<div className="text-center">
									<div className="text-3xl text-cyan">
										<NumberScramble value={scores?.length || 0} decimals={0} />
									</div>
									<div className="text-muted text-sm mt-1">SCORES</div>
								</div>
								<div className="text-center">
									<div className="text-3xl text-neon-pink">
										<NumberScramble value={totalSakesTasted} decimals={0} />
									</div>
									<div className="text-muted text-sm mt-1">SAKES</div>
								</div>
								{highestScore !== null && (
									<div className="text-center">
										<div className="text-3xl text-green">
											<NumberScramble value={highestScore} decimals={1} />
										</div>
										<div className="text-muted text-sm mt-1">HIGHEST</div>
									</div>
								)}
								{lowestScore !== null && (
									<div className="text-center">
										<div className="text-3xl text-red">
											<NumberScramble value={lowestScore} decimals={1} />
										</div>
										<div className="text-muted text-sm mt-1">LOWEST</div>
									</div>
								)}
							</div>
						</GridArea>

						{/* Favorite Sake */}
						{favoriteSake && (
							<GridArea title="ost Tasted" titleJa="最多試飲" highlight="M">
								<Link
									href={`/sake/${favoriteSake.id}`}
									className="block hover:text-cyan transition-colors"
								>
									<div className="space-y-2">
										<div className="text-sake-gold text-lg">{favoriteSake.name}</div>
										<div className="text-cyan text-sm">→ VIEW SAKE DETAILS</div>
									</div>
								</Link>
							</GridArea>
						)}
					</div>

					{/* Right Column - Score History */}
					<div className="lg:col-span-8">
						<GridArea title="core History" titleJa="スコア履歴" highlight="S">
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
												className="border border-divider p-4 hover:border-primary-highlight transition-colors"
											>
												<div className="flex items-start justify-between mb-3">
													<div className="flex-1 min-w-0">
														{sake && (
															<Link
																href={`/sake/${sake.id}`}
																className="text-white text-lg hover:text-cyan transition-colors truncate block"
															>
																{sake.name}
															</Link>
														)}
														{tastingDate && (
															<Link
																href={`/tasting/${score.tasting_id}`}
																className="text-muted text-sm hover:text-cyan transition-colors mt-1 block"
															>
																{tastingDate}
															</Link>
														)}
													</div>
													<div className="text-right ml-4">
														<div className={`text-3xl ${
															score.score >= 8 ? 'text-green' :
															score.score >= 7 ? 'text-sake-gold' :
															score.score >= 6 ? 'text-white' :
															'text-red'
														}`}>
															{score.score.toFixed(1)}
														</div>
														<div className="text-sm text-muted">{getScoreLabel(score.score)}</div>
													</div>
												</div>

												{/* Block Gauge */}
												<BlockGauge value={score.score / 10} blockLength={20} className="mb-3" />

												{/* Notes */}
												{score.notes && (
													<div className="border-t border-divider pt-3 mt-3">
														<div className="text-muted text-sm mb-2">NOTES:</div>
														<div className="text-white text-sm whitespace-pre-wrap font-mono">
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
