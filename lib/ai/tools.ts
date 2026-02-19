import { z } from 'zod';
import { tool } from 'ai';
import { createServiceClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase/databaseTypes';

type Taster = Database['public']['Tables']['tasters']['Row'];

export const sakeTools = {
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
		}) => {
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: identify_sake called',
				params,
				timestamp: new Date().toISOString(),
			}));

			const { name, prefecture, grade, type, rice, polishing_ratio, alc_percentage, smv, bottling_company } = params;
			const supabase = createServiceClient();

			const { data: existingSake, error: findError } = await supabase
				.from('sakes')
				.select('*')
				.ilike('name', name)
				.single();

			if (!findError && existingSake) {
				const result = {
					success: true,
					sake: existingSake,
					created: false,
					message: 'Found existing sake in database',
				};
				console.log(JSON.stringify({
					level: 'info',
					message: 'Tool: identify_sake result',
					result,
					timestamp: new Date().toISOString(),
				}));
				return result;
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
				})
				.select()
				.single();

			if (createError) {
				throw new Error(`Failed to create sake: ${createError.message}`);
			}

			const result = {
				success: true,
				sake: newSake,
				created: true,
				message: 'Created new sake in database',
			};
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: identify_sake result',
				result,
				timestamp: new Date().toISOString(),
			}));
			return result;
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
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: create_tasting called',
				params,
				timestamp: new Date().toISOString(),
			}));

			const { sake_id, date, location_name, created_by_phone } = params;
			const supabase = createServiceClient();
			const tastingDate = date || new Date().toISOString().split('T')[0];

			let createdById: string | undefined;
			if (created_by_phone) {
				const { data: taster } = await supabase
					.from('tasters')
					.select('id')
					.eq('phone_number', created_by_phone)
					.single();
				createdById = taster?.id;
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
				throw new Error(`Failed to create tasting: ${createError.message}`);
			}

			const result = {
				success: true,
				tasting: newTasting,
				tasting_url: `https://sake-saturday.vercel.app/tasting/${newTasting.id}`,
				message: 'Created new tasting session',
			};
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: create_tasting result',
				result,
				timestamp: new Date().toISOString(),
			}));
			return result;
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
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: record_scores called',
				params,
				timestamp: new Date().toISOString(),
			}));

			const { tasting_id, scores } = params;
			const supabase = createServiceClient();
			const processedScores = [];

			for (const scoreInput of scores) {
				const tasterResult = await lookupTasterHelper(supabase, {
					name: scoreInput.taster_name,
					phone_number: scoreInput.taster_phone,
				});

				const taster = tasterResult.taster;

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
					console.error('Error recording score:', scoreError);
					continue;
				}

				processedScores.push(score);
			}

			const result = {
				success: true,
				scores: processedScores,
				count: processedScores.length,
				message: `Recorded ${processedScores.length} score(s)`,
			};
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: record_scores result',
				result,
				timestamp: new Date().toISOString(),
			}));
			return result;
		},
	}),

	lookup_taster: tool({
		description:
			'Find an existing taster by name or phone number, or create a new one.',
		inputSchema: z.object({
			name: z.string().describe('Name of the taster'),
			phone_number: z.string().optional().describe('Phone number of the taster'),
		}),
		execute: async (params: {
			name: string;
			phone_number?: string;
		}) => {
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: lookup_taster called',
				params,
				timestamp: new Date().toISOString(),
			}));

			const { name, phone_number } = params;
			const supabase = createServiceClient();
			const result = await lookupTasterHelper(supabase, { name, phone_number });
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: lookup_taster result',
				result,
				timestamp: new Date().toISOString(),
			}));
			return result;
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
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: get_tasting_history called',
				params,
				timestamp: new Date().toISOString(),
			}));

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
				throw new Error(`Failed to fetch tasting history: ${error.message}`);
			}

			const result = {
				success: true,
				tastings: data,
				count: data?.length || 0,
			};
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: get_tasting_history result',
				result,
				timestamp: new Date().toISOString(),
			}));
			return result;
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
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: get_sake_rankings called',
				params,
				timestamp: new Date().toISOString(),
			}));

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
				throw new Error(`Failed to fetch sake rankings: ${error.message}`);
			}

			const result = {
				success: true,
				rankings: data,
				count: data?.length || 0,
			};
			console.log(JSON.stringify({
				level: 'info',
				message: 'Tool: get_sake_rankings result',
				result,
				timestamp: new Date().toISOString(),
			}));
			return result;
		},
	}),
};

const lookupTasterHelper = async (
	supabase: ReturnType<typeof createServiceClient>,
	input: { name: string; phone_number?: string }
): Promise<{ success: boolean; taster: Taster; created: boolean }> => {
	const { name, phone_number } = input;

	if (phone_number) {
		const { data, error } = await supabase
			.from('tasters')
			.select('*')
			.eq('phone_number', phone_number)
			.single();

		if (!error && data) {
			return {
				success: true,
				taster: data,
				created: false,
			};
		}
	}

	const { data, error } = await supabase
		.from('tasters')
		.select('*')
		.ilike('name', name)
		.single();

	if (!error && data) {
		return {
			success: true,
			taster: data,
			created: false,
		};
	}

	const { data: newTaster, error: createError } = await supabase
		.from('tasters')
		.insert({
			name,
			phone_number,
		})
		.select()
		.single();

	if (createError) {
		throw new Error(`Failed to create taster: ${createError.message}`);
	}

	return {
		success: true,
		taster: newTaster,
		created: true,
	};
};
