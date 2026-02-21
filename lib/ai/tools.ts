import { z } from 'zod';
import { tool } from 'ai';
import { createServiceClient } from '@/lib/supabase/server';
import { ensurePhoneLinkForTaster, hashPhoneNumber, resolveTasterByPhone } from '@/lib/phoneHash';
import type { Database } from '@/types/supabase/databaseTypes';
import type { Twilio } from 'twilio';

type Taster = Database['public']['Tables']['tasters']['Row'];

type ToolContext = {
	twilioClient: Twilio;
	fromNumber: string;
	toNumber: string;
};

export const createTools = (context: ToolContext) => {
	const { twilioClient, fromNumber, toNumber } = context;

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
		console.log('[Tool: identify_sake] Executing with params:', JSON.stringify(params));
		const { name, prefecture, grade, type, rice, polishing_ratio, alc_percentage, smv, bottling_company } = params;
		const supabase = createServiceClient();

		const { data: existingSake, error: findError } = await supabase
			.from('sakes')
			.select('*')
			.ilike('name', name)
			.single();

		if (!findError && existingSake) {
			console.log('[Tool: identify_sake] Found existing sake:', existingSake.id);
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

		for (const scoreInput of scores) {
			const tasterResult = await lookupTasterHelper(supabase, {
				name: scoreInput.taster_name,
				phone: scoreInput.taster_phone,
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
			message: `Recorded ${processedScores.length} score(s)`,
		};
	},
	}),

	lookup_taster: tool({
		description:
			'Find an existing taster by name or phone number, or create a new one.',
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
					.select()
					.single();
				
				if (error) {
					console.error('[Tool: admin_edit_sake] Error:', error.message);
					throw new Error(`Failed to update sake: ${error.message}`);
				}
				
				console.log('[Tool: admin_edit_sake] Updated successfully');
				return {
					success: true,
					sake: data,
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
						.single()
					: await supabase
						.from('tasters')
						.select('*')
						.eq('id', taster_id)
						.single();

				if (tasterUpdateError) {
					console.error('[Tool: admin_edit_taster] Error:', tasterUpdateError.message);
					throw new Error(`Failed to update taster: ${tasterUpdateError.message}`);
				}

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

				const { data: refreshedTaster, error: refreshError } = await supabase
					.from('tasters')
					.select('*')
					.eq('id', taster_id)
					.single();

				if (refreshError) {
					throw new Error(`Failed to refresh updated taster: ${refreshError.message}`);
				}

				console.log('[Tool: admin_edit_taster] Updated successfully');
				return {
					success: true,
					taster: refreshedTaster || updatedOrExistingTaster,
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
					.select()
					.single();
				
				if (error) {
					console.error('[Tool: admin_edit_tasting] Error:', error.message);
					throw new Error(`Failed to update tasting: ${error.message}`);
				}
				
				console.log('[Tool: admin_edit_tasting] Updated successfully');
				return {
					success: true,
					tasting: data,
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
