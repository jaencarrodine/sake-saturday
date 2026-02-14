import type { Database, Supabase } from '@blade/types';
import { createBrowserClient } from '@supabase/ssr';

export function createClient(): Supabase {
	const client = createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
	return client as unknown as Supabase;
}
