import { z } from 'zod';
import { tool } from 'ai';
import { createServiceClient } from '@/lib/supabase/server';
import { SAKE_IMAGES_BUCKET } from '@/lib/supabase/storage';
import { ensurePhoneLinkForTaster, hashPhoneNumber, resolveTasterByPhone } from '@/lib/phoneHash';
import { normalizeImageBuffer } from '@/lib/images/normalize-image';
import { getRank, getNextRank } from '@/lib/tasterRanks';
import type { Database } from '@/types/supabase/databaseTypes';
import type { Twilio } from 'twilio';

type Taster = Database['public']['Tables']['tasters']['Row'];

type ToolContext = {
	twilioClient: Twilio;
	fromNumber: string;
	toNumber: string;
	currentMediaUrls?: string[];
};

export const createTools = (context: ToolContext) => {
	const {
		twilioClient,
		fromNumber,
		toNumber,
		currentMediaUrls = [],
	} = context;
	const imageGenerationCache = new Map<string, { generated_image_url: string; type: string }>();
	let imageGenerationsThisTurn = 0;
	const MAX_IMAGE_GENERATIONS_PER_TURN = 1;
	const IMAGE_GENERATION_TIMEOUT_MS = 25_000;

	const isTwilioUrl = (url: string): boolean => {
		try {
			const hostname = new URL(url).hostname.toLowerCase();
			return hostname.endsWith('twilio.com') || hostname.endsWith('twiliocdn.com');
		} catch {
			return url.includes('twilio.com');
		}
	};

	const normalizeCandidateUrl = (url: string): string => {
		try {
			const parsed = new URL(url);
			if (isTwilioUrl(url))
				parsed.pathname = parsed.pathname.replace(/\.json$/i, '');
			return parsed.toString();
		} catch {
			return url;
		}
	};

	const uploadImageFromUrl = async (input: {
		mediaUrl: string;
		folderName: string;
		toolLabel: string;
	}): Promise<{ publicUrl: string; resolvedDownloadUrl: string }> => {
		const { mediaUrl, folderName, toolLabel } = input;
		const supabase = createServiceClient();
		const accountSid = process.env.TWILIO_ACCOUNT_SID;
		const authToken = process.env.TWILIO_AUTH_TOKEN;
		const basicAuth = accountSid && authToken
			? Buffer.from(`${accountSid}:${authToken}`).toString('base64')
			: null;

		const fetchMedia = async (url: string): Promise<Response> => {
			if (isTwilioUrl(url)) {
				if (!basicAuth)
					throw new Error('Missing Twilio credentials (TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN)');

				console.log(`[Tool: ${toolLabel}] Detected Twilio URL, using HTTP Basic Auth`);
				return fetch(url, {
					headers: {
						Authorization: `Basic ${basicAuth}`,
						Accept: '*/*',
					},
				});
			}

			console.log(`[Tool: ${toolLabel}] Non-Twilio URL, fetching directly`);
			return fetch(url);
		};

		const logFailedDownload = async (url: string, response: Response): Promise<void> => {
			const responseBody = await response.text().catch(() => 'Unable to read response body');
			console.error(`[Tool: ${toolLabel}] Download failed:`, {
				url,
				status: response.status,
				statusText: response.statusText,
				contentType: response.headers.get('content-type'),
				body: responseBody.substring(0, 500),
			});
		};

		const getRecentInboundMediaUrls = async (): Promise<string[]> => {
			try {
				const { data, error } = await supabase
					.from('whatsapp_messages')
					.select('media_urls, created_at')
					.eq('direction', 'inbound')
					.eq('from_number', toNumber)
					.not('media_urls', 'is', null)
					.order('created_at', { ascending: false })
					.limit(3);

				if (error) {
					console.error(`[Tool: ${toolLabel}] Failed loading recent inbound media URLs:`, error.message);
					return [];
				}

				const recentUrls = (data || []).flatMap(row => row.media_urls || []);
				console.log(`[Tool: ${toolLabel}] Loaded recent inbound media URL candidates:`, recentUrls.length);
				return recentUrls;
			} catch (error) {
				console.error(`[Tool: ${toolLabel}] Exception loading recent inbound media URLs:`, error);
				return [];
			}
		};

		const fallbackUrls: string[] = [];
		const fallbackUrlSet = new Set<string>();
		const primaryUrl = normalizeCandidateUrl(mediaUrl);
		const addFallbackUrl = (candidateUrl: string, source: string): void => {
			const normalized = normalizeCandidateUrl(candidateUrl);
			if (!normalized || normalized === primaryUrl || fallbackUrlSet.has(normalized))
				return;

			fallbackUrlSet.add(normalized);
			fallbackUrls.push(normalized);
			console.log(`[Tool: ${toolLabel}] Added fallback candidate from ${source}:`, normalized);
		};

		let resolvedDownloadUrl = primaryUrl;
		let response = await fetchMedia(resolvedDownloadUrl);
		console.log(`[Tool: ${toolLabel}] Response status:`, response.status, 'Content-Type:', response.headers.get('content-type'));

		if (!response.ok) {
			await logFailedDownload(resolvedDownloadUrl, response);

			const shouldTryTwilioFallbacks = isTwilioUrl(resolvedDownloadUrl) && response.status === 404;
			if (!shouldTryTwilioFallbacks)
				throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);

			for (const currentUrl of currentMediaUrls)
				addFallbackUrl(currentUrl, 'current webhook media');

			const urlMatch = resolvedDownloadUrl.match(/\/Messages\/(MM[^\/]+)\/Media\/(ME[^\/.?]+)/);
			if (urlMatch) {
				const [, messageSid, mediaSid] = urlMatch;
				console.log(`[Tool: ${toolLabel}] Attempting Twilio SDK fallback`);
				console.log(`[Tool: ${toolLabel}] MessageSid: ${messageSid} MediaSid: ${mediaSid}`);

				try {
					const mediaInstance = await twilioClient
						.messages(messageSid)
						.media(mediaSid)
						.fetch();

					console.log(`[Tool: ${toolLabel}] Media fetched via SDK, uri:`, mediaInstance.uri);
					const mediaContentUrl = normalizeCandidateUrl(`https://api.twilio.com${mediaInstance.uri}`);
					addFallbackUrl(mediaContentUrl, 'twilio sdk');
				} catch (sdkError) {
					console.error(`[Tool: ${toolLabel}] SDK fallback lookup failed:`, sdkError);
				}
			}

			const recentInboundUrls = await getRecentInboundMediaUrls();
			for (const recentUrl of recentInboundUrls)
				addFallbackUrl(recentUrl, 'recent inbound messages');

			const attemptedFallbacks: string[] = [];
			for (const fallbackUrl of fallbackUrls) {
				attemptedFallbacks.push(fallbackUrl);
				const fallbackResponse = await fetchMedia(fallbackUrl);
				console.log(`[Tool: ${toolLabel}] Fallback response status:`, fallbackResponse.status, 'for', fallbackUrl);

				if (fallbackResponse.ok) {
					response = fallbackResponse;
					resolvedDownloadUrl = fallbackUrl;
					console.log(`[Tool: ${toolLabel}] Fallback succeeded with URL:`, fallbackUrl);
					break;
				}

				await logFailedDownload(fallbackUrl, fallbackResponse);
			}

			if (!response.ok) {
				throw new Error(
					`Failed to download image: ${response.status} ${response.statusText}. ` +
					`Tried ${attemptedFallbacks.length + 1} URL(s)`
				);
			}
		}

		const blob = await response.blob();
		const originalBuffer = Buffer.from(await blob.arrayBuffer());
		const normalizedImage = await normalizeImageBuffer({
			buffer: originalBuffer,
			contentType: blob.type,
			fileNameOrUrl: resolvedDownloadUrl,
		});
		if (normalizedImage.wasHeicConverted)
			console.log(`[Tool: ${toolLabel}] Converted HEIC/HEIF source image to JPEG`);
		const timestamp = Date.now();
		const randomStr = Math.random().toString(36).substring(2, 15);
		const fileName = `${folderName}/${timestamp}-${randomStr}.${normalizedImage.extension}`;

		const { data: uploadData, error: uploadError } = await supabase.storage
			.from(SAKE_IMAGES_BUCKET)
			.upload(fileName, normalizedImage.buffer, {
				contentType: normalizedImage.contentType || 'image/jpeg',
				cacheControl: '3600',
			});

		if (uploadError || !uploadData)
			throw new Error(`Failed to upload image: ${uploadError?.message || 'Unknown error'}`);

		const {
			data: { publicUrl },
		} = supabase.storage.from(SAKE_IMAGES_BUCKET).getPublicUrl(uploadData.path);

		return {
			publicUrl,
			resolvedDownloadUrl,
		};
	};

	const callImageGenerationApi = async (input: {
		toolLabel: string;
		requestBody: Record<string, string>;
	}): Promise<{ generatedImageUrl: string; warning?: string }> => {
		const { toolLabel, requestBody } = input;
		const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://sakesatur.day';

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), IMAGE_GENERATION_TIMEOUT_MS);

		let response: Response;
		try {
			response = await fetch(`${baseUrl}/api/images/generate`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			});
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError')
				throw new Error(`Image generation timed out after ${IMAGE_GENERATION_TIMEOUT_MS}ms`);
			throw error;
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[Tool: ${toolLabel}] Image generation API error:`, errorText);
			throw new Error(`Failed to generate image: ${response.statusText}`);
		}

		const result = await response.json() as { generatedImageUrl?: string; warning?: string };
		if (!result.generatedImageUrl)
			throw new Error('No generated image URL in response');

		return {
			generatedImageUrl: result.generatedImageUrl,
			warning: result.warning,
		};
	};

	const tasterNeedsProfilePicture = (taster: Pick<Taster, 'profile_pic' | 'ai_profile_image_url'>): boolean =>
		!taster.profile_pic && !taster.ai_profile_image_url;

	const resolveTasterRankKey = async (
		supabase: ReturnType<typeof createServiceClient>,
		tasterId: string
	): Promise<string> => {
		try {
			const { data: scores, error } = await supabase
				.from('scores')
				.select('tasting_id')
				.eq('taster_id', tasterId);

			if (error)
				throw new Error(error.message);

			const uniqueTastingIds = new Set((scores || []).map(score => score.tasting_id));
			return getRank(uniqueTastingIds.size).key;
		} catch (error) {
			console.warn('[Tool: process_taster_profile_image] Falling back to default rank key:', error);
			return 'murabito';
		}
	};

	return {
		send_message: tool({
			description: 'Send an intermediate message to the user in the WhatsApp chat. Use this to acknowledge receipt, provide status updates, or share information before continuing processing. Do NOT use this for your final response.',
			inputSchema: z.object({
				message: z.string().describe('The message to send to the user'),
			}),
			execute: async ({ message }) => {
				console.log('[Tool: send_message] Sending intermediate message:', message.substring(0, 100));
				try {
					const formattedFrom = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
					const formattedTo = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;
					
					const twilioMessage = await twilioClient.messages.create({
						from: formattedFrom,
						to: formattedTo,
						body: message,
					});
					
					console.log('[Tool: send_message] Message sent successfully:', twilioMessage.sid);
					return {
						success: true,
						message_sid: twilioMessage.sid,
						message: 'Message sent to user',
					};
				} catch (error) {
					console.error('[Tool: send_message] Error sending message:', error);
					throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
				}
			},
		}),
	identify_sake: tool({
		description:
			'Search for an existing sake in the database or create a new one. Use this when the user sends a photo or description of a sake bottle.',
		inputSchema: z.object({
			name: z.string().describe('Name of the sake (required)'),
			prefecture: z.string().optional().describe('Prefecture/region where the sake is from'),
			grade: z.string().optional().describe('Sake grade (e.g., Daiginjo, Ginjo, Junmai, Honjozo)'),
			type: z.string().optional().describe('Type classification'),
			rice: z.string().optional().describe('Rice variety used (e.g., Yamada Nishiki)'),
			polishing_ratio: z.number().optional().describe('Polishing ratio as a percentage (e.g., 50 for 50%)'),
			alc_percentage: z.number().optional().describe('Alcohol percentage (ABV)'),
			smv: z.number().optional().describe('Sake Meter Value (sweetness/dryness)'),
			bottling_company: z.string().optional().describe('Brewery/bottling company name'),
			image_url: z.string().optional().describe('URL of the original bottle photo'),
		}),
	execute: async (params: {
		name: string;
		prefecture?: string;
		grade?: string;
		type?: string;
		rice?: string;
		polishing_ratio?: number;
		alc_percentage?: number;
		smv?: number;
		bottling_company?: string;
		image_url?: string;
	}) => {
		console.log('[Tool: identify_sake] Executing with params:', JSON.stringify(params));
		const { name, prefecture, grade, type, rice, polishing_ratio, alc_percentage, smv, bottling_company, image_url } = params;
		const supabase = createServiceClient();

		const { data: existingSake, error: findError } = await supabase
			.from('sakes')
			.select('*')
			.ilike('name', name)
			.single();

		if (!findError && existingSake) {
			console.log('[Tool: identify_sake] Found existing sake:', existingSake.id);
			if (image_url && !existingSake.image_url) {
				const { data: updatedSakes, error: updateError } = await supabase
					.from('sakes')
					.update({ image_url })
					.eq('id', existingSake.id)
					.select();

				if (updateError) {
					console.error('[Tool: identify_sake] Error updating sake image:', updateError.message);
				} else if (updatedSakes && updatedSakes.length > 0) {
					return {
						success: true,
						sake: updatedSakes[0],
						created: false,
						message: 'Found existing sake and updated with image',
					};
				}
			}
			return {
				success: true,
				sake: existingSake,
				created: false,
				message: 'Found existing sake in database',
			};
		}

		const { data: newSake, error: createError } = await supabase
			.from('sakes')
			.insert({
				name,
				prefecture,
				grade,
				type,
				rice,
				polishing_ratio,
				alc_percentage,
				smv,
				bottling_company,
				image_url,
			})
			.select()
			.single();

		if (createError) {
			console.error('[Tool: identify_sake] Error creating sake:', createError.message);
			throw new Error(`Failed to create sake: ${createError.message}`);
		}

		console.log('[Tool: identify_sake] Created new sake:', newSake.id);
		return {
			success: true,
			sake: newSake,
			created: true,
			message: 'Created new sake in database',
		};
	},
	}),

	create_tasting: tool({
		description:
			'Create a new tasting session for a sake. Use this after identifying a sake and when the user is ready to start tasting.',
		inputSchema: z.object({
			sake_id: z.string().describe('ID of the sake being tasted (from identify_sake result)'),
			date: z.string().optional().describe('Date of tasting in YYYY-MM-DD format (defaults to today)'),
			location_name: z.string().optional().describe('Name of the location where tasting is happening'),
			created_by_phone: z.string().optional().describe('Phone number of the person creating the tasting'),
		}),
	execute: async (params: {
		sake_id: string;
		date?: string;
		location_name?: string;
		created_by_phone?: string;
	}) => {
		console.log('[Tool: create_tasting] Executing with params:', JSON.stringify(params));
		const { sake_id, date, location_name, created_by_phone } = params;
		const supabase = createServiceClient();
		const tastingDate = date || new Date().toISOString().split('T')[0];

		let createdById: string | undefined;
		if (created_by_phone) {
			try {
				const creatorResolution = await resolveTasterByPhone(supabase, created_by_phone);
				createdById = creatorResolution.tasterId ?? undefined;
			} catch (error) {
				console.warn('[Tool: create_tasting] Unable to resolve created_by_phone hash:', error);
			}
		}

		const { data: newTasting, error: createError } = await supabase
			.from('tastings')
			.insert({
				sake_id,
				date: tastingDate,
				location_name,
				created_by: createdById,
			})
			.select()
			.single();

		if (createError) {
			console.error('[Tool: create_tasting] Error creating tasting:', createError.message);
			throw new Error(`Failed to create tasting: ${createError.message}`);
		}

		const tastingUrl = `https://sakesatur.day/tasting/${newTasting.id}`;
		console.log('[Tool: create_tasting] Created new tasting:', newTasting.id, 'URL:', tastingUrl);

		return {
			success: true,
			tasting: newTasting,
			tasting_url: tastingUrl,
			message: `Created new tasting session. View at: ${tastingUrl}`,
		};
	},
	}),

	record_scores: tool({
		description:
			'Record scores from tasters for a specific tasting. Scores are on a 0-10 scale. Can record multiple tasters at once.',
		inputSchema: z.object({
			tasting_id: z.string().describe('ID of the tasting session'),
			scores: z.array(
				z.object({
					taster_name: z.string().describe('Name of the taster'),
					taster_phone: z.string().optional().describe('Phone number of the taster (if available)'),
					score: z.number().describe('Score from 0-10'),
					notes: z.string().optional().describe('Tasting notes or comments'),
				})
			).describe('Array of scores from different tasters'),
		}),
	execute: async (params: {
		tasting_id: string;
		scores: Array<{
			taster_name: string;
			taster_phone?: string;
			score: number;
			notes?: string;
		}>;
	}) => {
		console.log('[Tool: record_scores] Executing with params:', JSON.stringify(params));
		const { tasting_id, scores } = params;
		const supabase = createServiceClient();
		const processedScores = [];
		const tastersRequiringProfilePicture: Array<{ id: string; name: string }> = [];
		const trackedTasterIds = new Set<string>();

		for (const scoreInput of scores) {
			const tasterResult = await lookupTasterHelper(supabase, {
				name: scoreInput.taster_name,
				phone: scoreInput.taster_phone,
			});

			const taster = tasterResult.taster;
			const shouldRequireProfilePicture =
				tasterResult.created &&
				tasterNeedsProfilePicture(taster) &&
				!trackedTasterIds.has(taster.id);

			if (shouldRequireProfilePicture) {
				trackedTasterIds.add(taster.id);
				tastersRequiringProfilePicture.push({
					id: taster.id,
					name: taster.name,
				});
			}

			const { data: score, error: scoreError } = await supabase
				.from('scores')
				.upsert(
					{
						tasting_id,
						taster_id: taster.id,
						score: scoreInput.score,
						notes: scoreInput.notes,
					},
					{
						onConflict: 'tasting_id,taster_id',
					}
				)
				.select()
				.single();

			if (scoreError) {
				console.error('[Tool: record_scores] Error recording score:', scoreError);
				continue;
			}

			processedScores.push(score);
		}

		console.log('[Tool: record_scores] Recorded scores:', processedScores.length);
		return {
			success: true,
			scores: processedScores,
			count: processedScores.length,
			tasters_requiring_profile_picture: tastersRequiringProfilePicture,
			requires_profile_picture: tastersRequiringProfilePicture.length > 0,
			message: `Recorded ${processedScores.length} score(s)`,
		};
	},
	}),

	lookup_taster: tool({
		description:
			'Find an existing taster by name or phone number, or create a new one. If a new taster is created, you must collect a profile picture next using process_taster_profile_image.',
		inputSchema: z.object({
			name: z.string().describe('Name of the taster'),
			phone: z.string().optional().describe('Phone number of the taster'),
			phone_number: z.string().optional().describe('Deprecated alias for phone number'),
		}),
	execute: async (params: {
		name: string;
		phone?: string;
		phone_number?: string;
	}) => {
		console.log('[Tool: lookup_taster] Executing with params:', JSON.stringify(params));
		const { name, phone, phone_number } = params;
		const resolvedPhone = phone || phone_number;
		const supabase = createServiceClient();
		const result = await lookupTasterHelper(supabase, { name, phone: resolvedPhone });
		console.log('[Tool: lookup_taster] Result:', result.created ? 'Created new taster' : 'Found existing taster', result.taster.id);
		const requiresProfilePicture = result.created && tasterNeedsProfilePicture(result.taster);
		return {
			...result,
			requires_profile_picture: requiresProfilePicture,
			next_step: requiresProfilePicture
				? `New taster ${result.taster.name} requires a profile photo. Ask for an image and use process_taster_profile_image.`
				: null,
		};
	},
	}),

	get_tasting_history: tool({
		description:
			'Get past tasting sessions, optionally filtered by sake, taster, or date range.',
		inputSchema: z.object({
			sake_id: z.string().optional().describe('Filter by specific sake ID'),
			taster_id: z.string().optional().describe('Filter by specific taster ID'),
			limit: z.number().optional().describe('Maximum number of tastings to return (default 10)'),
		}),
	execute: async (params: {
		sake_id?: string;
		taster_id?: string;
		limit?: number;
	}) => {
		console.log('[Tool: get_tasting_history] Executing with params:', JSON.stringify(params));
		const { sake_id, taster_id, limit } = params;
		const supabase = createServiceClient();
		const queryLimit = limit || 10;

		let query = supabase
			.from('tastings')
			.select(
				`
				*,
				sakes:sake_id (id, name, grade, prefecture),
				scores (
					score,
					notes,
					tasters:taster_id (id, name)
				)
			`
			)
			.order('date', { ascending: false })
			.limit(queryLimit);

		if (sake_id) {
			query = query.eq('sake_id', sake_id);
		}

		if (taster_id) {
			query = query.eq('scores.taster_id', taster_id);
		}

		const { data, error } = await query;

		if (error) {
			console.error('[Tool: get_tasting_history] Error fetching history:', error.message);
			throw new Error(`Failed to fetch tasting history: ${error.message}`);
		}

		console.log('[Tool: get_tasting_history] Fetched tastings:', data?.length || 0);
		return {
			success: true,
			tastings: data,
			count: data?.length || 0,
		};
	},
	}),

	get_sake_rankings: tool({
		description:
			'Get the current sake leaderboard with average scores and number of tastings.',
		inputSchema: z.object({
			limit: z.number().optional().describe('Maximum number of sakes to return (default 10)'),
			min_tastings: z.number().optional().describe('Minimum number of tastings required to be included (default 1)'),
		}),
	execute: async (params: {
		limit?: number;
		min_tastings?: number;
	}) => {
		console.log('[Tool: get_sake_rankings] Executing with params:', JSON.stringify(params));
		const { limit, min_tastings } = params;
		const supabase = createServiceClient();
		const queryLimit = limit || 10;
		const minTastingsCount = min_tastings || 1;

		const { data, error } = await supabase
			.from('sake_rankings')
			.select('*')
			.gte('total_tastings', minTastingsCount)
			.order('avg_score', { ascending: false, nullsFirst: false })
			.limit(queryLimit);

		if (error) {
			console.error('[Tool: get_sake_rankings] Error fetching rankings:', error.message);
			throw new Error(`Failed to fetch sake rankings: ${error.message}`);
		}

		console.log('[Tool: get_sake_rankings] Fetched rankings:', data?.length || 0);
		return {
			success: true,
			rankings: data,
			count: data?.length || 0,
		};
	},
	}),

	get_taster_rank: tool({
		description:
			'Get a taster\'s current rank, progress toward next rank, and next milestone. Use this when a user asks about their rank or progress.',
		inputSchema: z.object({
			taster_id: z.string().describe('ID of the taster to check rank for'),
		}),
		execute: async ({ taster_id }) => {
			console.log('[Tool: get_taster_rank] Executing for taster:', taster_id);
			const supabase = createServiceClient();

			const { data: taster, error: tasterError } = await supabase
				.from('tasters')
				.select('id, name')
				.eq('id', taster_id)
				.single();

			if (tasterError || !taster) {
				console.error('[Tool: get_taster_rank] Error fetching taster:', tasterError?.message);
				throw new Error(`Failed to find taster: ${tasterError?.message || 'Not found'}`);
			}

			const { data: scores, error: scoresError } = await supabase
				.from('scores')
				.select('tasting_id')
				.eq('taster_id', taster_id);

			if (scoresError) {
				console.error('[Tool: get_taster_rank] Error fetching scores:', scoresError.message);
				throw new Error(`Failed to fetch taster scores: ${scoresError.message}`);
			}

			const uniqueTastingIds = new Set(scores?.map(s => s.tasting_id) || []);
			const sakeCount = uniqueTastingIds.size;

			const currentRank = getRank(sakeCount);
			const nextRankInfo = getNextRank(sakeCount);

			console.log('[Tool: get_taster_rank] Taster:', taster.name, 'Sakes:', sakeCount, 'Rank:', currentRank.romaji);

			return {
				success: true,
				taster_name: taster.name,
				sake_count: sakeCount,
				current_rank: {
					key: currentRank.key,
					kanji: currentRank.kanji,
					romaji: currentRank.romaji,
					english: currentRank.english,
					color: currentRank.color,
				},
				next_rank: nextRankInfo ? {
					rank: {
						key: nextRankInfo.nextRank.key,
						kanji: nextRankInfo.nextRank.kanji,
						romaji: nextRankInfo.nextRank.romaji,
						english: nextRankInfo.nextRank.english,
					},
					progress: Math.round(nextRankInfo.progress * 100),
					remaining: nextRankInfo.remaining,
				} : null,
				is_max_rank: !nextRankInfo,
			};
		},
	}),

	get_tasting_summary: tool({
		description:
			'Generate a summary for a completed tasting session, including scores, average, and any rank-ups. Use this after recording scores to create a recap.',
		inputSchema: z.object({
			tasting_id: z.string().describe('ID of the tasting session to summarize'),
		}),
		execute: async ({ tasting_id }) => {
			console.log('[Tool: get_tasting_summary] Executing for tasting:', tasting_id);
			const supabase = createServiceClient();

			const { data: tasting, error: tastingError } = await supabase
				.from('tastings')
				.select(`
					*,
					sakes:sake_id (id, name, grade, prefecture),
					scores (
						score,
						notes,
						tasters:taster_id (id, name)
					)
				`)
				.eq('id', tasting_id)
				.single();

			if (tastingError || !tasting) {
				console.error('[Tool: get_tasting_summary] Error fetching tasting:', tastingError?.message);
				throw new Error(`Failed to fetch tasting: ${tastingError?.message || 'Not found'}`);
			}

			const scores = tasting.scores || [];
			const tasterScores: Array<{ name: string; score: number; tasterId: string }> = [];
			
			for (const scoreData of scores) {
				const tasterData = scoreData.tasters as unknown as { id: string; name: string } | null;
				if (tasterData && typeof scoreData.score === 'number') {
					tasterScores.push({
						name: tasterData.name,
						score: scoreData.score,
						tasterId: tasterData.id,
					});
				}
			}

			const avgScore = tasterScores.length > 0
				? tasterScores.reduce((sum, t) => sum + t.score, 0) / tasterScores.length
				: 0;

			const levelUps: Array<{
				taster_name: string;
				old_rank: string;
				new_rank: string;
				new_rank_kanji: string;
				sake_count: number;
			}> = [];

			for (const tasterScore of tasterScores) {
				const { data: allScores } = await supabase
					.from('scores')
					.select('tasting_id')
					.eq('taster_id', tasterScore.tasterId);

				const uniqueTastingIds = new Set(allScores?.map(s => s.tasting_id) || []);
				const currentSakeCount = uniqueTastingIds.size;
				const previousSakeCount = currentSakeCount - 1;

				const currentRank = getRank(currentSakeCount);
				const previousRank = getRank(previousSakeCount);

				if (currentRank.key !== previousRank.key) {
					levelUps.push({
						taster_name: tasterScore.name,
						old_rank: previousRank.romaji,
						new_rank: currentRank.romaji,
						new_rank_kanji: currentRank.kanji,
						sake_count: currentSakeCount,
					});
				}
			}

			const nextMilestones: Array<{
				taster_name: string;
				remaining: number;
				next_rank: string;
			}> = [];

			for (const tasterScore of tasterScores) {
				const { data: allScores } = await supabase
					.from('scores')
					.select('tasting_id')
					.eq('taster_id', tasterScore.tasterId);

				const uniqueTastingIds = new Set(allScores?.map(s => s.tasting_id) || []);
				const sakeCount = uniqueTastingIds.size;
				const nextRankInfo = getNextRank(sakeCount);

				if (nextRankInfo) {
					nextMilestones.push({
						taster_name: tasterScore.name,
						remaining: nextRankInfo.remaining,
						next_rank: nextRankInfo.nextRank.romaji,
					});
				}
			}

			const sakeData = tasting.sakes as unknown as { name: string; grade?: string; prefecture?: string } | null;

			console.log('[Tool: get_tasting_summary] Summary generated:', {
				scores: tasterScores.length,
				avgScore,
				levelUps: levelUps.length,
			});

			return {
				success: true,
				sake_name: sakeData?.name || 'Unknown Sake',
				sake_grade: sakeData?.grade,
				sake_prefecture: sakeData?.prefecture,
				taster_scores: tasterScores,
				average_score: Math.round(avgScore * 10) / 10,
				level_ups: levelUps,
				next_milestones: nextMilestones,
				tasting_date: tasting.date,
				location: tasting.location_name,
			};
		},
	}),

	research_sake: tool({
		description:
			'Research and retrieve details about a sake. Use this when you need to find information about a sake\'s brewery, prefecture, grade, rice variety, polishing ratio, ABV, SMV, or flavor profile. After calling this tool, use the information returned to auto-fill sake details when creating or updating a sake record. You should then present the researched information to the user for confirmation.',
		inputSchema: z.object({
			sake_name: z.string().describe('Name of the sake to research'),
			known_details: z.object({
				prefecture: z.string().optional(),
				grade: z.string().optional(),
				bottling_company: z.string().optional(),
			}).optional().describe('Any details already known about the sake (helps narrow down search)'),
		}),
		execute: async ({ sake_name, known_details }) => {
			console.log('[Tool: research_sake] Researching sake:', sake_name, 'with known details:', known_details);
			const supabase = createServiceClient();

			const { data: existingSakes, error: searchError } = await supabase
				.from('sakes')
				.select('*')
				.ilike('name', `%${sake_name}%`)
				.limit(3);

			if (searchError) {
				console.error('[Tool: research_sake] Error searching database:', searchError.message);
			}

			const databaseResults = existingSakes && existingSakes.length > 0
				? existingSakes.map(sake => ({
					id: sake.id,
					name: sake.name,
					prefecture: sake.prefecture,
					grade: sake.grade,
					type: sake.type,
					rice: sake.rice,
					polishing_ratio: sake.polishing_ratio,
					alc_percentage: sake.alc_percentage,
					smv: sake.smv,
					bottling_company: sake.bottling_company,
				}))
				: [];

			console.log('[Tool: research_sake] Found', databaseResults.length, 'existing sakes in database');

			return {
				success: true,
				sake_name,
				known_details: known_details || {},
				database_matches: databaseResults,
				database_match_count: databaseResults.length,
				next_step: databaseResults.length > 0
					? 'Found existing sake(s) in database. Review the matches and ask the user if any match what they are looking for.'
					: 'No exact matches found in database. Use your knowledge of Japanese sake to provide details about this sake. Look up information about the brewery, prefecture, grade, rice variety, polishing ratio, ABV, SMV, and typical flavor profile. Present the information to the user for confirmation before creating a new sake record.',
			};
		},
	}),

	check_tasting_profiles: tool({
		description:
			'Check which tasters in a completed tasting session need profile setup (missing phone link or profile picture). Use this after recording scores to prompt users to set up profiles for their tasting group.',
		inputSchema: z.object({
			tasting_id: z.string().describe('ID of the tasting session to check'),
		}),
		execute: async ({ tasting_id }) => {
			console.log('[Tool: check_tasting_profiles] Checking profiles for tasting:', tasting_id);
			const supabase = createServiceClient();

			const { data: tasting, error: tastingError } = await supabase
				.from('tastings')
				.select(`
					id,
					scores (
						tasters:taster_id (
							id,
							name,
							profile_pic
						)
					)
				`)
				.eq('id', tasting_id)
				.single();

			if (tastingError || !tasting) {
				console.error('[Tool: check_tasting_profiles] Error fetching tasting:', tastingError?.message);
				throw new Error(`Failed to fetch tasting: ${tastingError?.message || 'Not found'}`);
			}

			const scores = tasting.scores || [];
			const tasterIds = new Set<string>();
			const tastersNeedingSetup: Array<{
				id: string;
				name: string;
				has_profile_pic: boolean;
				has_phone_link: boolean;
			}> = [];

			for (const scoreData of scores) {
				const tasterData = scoreData.tasters as unknown as { id: string; name: string; profile_pic: string | null } | null;
				if (tasterData && !tasterIds.has(tasterData.id)) {
					tasterIds.add(tasterData.id);

					const { data: phoneLink } = await supabase
						.from('taster_phone_links')
						.select('phone_hash')
						.eq('taster_id', tasterData.id)
						.maybeSingle();

					const hasPhoneLink = !!phoneLink;
					const hasProfilePic = !!tasterData.profile_pic;

					if (!hasPhoneLink || !hasProfilePic) {
						tastersNeedingSetup.push({
							id: tasterData.id,
							name: tasterData.name,
							has_profile_pic: hasProfilePic,
							has_phone_link: hasPhoneLink,
						});
					}
				}
			}

			console.log('[Tool: check_tasting_profiles] Found', tastersNeedingSetup.length, 'tasters needing setup');

			return {
				success: true,
				tasting_id,
				total_tasters: tasterIds.size,
				tasters_needing_setup: tastersNeedingSetup,
				count_needing_setup: tastersNeedingSetup.length,
				all_profiles_complete: tastersNeedingSetup.length === 0,
				suggestion: tastersNeedingSetup.length > 0
					? 'Ask the user if they want to set up profiles for tasters who are missing phone links or profile pictures. Use process_taster_profile_image once a profile photo is provided.'
					: 'All tasters in this session have complete profiles.',
			};
		},
	}),

	upload_image: tool({
		description:
			'Download an image from a URL (e.g., WhatsApp/Twilio media URL) and upload it to Supabase Storage. Returns the public URL for the uploaded image. IMPORTANT: Always use the media URL from the CURRENT message (the most recent user message). Do NOT use media URLs from older messages in the conversation history as they may have expired.',
		inputSchema: z.object({
			media_url: z.string().describe('The URL of the image to download and upload'),
			folder: z.string().optional().describe('Optional folder name in the sake-images bucket (default: "uploads")'),
		}),
		execute: async ({ media_url, folder }) => {
			console.log('[Tool: upload_image] Uploading image from:', media_url);
			const folderName = folder || 'uploads';

			try {
				const { publicUrl, resolvedDownloadUrl } = await uploadImageFromUrl({
					mediaUrl: media_url,
					folderName,
					toolLabel: 'upload_image',
				});
				console.log('[Tool: upload_image] Successfully uploaded to:', publicUrl, 'from source:', resolvedDownloadUrl);
				return {
					success: true,
					public_url: publicUrl,
					source_url: resolvedDownloadUrl,
					message: 'Image uploaded successfully',
				};
			} catch (error) {
				console.error('[Tool: upload_image] Error:', error);
				throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : String(error)}`);
			}
		},
	}),

	process_sake_image: tool({
		description:
			'One-step bottle image pipeline: upload current image to permanent storage, attach it to the sake record, and auto-generate AI bottle art. Use this for every newly uploaded sake bottle photo.',
		inputSchema: z.object({
			sake_id: z.string().describe('ID of the sake to attach the image to'),
			media_url: z.string().optional().describe('Optional media URL override. If omitted, uses the most recent inbound image URL from this turn'),
			folder: z.string().optional().describe('Optional folder name in the sake-images bucket (default: "bottles")'),
			generate_ai_art: z.boolean().optional().describe('Generate AI bottle art after upload (default: true)'),
		}),
		execute: async ({ sake_id, media_url, folder, generate_ai_art }) => {
			console.log('[Tool: process_sake_image] Processing image for sake:', sake_id);
			const selectedMediaUrl = media_url || currentMediaUrls[0];
			if (!selectedMediaUrl)
				throw new Error('No media URL available. Use media_url or provide an image in the current user message.');

			const supabase = createServiceClient();
			const folderName = folder || 'bottles';
			const shouldGenerateAiArt = generate_ai_art !== false;

			const { publicUrl, resolvedDownloadUrl } = await uploadImageFromUrl({
				mediaUrl: selectedMediaUrl,
				folderName,
				toolLabel: 'process_sake_image',
			});
			console.log('[Tool: process_sake_image] Uploaded image:', publicUrl);

			const { data: attachedSake, error: attachError } = await supabase
				.from('sakes')
				.update({ image_url: publicUrl })
				.eq('id', sake_id)
				.select()
				.maybeSingle();

			if (attachError)
				throw new Error(`Failed to attach image to sake: ${attachError.message}`);

			if (!attachedSake)
				throw new Error(`Sake with ID ${sake_id} not found or update was blocked`);

			let updatedSake = attachedSake;
			let generatedImageUrl: string | null = null;
			let warning: string | null = null;

			if (shouldGenerateAiArt) {
				if (imageGenerationsThisTurn >= MAX_IMAGE_GENERATIONS_PER_TURN) {
					warning = 'Image generation skipped for this turn to avoid timeout.';
				} else {
					imageGenerationsThisTurn += 1;
					const generationResult = await callImageGenerationApi({
						toolLabel: 'process_sake_image',
						requestBody: {
							type: 'bottle_art',
							imageUrl: publicUrl,
							sakeId: sake_id,
						},
					});

					generatedImageUrl = generationResult.generatedImageUrl;
					warning = generationResult.warning || null;

					const { data: aiUpdatedSake, error: aiUpdateError } = await supabase
						.from('sakes')
						.update({ ai_bottle_image_url: generatedImageUrl })
						.eq('id', sake_id)
						.select()
						.maybeSingle();

					if (!aiUpdateError && aiUpdatedSake)
						updatedSake = aiUpdatedSake;
				}
			}

			console.log('[Tool: process_sake_image] Completed successfully');
			return {
				success: true,
				sake: updatedSake,
				public_url: publicUrl,
				source_url: resolvedDownloadUrl,
				generated_image_url: generatedImageUrl,
				warning,
				message: generatedImageUrl
					? 'Image uploaded, attached, and AI bottle art generated'
					: 'Image uploaded and attached to sake',
			};
		},
	}),

	process_taster_profile_image: tool({
		description:
			'One-step taster profile pipeline: upload profile photo to permanent storage, attach it to the taster record, and auto-generate AI profile art.',
		inputSchema: z.object({
			taster_id: z.string().describe('ID of the taster whose profile image is being processed'),
			media_url: z.string().optional().describe('Optional media URL override. If omitted, uses the most recent inbound image URL from this turn'),
			folder: z.string().optional().describe('Optional folder name in the sake-images bucket (default: "profiles")'),
			rank_key: z.string().optional().describe('Optional rank key for generation (defaults to rank inferred from tasting history)'),
			generate_ai_art: z.boolean().optional().describe('Generate AI profile art after upload (default: true)'),
		}),
		execute: async ({ taster_id, media_url, folder, rank_key, generate_ai_art }) => {
			console.log('[Tool: process_taster_profile_image] Processing profile image for taster:', taster_id);
			const selectedMediaUrl = media_url || currentMediaUrls[0];
			if (!selectedMediaUrl)
				throw new Error('No media URL available. Use media_url or provide an image in the current user message.');

			const supabase = createServiceClient();
			const folderName = folder || 'profiles';
			const shouldGenerateAiArt = generate_ai_art !== false;

			const { publicUrl, resolvedDownloadUrl } = await uploadImageFromUrl({
				mediaUrl: selectedMediaUrl,
				folderName,
				toolLabel: 'process_taster_profile_image',
			});
			console.log('[Tool: process_taster_profile_image] Uploaded image:', publicUrl);

			const { data: attachedTaster, error: attachError } = await supabase
				.from('tasters')
				.update({
					profile_pic: publicUrl,
					source_photo_url: publicUrl,
				})
				.eq('id', taster_id)
				.select()
				.maybeSingle();

			if (attachError)
				throw new Error(`Failed to attach profile image to taster: ${attachError.message}`);

			if (!attachedTaster)
				throw new Error(`Taster with ID ${taster_id} not found or update was blocked`);

			let updatedTaster = attachedTaster;
			let generatedImageUrl: string | null = null;
			let warning: string | null = null;
			let resolvedRankKey: string | null = null;

			if (shouldGenerateAiArt) {
				if (imageGenerationsThisTurn >= MAX_IMAGE_GENERATIONS_PER_TURN) {
					warning = 'Image generation skipped for this turn to avoid timeout.';
				} else {
					imageGenerationsThisTurn += 1;
					resolvedRankKey = rank_key || await resolveTasterRankKey(supabase, taster_id);

					const generationResult = await callImageGenerationApi({
						toolLabel: 'process_taster_profile_image',
						requestBody: {
							type: 'rank_portrait',
							tasterId: taster_id,
							rankKey: resolvedRankKey,
							imageUrl: publicUrl,
						},
					});
					generatedImageUrl = generationResult.generatedImageUrl;
					warning = generationResult.warning || null;

					const { data: refreshedTaster, error: refreshError } = await supabase
						.from('tasters')
						.select('*')
						.eq('id', taster_id)
						.maybeSingle();

					if (!refreshError && refreshedTaster)
						updatedTaster = refreshedTaster;
				}
			}

			console.log('[Tool: process_taster_profile_image] Completed successfully');
			return {
				success: true,
				taster: updatedTaster,
				public_url: publicUrl,
				source_url: resolvedDownloadUrl,
				generated_image_url: generatedImageUrl,
				rank_key: resolvedRankKey,
				warning,
				message: generatedImageUrl
					? 'Profile photo uploaded, attached, and AI portrait generated'
					: 'Profile photo uploaded and attached to taster',
			};
		},
	}),

	process_group_photo_image: tool({
		description:
			'One-step group photo pipeline: upload group photo to permanent storage, attach it to the tasting record, and auto-generate AI group transform art.',
		inputSchema: z.object({
			tasting_id: z.string().describe('ID of the tasting to attach the group photo to'),
			media_url: z.string().optional().describe('Optional media URL override. If omitted, uses the most recent inbound image URL from this turn'),
			folder: z.string().optional().describe('Optional folder name in the sake-images bucket (default: "groups")'),
			generate_ai_art: z.boolean().optional().describe('Generate AI group art after upload (default: true)'),
		}),
		execute: async ({ tasting_id, media_url, folder, generate_ai_art }) => {
			console.log('[Tool: process_group_photo_image] Processing group photo for tasting:', tasting_id);
			const selectedMediaUrl = media_url || currentMediaUrls[0];
			if (!selectedMediaUrl)
				throw new Error('No media URL available. Use media_url or provide an image in the current user message.');

			const supabase = createServiceClient();
			const folderName = folder || 'groups';
			const shouldGenerateAiArt = generate_ai_art !== false;

			const { publicUrl, resolvedDownloadUrl } = await uploadImageFromUrl({
				mediaUrl: selectedMediaUrl,
				folderName,
				toolLabel: 'process_group_photo_image',
			});
			console.log('[Tool: process_group_photo_image] Uploaded image:', publicUrl);

			const { data: updatedTasting, error: updateError } = await supabase
				.from('tastings')
				.update({ group_photo_url: publicUrl })
				.eq('id', tasting_id)
				.select()
				.maybeSingle();

			if (updateError)
				throw new Error(`Failed to attach photo to tasting: ${updateError.message}`);

			if (!updatedTasting)
				throw new Error(`Tasting with ID ${tasting_id} not found or update was blocked`);

			let generatedImageUrl: string | null = null;
			let warning: string | null = null;

			if (shouldGenerateAiArt) {
				if (imageGenerationsThisTurn >= MAX_IMAGE_GENERATIONS_PER_TURN) {
					warning = 'Image generation skipped for this turn to avoid timeout.';
				} else {
					imageGenerationsThisTurn += 1;
					const generationResult = await callImageGenerationApi({
						toolLabel: 'process_group_photo_image',
						requestBody: {
							type: 'group_transform',
							tastingId: tasting_id,
							imageUrl: publicUrl,
						},
					});

					generatedImageUrl = generationResult.generatedImageUrl;
					warning = generationResult.warning || null;
				}
			}

			console.log('[Tool: process_group_photo_image] Completed successfully');
			return {
				success: true,
				tasting: updatedTasting,
				public_url: publicUrl,
				source_url: resolvedDownloadUrl,
				generated_image_url: generatedImageUrl,
				warning,
				message: generatedImageUrl
					? 'Group photo uploaded, attached, and AI group art generated'
					: 'Group photo uploaded and attached to tasting',
			};
		},
	}),

	generate_ai_image: tool({
		description:
			'Generate AI art using the /api/images/generate endpoint. Can generate bottle art, group transforms, or rank portraits. Saves the generated image URL to the appropriate record. IMPORTANT: Call send_message first to tell the user to wait briefly while the image is being generated.',
		inputSchema: z.object({
			type: z.enum(['bottle_art', 'group_transform', 'rank_portrait']).describe('Type of image to generate'),
			entity_id: z.string().describe('ID of the entity (sake_id for bottle_art, tasting_id for group_transform or rank_portrait)'),
			image_url: z.string().optional().describe('Source image URL (required for bottle_art and group_transform, not needed for rank_portrait)'),
			rank_key: z.string().optional().describe('Rank key for rank_portrait (e.g., murabito, ronin, samurai)'),
			taster_id: z.string().optional().describe('Taster ID for rank_portrait generation'),
		}),
		execute: async ({ type, entity_id, image_url, rank_key, taster_id }) => {
			console.log('[Tool: generate_ai_image] Generating image:', type, 'for entity:', entity_id);
			const supabase = createServiceClient();
			const cacheKey = JSON.stringify({
				type,
				entity_id,
				image_url: image_url || null,
				rank_key: rank_key || null,
				taster_id: taster_id || null,
			});
			const cachedResult = imageGenerationCache.get(cacheKey);
			if (cachedResult) {
				console.log('[Tool: generate_ai_image] Returning cached result for duplicate request');
				return {
					success: true,
					...cachedResult,
					deduplicated: true,
					message: 'Reused previously generated image from this turn',
				};
			}

			if (imageGenerationsThisTurn >= MAX_IMAGE_GENERATIONS_PER_TURN) {
				console.warn('[Tool: generate_ai_image] Skipping additional generation to avoid timeout');
				return {
					success: false,
					skipped: true,
					reason: 'Image generation already executed for this turn. Skipping to avoid function timeout.',
				};
			}
			imageGenerationsThisTurn += 1;

			if ((type === 'bottle_art' || type === 'group_transform') && !image_url) {
				throw new Error(`image_url is required for ${type}`);
			}

			if (type === 'rank_portrait' && !taster_id) {
				throw new Error('taster_id is required for rank_portrait');
			}

			// Detect Twilio URLs and provide helpful error
			if (image_url && (image_url.includes('twilio.com') || image_url.includes('twiliocdn.com'))) {
				throw new Error(
					'Twilio media URLs expire quickly and cannot be used directly. ' +
					'Please first use process_sake_image, process_taster_profile_image, process_group_photo_image, or upload_image to upload the image to permanent storage, ' +
					'then use the returned public_url with generate_ai_image. ' +
					'Make sure to use a CURRENT media URL from the most recent message, not from conversation history.'
				);
			}

			try {
				const requestBody: Record<string, string> = {
					type: type === 'rank_portrait' ? 'profile_pic' : type,
				};

				if (type === 'bottle_art') {
					requestBody.imageUrl = image_url!;
					requestBody.sakeId = entity_id;
				} else if (type === 'group_transform') {
					requestBody.imageUrl = image_url!;
					requestBody.tastingId = entity_id;
				} else if (type === 'rank_portrait') {
					requestBody.tasterId = taster_id!;
					requestBody.rankKey = rank_key || 'murabito';
				}

				const generationResult = await callImageGenerationApi({
					toolLabel: 'generate_ai_image',
					requestBody,
				});
				const generatedUrl = generationResult.generatedImageUrl;

				if (type === 'bottle_art') {
					await supabase
						.from('sakes')
						.update({ ai_bottle_image_url: generatedUrl })
						.eq('id', entity_id);
				}

				imageGenerationCache.set(cacheKey, {
					generated_image_url: generatedUrl,
					type,
				});

				console.log('[Tool: generate_ai_image] Successfully generated image:', generatedUrl);
				return {
					success: true,
					generated_image_url: generatedUrl,
					type,
					warning: generationResult.warning || null,
					message: `AI ${type} generated successfully`,
				};
			} catch (error) {
				console.error('[Tool: generate_ai_image] Error:', error);
				throw new Error(`Failed to generate AI image: ${error instanceof Error ? error.message : String(error)}`);
			}
		},
	}),
	};
};

export const createAdminTools = () => {
	return {
		admin_edit_sake: tool({
			description: 'Update any field on a sake record by ID. Admin only.',
			inputSchema: z.object({
				sake_id: z.string().describe('ID of the sake to update'),
				updates: z.object({
					name: z.string().optional(),
					prefecture: z.string().optional(),
					grade: z.string().optional(),
					type: z.string().optional(),
					rice: z.string().optional(),
					polishing_ratio: z.number().optional(),
					alc_percentage: z.number().optional(),
					smv: z.number().optional(),
					bottling_company: z.string().optional(),
				}).describe('Fields to update'),
			}),
			execute: async ({ sake_id, updates }) => {
				console.log('[Tool: admin_edit_sake] Updating sake:', sake_id, updates);
				const supabase = createServiceClient();
				
				const { data, error } = await supabase
					.from('sakes')
					.update(updates)
					.eq('id', sake_id)
					.select();
				
				if (error) {
					console.error('[Tool: admin_edit_sake] Error:', error.message);
					throw new Error(`Failed to update sake: ${error.message}`);
				}
				
				if (!data || data.length === 0) {
					console.error('[Tool: admin_edit_sake] No sake found with ID:', sake_id);
					throw new Error(`Sake with ID ${sake_id} not found or update was blocked`);
				}

				if (data.length > 1) {
					console.error('[Tool: admin_edit_sake] Multiple sakes updated, expected one:', data.length);
					throw new Error(`Expected to update one sake, but updated ${data.length}`);
				}
				
				console.log('[Tool: admin_edit_sake] Updated successfully');
				return {
					success: true,
					sake: data[0],
					message: 'Sake updated successfully',
				};
			},
		}),
		
		admin_edit_taster: tool({
			description: 'Update any taster field (name, profile_pic, etc.). Admin only.',
			inputSchema: z.object({
				taster_id: z.string().describe('ID of the taster to update'),
				updates: z.object({
					name: z.string().optional(),
					phone: z.string().optional(),
					phone_number: z.string().optional(),
					phone_hash: z.string().optional(),
					profile_pic: z.string().optional(),
					rank_override: z.string().optional(),
				}).describe('Fields to update'),
			}),
			execute: async ({ taster_id, updates }) => {
				console.log('[Tool: admin_edit_taster] Updating taster:', taster_id, updates);
				const supabase = createServiceClient();

				const { phone, phone_number, phone_hash, ...directUpdates } = updates;
				const phoneInput = phone || phone_number;
				const tasterUpdates = phone_hash
					? { ...directUpdates, phone_hash }
					: directUpdates;
				const hasDirectUpdates = Object.keys(tasterUpdates).length > 0;

				const { data: updatedOrExistingTaster, error: tasterUpdateError } = hasDirectUpdates
					? await supabase
						.from('tasters')
						.update(tasterUpdates)
						.eq('id', taster_id)
						.select()
					: await supabase
						.from('tasters')
						.select('*')
						.eq('id', taster_id);

				if (tasterUpdateError) {
					console.error('[Tool: admin_edit_taster] Error:', tasterUpdateError.message);
					throw new Error(`Failed to update taster: ${tasterUpdateError.message}`);
				}

				if (!updatedOrExistingTaster || updatedOrExistingTaster.length === 0) {
					console.error('[Tool: admin_edit_taster] No taster found with ID:', taster_id);
					throw new Error(`Taster with ID ${taster_id} not found or update was blocked`);
				}

				if (updatedOrExistingTaster.length > 1) {
					console.error('[Tool: admin_edit_taster] Multiple tasters returned, expected one:', updatedOrExistingTaster.length);
					throw new Error(`Expected one taster, but got ${updatedOrExistingTaster.length}`);
				}

				const tasterData = updatedOrExistingTaster[0];

				if (phoneInput) {
					await ensurePhoneLinkForTaster(supabase, taster_id, phoneInput);
				} else if (phone_hash) {
					const { error: phoneLinkError } = await supabase
						.from('taster_phone_links')
						.upsert(
							{
								taster_id,
								phone_hash,
								linked_at: new Date().toISOString(),
							},
							{
								onConflict: 'phone_hash',
							}
						);

					if (phoneLinkError) {
						throw new Error(`Failed to update taster phone link: ${phoneLinkError.message}`);
					}
				}

				const { data: refreshedTasters, error: refreshError } = await supabase
					.from('tasters')
					.select('*')
					.eq('id', taster_id);

				if (refreshError) {
					throw new Error(`Failed to refresh updated taster: ${refreshError.message}`);
				}

				const refreshedTaster = refreshedTasters && refreshedTasters.length > 0 ? refreshedTasters[0] : null;

				console.log('[Tool: admin_edit_taster] Updated successfully');
				return {
					success: true,
					taster: refreshedTaster || tasterData,
					message: 'Taster updated successfully',
				};
			},
		}),
		
		admin_edit_tasting: tool({
			description: 'Modify tasting details or scores. Admin only.',
			inputSchema: z.object({
				tasting_id: z.string().describe('ID of the tasting to update'),
				updates: z.object({
					date: z.string().optional(),
					location_name: z.string().optional(),
					sake_id: z.string().optional(),
				}).describe('Fields to update'),
			}),
			execute: async ({ tasting_id, updates }) => {
				console.log('[Tool: admin_edit_tasting] Updating tasting:', tasting_id, updates);
				const supabase = createServiceClient();
				
				const { data, error } = await supabase
					.from('tastings')
					.update(updates)
					.eq('id', tasting_id)
					.select();
				
				if (error) {
					console.error('[Tool: admin_edit_tasting] Error:', error.message);
					throw new Error(`Failed to update tasting: ${error.message}`);
				}
				
				if (!data || data.length === 0) {
					console.error('[Tool: admin_edit_tasting] No tasting found with ID:', tasting_id);
					throw new Error(`Tasting with ID ${tasting_id} not found or update was blocked`);
				}

				if (data.length > 1) {
					console.error('[Tool: admin_edit_tasting] Multiple tastings updated, expected one:', data.length);
					throw new Error(`Expected to update one tasting, but updated ${data.length}`);
				}
				
				console.log('[Tool: admin_edit_tasting] Updated successfully');
				return {
					success: true,
					tasting: data[0],
					message: 'Tasting updated successfully',
				};
			},
		}),
		
		admin_delete_record: tool({
			description: 'Delete any record from sakes, tasters, tastings, or scores tables. Admin only.',
			inputSchema: z.object({
				table: z.enum(['sakes', 'tasters', 'tastings', 'scores']).describe('Table to delete from'),
				record_id: z.string().describe('ID of the record to delete'),
			}),
			execute: async ({ table, record_id }) => {
				console.log('[Tool: admin_delete_record] Deleting from', table, ':', record_id);
				const supabase = createServiceClient();
				
				const { error } = await supabase
					.from(table)
					.delete()
					.eq('id', record_id);
				
				if (error) {
					console.error('[Tool: admin_delete_record] Error:', error.message);
					throw new Error(`Failed to delete record: ${error.message}`);
				}
				
				console.log('[Tool: admin_delete_record] Deleted successfully');
				return {
					success: true,
					message: `Deleted record from ${table}`,
				};
			},
		}),
		
		admin_list_records: tool({
			description: 'List records from any table with optional filters. Admin only.',
			inputSchema: z.object({
				table: z.enum(['sakes', 'tasters', 'tastings', 'scores']).describe('Table to query'),
				limit: z.number().optional().describe('Maximum number of records (default 20)'),
				filters: z.record(z.string(), z.any()).optional().describe('Optional filters as key-value pairs'),
			}),
			execute: async ({ table, limit, filters }) => {
				console.log('[Tool: admin_list_records] Listing from', table, 'limit:', limit, 'filters:', filters);
				const supabase = createServiceClient();
				const queryLimit = limit || 20;
				
				let query = supabase
					.from(table)
					.select('*')
					.limit(queryLimit);
				
				if (filters) {
					for (const [key, value] of Object.entries(filters)) {
						query = query.eq(key, value);
					}
				}
				
				const { data, error } = await query;
				
				if (error) {
					console.error('[Tool: admin_list_records] Error:', error.message);
					throw new Error(`Failed to list records: ${error.message}`);
				}
				
				console.log('[Tool: admin_list_records] Listed', data?.length || 0, 'records');
				return {
					success: true,
					records: data,
					count: data?.length || 0,
				};
			},
		}),
	};
};

const lookupTasterHelper = async (
	supabase: ReturnType<typeof createServiceClient>,
	input: { name: string; phone?: string }
): Promise<{ success: boolean; taster: Taster; created: boolean }> => {
	const { name, phone } = input;

	if (phone) {
		try {
			const resolution = await resolveTasterByPhone(supabase, phone);

			if (resolution.tasterId) {
				const { data: linkedTaster, error: linkedTasterError } = await supabase
					.from('tasters')
					.select('*')
					.eq('id', resolution.tasterId)
					.maybeSingle();

				if (linkedTasterError) {
					throw new Error(`Failed to load linked taster: ${linkedTasterError.message}`);
				}

				if (linkedTaster) {
					await ensurePhoneLinkForTaster(supabase, linkedTaster.id, phone);
					return {
						success: true,
						taster: linkedTaster,
						created: false,
					};
				}
			}
		} catch (error) {
			console.warn('[lookupTasterHelper] Failed resolving taster by phone hash:', error);
		}
	}

	const { data: tasterByName, error: tasterByNameError } = await supabase
		.from('tasters')
		.select('*')
		.ilike('name', name)
		.maybeSingle();

	if (tasterByNameError) {
		throw new Error(`Failed to find taster by name: ${tasterByNameError.message}`);
	}

	if (tasterByName) {
		if (phone) {
			await ensurePhoneLinkForTaster(supabase, tasterByName.id, phone);
		}

		return {
			success: true,
			taster: tasterByName,
			created: false,
		};
	}

	const phoneHash = phone ? hashPhoneNumber(phone) : null;

	const { data: newTaster, error: createError } = await supabase
		.from('tasters')
		.insert({
			name,
			phone_hash: phoneHash,
		})
		.select()
		.single();

	if (createError) {
		throw new Error(`Failed to create taster: ${createError.message}`);
	}

	if (phone) {
		await ensurePhoneLinkForTaster(supabase, newTaster.id, phone);
	}

	return {
		success: true,
		taster: newTaster,
		created: true,
	};
};
