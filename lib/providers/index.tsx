'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import UserInfoProvider from '@/lib/providers/UserInfoProvider';
import QueryClientProvider from '@/lib/providers/QueryClientProvider';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
			api_host: '/relay-Bhiq',
			ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST!,
			capture_pageview: false, // Disable automatic pageview capture, needs to be handled manually for next js but is optional.
			debug: false,
		});
	}, []);

	return (
		<NextThemesProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
			enableColorScheme
		>
			<QueryClientProvider>
				<NuqsAdapter>
					
						{/* <GoogleTagManager gtmId={'GTM-N7P8879M'} /> */}
						<Toaster />
						<UserInfoProvider />
						{children}
					
				</NuqsAdapter>
			</QueryClientProvider>
		</NextThemesProvider>
	);
}
