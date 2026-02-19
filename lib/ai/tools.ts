import { createServiceClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase/databaseTypes';

type Taster = Database['public']['Tables']['tasters']['Row'];

export const TOOL_DEFINITIONS = [
	{
		name: 'identify_sake',
		description:
			'Search for an existing sake in the database or create a new one. Use this when the user sends a photo or description of a sake bottle.',
		input_schema: {
			type: 'object',
			properties: {
				name: {
					type: 'string',
					description: 'Name of the sake (required)',
				},
				prefecture: {
					type: 'string',
					description: 'Prefecture/region where the sake is from',
				},
				grade: {
					type: 'string',
					description: 'Sake grade (e.g., Daiginjo, Ginjo, Junmai, Honjozo)',
				},
				type: {
					type: 'string',
					description: 'Type classification',
				},
				rice: {
					type: 'string',
					description: 'Rice variety used (e.g., Yamada Nishiki)',
				},
				polishing_ratio: {
					type: 'number',
					description: 'Polishing ratio as a percentage (e.g., 50 for 50%)',
				},
				alc_percentage: {
					type: 'number',
					description: 'Alcohol percentage (ABV)',
				},
				smv: {
					type: 'number',
					description: 'Sake Meter Value (sweetness/dryness)',
				},
				bottling_company: {
					type: 'string',
					description: 'Brewery/bottling company name',
				},
			},
			required: ['name'],
		},
	},
	{
		name: 'create_tasting',
		description:
			'Create a new tasting session for a sake. Use this after identifying a sake and when the user is ready to start tasting.',
		input_schema: {
			type: 'object',
			properties: {
				sake_id: {
					type: 'string',
					description: 'ID of the sake being tasted (from identify_sake result)',
				},
				date: {
					type: 'string',
					description: 'Date of tasting in YYYY-MM-DD format (defaults to today)',
				},
				location_name: {
					type: 'string',
					description: 'Name of the location where tasting is happening',
				},
				created_by_phone: {
					type: 'string',
					description: 'Phone number of the person creating the tasting',
				},
			},
			required: ['sake_id'],
		},
	},
	{
		name: 'record_scores',
		description:
			'Record scores from tasters for a specific tasting. Scores are on a 0-10 scale. Can record multiple tasters at once.',
		input_schema: {
			type: 'object',
			properties: {
				tasting_id: {
					type: 'string',
					description: 'ID of the tasting session',
				},
				scores: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							taster_name: {
								type: 'string',
								description: 'Name of the taster',
							},
							taster_phone: {
								type: 'string',
								description: 'Phone number of the taster (if available)',
							},
							score: {
								type: 'number',
								description: 'Score from 0-10',
							},
							notes: {
								type: 'string',
								description: 'Tasting notes or comments',
							},
						},
						required: ['taster_name', 'score'],
					},
					description: 'Array of scores from different tasters',
				},
			},
			required: ['tasting_id', 'scores'],
		},
	},
	{
		name: 'lookup_taster',
		description:
			'Find an existing taster by name or phone number, or create a new one.',
		input_schema: {
			type: 'object',
			properties: {
				name: {
					type: 'string',
					description: 'Name of the taster',
				},
				phone_number: {
					type: 'string',
					description: 'Phone number of the taster',
				},
			},
			required: ['name'],
		},
	},
	{
		name: 'get_tasting_history',
		description:
			'Get past tasting sessions, optionally filtered by sake, taster, or date range.',
		input_schema: {
			type: 'object',
			properties: {
				sake_id: {
					type: 'string',
					description: 'Filter by specific sake ID',
				},
				taster_id: {
					type: 'string',
					description: 'Filter by specific taster ID',
				},
				limit: {
					type: 'number',
					description: 'Maximum number of tastings to return (default 10)',
				},
			},
			required: [],
		},
	},
	{
		name: 'get_sake_rankings',
		description:
			'Get the current sake leaderboard with average scores and number of tastings.',
		input_schema: {
			type: 'object',
			properties: {
				limit: {
					type: 'number',
					description: 'Maximum number of sakes to return (default 10)',
				},
				min_tastings: {
					type: 'number',
					description: 'Minimum number of tastings required to be included (default 1)',
				},
			},
			required: [],
		},
	},
];

export const executeTool = async (
	toolName: string,
	toolInput: Record<string, unknown>
): Promise<unknown> => {
	const supabase = createServiceClient();

	switch (toolName) {
		case 'identify_sake':
			return await identifySake(supabase, toolInput);
		case 'create_tasting':
			return await createTasting(supabase, toolInput);
		case 'record_scores':
			return await recordScores(supabase, toolInput);
		case 'lookup_taster':
			return await lookupTaster(supabase, toolInput);
		case 'get_tasting_history':
			return await getTastingHistory(supabase, toolInput);
		case 'get_sake_rankings':
			return await getSakeRankings(supabase, toolInput);
		default:
			throw new Error(`Unknown tool: ${toolName}`);
	}
};

const identifySake = async (
	supabase: ReturnType<typeof createServiceClient>,
	input: Record<string, unknown>
) => {
	const name = input.name as string;

	const { data: existingSake, error: findError } = await supabase
		.from('sakes')
		.select('*')
		.ilike('name', name)
		.single();

	if (!findError && existingSake) {
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
			prefecture: input.prefecture as string | undefined,
			grade: input.grade as string | undefined,
			type: input.type as string | undefined,
			rice: input.rice as string | undefined,
			polishing_ratio: input.polishing_ratio as number | undefined,
			alc_percentage: input.alc_percentage as number | undefined,
			smv: input.smv as number | undefined,
			bottling_company: input.bottling_company as string | undefined,
		})
		.select()
		.single();

	if (createError) {
		throw new Error(`Failed to create sake: ${createError.message}`);
	}

	return {
		success: true,
		sake: newSake,
		created: true,
		message: 'Created new sake in database',
	};
};

const createTasting = async (
	supabase: ReturnType<typeof createServiceClient>,
	input: Record<string, unknown>
) => {
	const sakeId = input.sake_id as string;
	const date = (input.date as string) || new Date().toISOString().split('T')[0];
	const locationName = input.location_name as string | undefined;
	const createdByPhone = input.created_by_phone as string | undefined;

	let createdById: string | undefined;
	if (createdByPhone) {
		const { data: taster } = await supabase
			.from('tasters')
			.select('id')
			.eq('phone_number', createdByPhone)
			.single();
		createdById = taster?.id;
	}

	const { data: newTasting, error: createError } = await supabase
		.from('tastings')
		.insert({
			sake_id: sakeId,
			date,
			location_name: locationName,
			created_by: createdById,
		})
		.select()
		.single();

	if (createError) {
		throw new Error(`Failed to create tasting: ${createError.message}`);
	}

	return {
		success: true,
		tasting: newTasting,
		message: 'Created new tasting session',
	};
};

const recordScores = async (
	supabase: ReturnType<typeof createServiceClient>,
	input: Record<string, unknown>
) => {
	const tastingId = input.tasting_id as string;
	const scores = input.scores as Array<{
		taster_name: string;
		taster_phone?: string;
		score: number;
		notes?: string;
	}>;

	const processedScores = [];

	for (const scoreInput of scores) {
		const tasterResult = await lookupTaster(supabase, {
			name: scoreInput.taster_name,
			phone_number: scoreInput.taster_phone,
		});

		const taster = (tasterResult as { taster: Taster }).taster;

		const { data: score, error: scoreError } = await supabase
			.from('scores')
			.upsert(
				{
					tasting_id: tastingId,
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

	return {
		success: true,
		scores: processedScores,
		count: processedScores.length,
		message: `Recorded ${processedScores.length} score(s)`,
	};
};

const lookupTaster = async (
	supabase: ReturnType<typeof createServiceClient>,
	input: Record<string, unknown>
) => {
	const name = input.name as string;
	const phoneNumber = input.phone_number as string | undefined;

	if (phoneNumber) {
		const { data, error } = await supabase
			.from('tasters')
			.select('*')
			.eq('phone_number', phoneNumber)
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
			phone_number: phoneNumber,
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

const getTastingHistory = async (
	supabase: ReturnType<typeof createServiceClient>,
	input: Record<string, unknown>
) => {
	const sakeId = input.sake_id as string | undefined;
	const tasterId = input.taster_id as string | undefined;
	const limit = (input.limit as number) || 10;

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
		.limit(limit);

	if (sakeId) {
		query = query.eq('sake_id', sakeId);
	}

	if (tasterId) {
		query = query.eq('scores.taster_id', tasterId);
	}

	const { data, error } = await query;

	if (error) {
		throw new Error(`Failed to fetch tasting history: ${error.message}`);
	}

	return {
		success: true,
		tastings: data,
		count: data?.length || 0,
	};
};

const getSakeRankings = async (
	supabase: ReturnType<typeof createServiceClient>,
	input: Record<string, unknown>
) => {
	const limit = (input.limit as number) || 10;
	const minTastings = (input.min_tastings as number) || 1;

	const { data, error } = await supabase
		.from('sake_rankings')
		.select('*')
		.gte('total_tastings', minTastings)
		.order('avg_score', { ascending: false, nullsFirst: false })
		.limit(limit);

	if (error) {
		throw new Error(`Failed to fetch sake rankings: ${error.message}`);
	}

	return {
		success: true,
		rankings: data,
		count: data?.length || 0,
	};
};
