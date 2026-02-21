import type { Database } from '@/types/supabase/databaseTypes';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const getRequiredEnvVar = (name: string): string => {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
};

const getServerSupabaseUrl = (): string => {
	const value = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (!value) {
		throw new Error(
			'Missing required environment variable: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL'
		);
	}
	return value;
};

export const createClient = async (): Promise<SupabaseClient<Database>> => {
	return createSupabaseClient<Database>(
		getServerSupabaseUrl(),
		getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		}
	);
};

// Service role client for API routes with admin privileges
export const createServiceClient = (): SupabaseClient<Database> => {
	return createSupabaseClient<Database>(
		getServerSupabaseUrl(),
		getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		}
	);
};
