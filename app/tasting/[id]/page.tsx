'use client';

import Image from 'next/image';
import Link from 'next/link';
import Frame from '@/components/Frame';
import GridArea from '@/components/GridArea';
import BlockGauge from '@/components/DataDisplay/BlockGauge';
import NumberScramble from '@/components/DataDisplay/NumberScramble';
import ImageGallery from '@/components/ImageGallery';
import { notFound } from 'next/navigation';
import { useTastingDetail } from '@/hooks/useTastingDetail';
import { use } from 'react';

export const dynamic = 'force-dynamic';

type RouteParams = {
	params: Promise<{ id: string }>;
};

export default function TastingPage({ params }: RouteParams) {
	const { id } = use(params);
	const { data, isLoading, error } = useTastingDetail(id);

	if (error || (!isLoading && !data?.tasting)) {
		notFound();
	}

	const tasting = data?.tasting;
	const scores = data?.scores || [];
	const images = data?.images || [];
	
	const galleryImages = images.map((img: any) => ({
		id: img.id,
		url: img.generated_image_url || img.original_image_url,
		type: img.image_type,
		isAiGenerated: !!img.generated_image_url,
	}));

	const allScores = scores?.map((s: any) => s.score) || [];
	const averageScore = allScores.length > 0
		? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length
		: null;

	if (!tasting) {
		return null;
	}

	const tastingDate = new Date(tasting.date);
	const formattedDate = tastingDate.toLocaleDateString('en-US', {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});

	const getScoreLabel = (score: number) => {
		if (score >= 9) return "LEGENDARY";
		if (score >= 8) return "EXCELLENT";
		if (score >= 7) return "GREAT";
		if (score >= 6) return "GOOD";
		if (score >= 5) return "DECENT";
		return "FAIR";
	};

	return (
		<Frame title="TASTING SESSION">
			<div className="space-y-6">
				<div className="text-neon-cyan hover:opacity-80 transition-opacity">
					<Link href="/">← BACK TO HOME</Link>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
					<div className="lg:col-span-4 space-y-6">
						{tasting.front_image && (
							<div className="panel overflow-hidden">
								<div className="aspect-video relative bg-black">
									<Image
										src={tasting.front_image}
										alt="Tasting"
										fill
										className="object-cover"
										priority
									/>
								</div>
							</div>
						)}

						<GridArea title="TASTING INFO" titleJa="利酒情報">
							<div className="space-y-4">
								<div>
									<div className="text-muted text-sm uppercase mb-1">DATE:</div>
									<div className="text-white text-xl">{formattedDate}</div>
								</div>

								{tasting.location_name && (
									<div>
										<div className="text-muted text-sm uppercase mb-1">LOCATION:</div>
										<div className="text-white">{tasting.location_name}</div>
									</div>
								)}

								{averageScore !== null && (
									<div className="border-t border-divider pt-4">
										<div className="text-muted text-sm mb-2 uppercase">AVERAGE SCORE:</div>
										<div className="flex items-center justify-between mb-2">
											<span className="neon-pink font-pixel text-2xl">{averageScore.toFixed(1)}</span>
											<span className="text-green uppercase tracking-wider text-sm">{getScoreLabel(averageScore)}</span>
										</div>
										<BlockGauge value={averageScore / 10} blockLength={15} />
									</div>
								)}

								<div className="border-t border-divider pt-4">
									<div className="text-center">
										<div className="font-pixel text-2xl">
											<NumberScramble value={scores?.length || 0} decimals={0} isLoading={isLoading} />
										</div>
										<div className="text-muted text-sm mt-1 uppercase tracking-wider">TOTAL SCORES</div>
									</div>
								</div>
							</div>
						</GridArea>

						{tasting.sakes && (
							<GridArea title="SAKE TASTED" titleJa="試飲酒">
								<Link
									href={`/sake/${tasting.sakes.id}`}
									className="block hover:opacity-80 transition-opacity"
								>
									<div className="space-y-2">
										<div className="text-sake-gold text-xl font-noto">{tasting.sakes.name}</div>
										{tasting.sakes.prefecture && (
											<div className="text-muted text-sm">{tasting.sakes.prefecture}</div>
										)}
										{(tasting.sakes.type || tasting.sakes.grade) && (
											<div className="text-white text-sm">
												{[tasting.sakes.type, tasting.sakes.grade].filter(Boolean).join(' • ')}
											</div>
										)}
										<div className="text-neon-pink text-sm mt-2">→ VIEW SAKE DETAILS</div>
									</div>
								</Link>
							</GridArea>
						)}
					</div>

					<div className="lg:col-span-8 space-y-6">
						{galleryImages.length > 0 && (
							<GridArea title="TASTING IMAGES" titleJa="画像">
								<ImageGallery images={galleryImages} />
							</GridArea>
						)}

						<GridArea title="SCORES BY TASTER" titleJa="利酒師スコア">
							<div className="space-y-4">
								{scores && scores.length > 0 ? (
									scores.map((score: any) => (
										<div
											key={score.id}
											className="panel p-4 hover:border-neon-cyan transition-colors"
										>
											<div className="flex items-start justify-between mb-4">
												<Link
													href={`/taster/${score.taster_id}`}
													className="flex items-center gap-3 hover:opacity-80 transition-opacity"
												>
													<span className="text-neon-cyan">&gt;</span>
													<div>
														<div className="text-white text-xl">{score.tasters?.name}</div>
													</div>
												</Link>
												<div className="text-right">
													<div className={`font-pixel text-2xl ${
														score.score >= 8 ? 'text-green' :
														score.score >= 7 ? 'text-sake-gold' :
														score.score >= 6 ? 'text-white' :
														'text-red'
													}`}>
														{score.score.toFixed(1)}
													</div>
													<div className="text-sm text-muted uppercase">{getScoreLabel(score.score)}</div>
												</div>
											</div>

											<BlockGauge value={score.score / 10} blockLength={20} className="mb-4" />

											{score.notes && (
												<div className="border-t border-divider pt-4 mt-4">
													<div className="text-muted text-sm mb-2 uppercase">NOTES:</div>
													<div className="text-white text-sm whitespace-pre-wrap">
														{score.notes}
													</div>
												</div>
											)}
										</div>
									))
								) : (
									<div className="text-muted text-center py-12">
										NO SCORES YET FOR THIS TASTING
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
