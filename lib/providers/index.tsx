'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import QueryClientProvider from '@/lib/providers/QueryClientProvider';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
			posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
				api_host: '/relay-Bhiq',
				ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST!,
				capture_pageview: false, // Disable automatic pageview capture, needs to be handled manually for next js but is optional.
				debug: false,
			});
		}
	}, []);

	return (
		<NextThemesProvider
			attribute="class"
			defaultTheme="dark"
			enableSystem={false}
			disableTransitionOnChange
			enableColorScheme
		>
			<QueryClientProvider>
				<NuqsAdapter>
					<Toaster />
					{children}
				</NuqsAdapter>
			</QueryClientProvider>
		</NextThemesProvider>
	);
}
