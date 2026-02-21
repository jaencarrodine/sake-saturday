import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase/databaseTypes';

type ServiceSupabaseClient = SupabaseClient<Database>;

const WHATSAPP_PREFIX_REGEX = /^whatsapp:/i;

export type PhoneLinkResolution = {
	normalizedPhone: string;
	phoneHash: string;
	tasterId: string | null;
};

const hashNormalizedPhoneNumber = (normalizedPhone: string): string =>
	createHash('sha256').update(normalizedPhone).digest('hex');

export const normalizePhoneNumber = (phoneNumber: string): string => {
	const trimmedPhone = phoneNumber.trim();

	if (!trimmedPhone) {
		throw new Error('Phone number is required');
	}

	const withoutProtocol = trimmedPhone.replace(WHATSAPP_PREFIX_REGEX, '');
	const hasLeadingPlus = withoutProtocol.startsWith('+');
	const digitsOnly = withoutProtocol.replace(/[^\d]/g, '');

	if (!digitsOnly) {
		throw new Error('Phone number must contain digits');
	}

	return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
};

export const hashPhoneNumber = (phoneNumber: string): string =>
	hashNormalizedPhoneNumber(normalizePhoneNumber(phoneNumber));

const resolveTasterIdFromPhoneHash = async (
	supabase: ServiceSupabaseClient,
	phoneHash: string
): Promise<string | null> => {
	const { data: directMatch, error: directMatchError } = await supabase
		.from('tasters')
		.select('id')
		.eq('phone_hash', phoneHash)
		.maybeSingle();

	if (directMatchError) {
		throw new Error(`Failed to resolve taster by direct phone hash: ${directMatchError.message}`);
	}

	if (directMatch) {
		return directMatch.id;
	}

	const { data: linkMatch, error: linkMatchError } = await supabase
		.from('taster_phone_links')
		.select('taster_id')
		.eq('phone_hash', phoneHash)
		.order('linked_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (linkMatchError) {
		throw new Error(`Failed to resolve taster by phone link hash: ${linkMatchError.message}`);
	}

	return linkMatch?.taster_id ?? null;
};

export const resolveTasterByPhone = async (
	supabase: ServiceSupabaseClient,
	phoneNumber: string
): Promise<PhoneLinkResolution> => {
	const normalizedPhone = normalizePhoneNumber(phoneNumber);
	const phoneHash = hashNormalizedPhoneNumber(normalizedPhone);
	const tasterId = await resolveTasterIdFromPhoneHash(supabase, phoneHash);

	return {
		normalizedPhone,
		phoneHash,
		tasterId,
	};
};

export const ensurePhoneLinkForTaster = async (
	supabase: ServiceSupabaseClient,
	tasterId: string,
	phoneNumber: string
): Promise<{ phoneHash: string; normalizedPhone: string }> => {
	const normalizedPhone = normalizePhoneNumber(phoneNumber);
	const phoneHash = hashNormalizedPhoneNumber(normalizedPhone);
	const linkedAt = new Date().toISOString();

	const { error: updateError } = await supabase
		.from('tasters')
		.update({ phone_hash: phoneHash })
		.eq('id', tasterId);

	if (updateError) {
		throw new Error(`Failed to update taster phone hash: ${updateError.message}`);
	}

	const { error: upsertLinkError } = await supabase
		.from('taster_phone_links')
		.upsert(
			{
				taster_id: tasterId,
				phone_hash: phoneHash,
				linked_at: linkedAt,
			},
			{
				onConflict: 'phone_hash',
			}
		);

	if (upsertLinkError) {
		throw new Error(`Failed to upsert taster phone link: ${upsertLinkError.message}`);
	}

	return {
		normalizedPhone,
		phoneHash,
	};
};
