'use client';

// TODO: Re-enable when auth is implemented
// For MVP, this is a no-op provider
export default function UserInfoProvider() {
	// Auth disabled for MVP
	return null;
}

/*
import React, { useCallback, useEffect, useRef } from 'react';
import { type Session } from '@supabase/supabase-js';

import { Tables } from '@/types'
// import { useEventTracking } from '@/hooks/useEventTracking';
import { userInfoStore } from '@/lib/store/userInfoStore';
import { createClient } from '@/lib/supabase/client';

export default function UserInfoProviderOriginal() {
	const { setSession, setUser, setStatus, setError } = userInfoStore();
	const session = userInfoStore((state) => state.session);
	const supabase = createClient();
	// const eventTracker = useEventTracking();

	console.log('[UserInfoProvider] Component rendered', {
		has_session: !!session,
		session_user_id: session?.user?.id,
		session_email: session?.user?.email,
	});

	// Track previous user to detect new sign-ins
	const previousUserIdRef = useRef<string | null>(null);
	// Track previous session user ID to detect actual session changes
	const previousSessionUserIdRef = useRef<string | null>(null);

	const getUser = async (session: Session) => {
		console.log('[UserInfoProvider] getUser called', { user_id: session.user.id });
		const supabaseRes = await supabase.from('users').select('*').eq('id', session.user.id).single();

		if (supabaseRes.error) {
			console.error('[UserInfoProvider] getUser error', {
				user_id: session.user.id,
				error: supabaseRes.error,
			});
			throw supabaseRes.error;
		}

		const sakeUser: Tables<'users'> = {
			...supabaseRes.data,
		};

		console.log('[UserInfoProvider] getUser success', {
			user_id: session.user.id,
			email: sakeUser.email,
		});

		return sakeUser;
	};


	const refreshUserData = useCallback(async () => {
		console.log('[UserInfoProvider] refreshUserData called', {
			has_session: !!session,
			session_user_id: session?.user?.id,
		});

		if (!session) {
			console.log('[UserInfoProvider] refreshUserData - no session, clearing state');
			setUser(null);
			setStatus('error');
			return;
		}

		try {
			console.log('[UserInfoProvider] refreshUserData - setting status to loading');
			setStatus('loading');
			const sakeUser = await getUser(session)
			
			
			setUser(sakeUser);
			setStatus('loaded');
			setError(null);
		} catch (error) {
			console.error('[UserInfoProvider] refreshUserData error', {
				session_user_id: session?.user?.id,
				error: error instanceof Error ? error.message : String(error),
			});
			setStatus('error');
			setError(error instanceof Error ? error : new Error('Failed to fetch user data'));
			setUser(null);
			
			
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session]);

	

	

	const refreshUser = useCallback(async () => {
		console.log('[UserInfoProvider] refreshUser called', {
			has_session: !!session,
			session_user_id: session?.user?.id,
		});

		if (!session) {
			console.log('[UserInfoProvider] refreshUser - no session, skipping');
			return;
		}

		try {
			const sakeUser = await getUser(session);
			console.log('[UserInfoProvider] refreshUser - updating user state', {
				user_id: sakeUser.id,
				email: sakeUser.email,
			});
			setUser(sakeUser);
		} catch (error) {
			console.error('[UserInfoProvider] refreshUser error', {
				session_user_id: session?.user?.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session]);

	

	

	useEffect(() => {
		console.log('[UserInfoProvider] useEffect - initial mount, setting up auth listener');
		const getInitialSession = async () => {
			console.log('[UserInfoProvider] getInitialSession triggered');
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();
				console.log('[UserInfoProvider] getInitialSession - session retrieved', {
					has_session: !!session,
					session_user_id: session?.user?.id,
					session_email: session?.user?.email,
				});
				if (session) {
					const sakeUser = await getUser(session as Session);
					console.log('[UserInfoProvider] getInitialSession - initial data loaded', {
						user_id: sakeUser.id,
					});
					setUser(sakeUser);
					// Set initial previous user ID
					previousUserIdRef.current = session.user.id;
					// Set initial previous session user ID
					previousSessionUserIdRef.current = session.user.id;
				} else {
					console.log('[UserInfoProvider] getInitialSession - no session found');
					// Initialize ref to null if no session
					previousSessionUserIdRef.current = null;
				}
				setSession(session as Session | null);
				setStatus('loaded');
			} catch (error) {
				console.error('[UserInfoProvider] getInitialSession error', {
					error: error instanceof Error ? error.message : String(error),
				});
				setStatus('error');
				setError(error instanceof Error ? error : new Error('Failed to get session'));
			}
			console.log('[UserInfoProvider] getInitialSession completed');
		};

		getInitialSession();

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			console.log('[UserInfoProvider] onAuthStateChange', {
				event: _event,
				has_session: !!session,
				session_user_id: session?.user?.id,
				session_email: session?.user?.email,
				previous_user_id: previousUserIdRef.current,
				previous_session_user_id: previousSessionUserIdRef.current,
			});

			setSession(session as Session | null);

			// Only track events if we have valid session data
			if (session?.user?.id && session?.user?.email) {
				switch (_event) {
					case 'SIGNED_IN': {
						// Check if this is a new user signing in (different from previous user)
						const userCreatedAt = session.user.created_at ? new Date(session.user.created_at).getTime() : null;
						const now = Date.now();
						const twoMinutesInMs = 2 * 60 * 1000;
						const isNewUser = userCreatedAt !== null && now - userCreatedAt < twoMinutesInMs;
						console.log('[UserInfoProvider] SIGNED_IN event', {
							user_id: session.user.id,
							email: session.user.email,
							is_new_user: isNewUser,
						});

						// Update previous user ID
						previousUserIdRef.current = session.user.id;

						break;
					}
					case 'SIGNED_OUT': {
						console.log('[UserInfoProvider] SIGNED_OUT event', {
							user_id: session.user.id,
						});
						// eventTracker.sign_out({
						//     user_id: session.user.id,
						// })
						// Clear previous user ID on sign out
						previousUserIdRef.current = null;
						// Clear previous session user ID on sign out
						previousSessionUserIdRef.current = null;
						break;
					}
					default: {
						console.log('[UserInfoProvider] Auth state change event (other)', {
							event: _event,
							user_id: session.user.id,
						});
					}
				}
			} else {
				console.log('[UserInfoProvider] Auth state change - invalid session data', {
					event: _event,
					has_user_id: !!session?.user?.id,
					has_email: !!session?.user?.email,
				});
			}
		});

		return () => {
			console.log('[UserInfoProvider] useEffect cleanup - unmounting, unsubscribing from auth listener');
			subscription.unsubscribe();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const currentSessionUserId = session?.user?.id ?? null;
		const previousSessionUserId = previousSessionUserIdRef.current;

		console.log('[UserInfoProvider] useEffect - session change check', {
			current_session_user_id: currentSessionUserId,
			previous_session_user_id: previousSessionUserId,
			should_refresh: currentSessionUserId !== previousSessionUserId,
		});

		// Only refresh if the session user ID actually changed
		if (currentSessionUserId !== previousSessionUserId) {
			console.log('session');
			previousSessionUserIdRef.current = currentSessionUserId;
			if (session) {
				console.log('[UserInfoProvider] Session user ID changed, refreshing user data');
				refreshUserData();
			} else {
				console.log('[UserInfoProvider] Session cleared, skipping refresh');
			}
		}
	}, [session, refreshUserData]);

	useEffect(() => {
		if (!session?.user.id) {
			console.log('[UserInfoProvider] useEffect - realtime subscriptions skipped, no session user ID');
			return;
		}

		console.log('[UserInfoProvider] useEffect - setting up realtime subscriptions', {
			user_id: session.user.id,
		});

		const channel = supabase
			.channel('user-update-channel')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'users',
					filter: `id=eq.${session.user.id}`,
				},
				(payload) => {
					console.log('[UserInfoProvider] Realtime event - users table changed', {
						event: payload.eventType,
						user_id: session.user.id,
					});
					refreshUser();
				}
			)
			.subscribe();

		console.log('[UserInfoProvider] Realtime subscriptions established', {
			user_id: session.user.id,
			channels: ['user-update-channel', 'subscription-update-channel', 'email-connections-update-channel'],
		});

		return () => {
			console.log('[UserInfoProvider] useEffect cleanup - removing realtime channels', {
				user_id: session.user.id,
			});
			supabase.removeChannel(channel);
		};
	}, [session?.user.id, refreshUser, supabase]);

	useEffect(() => {
		console.log('[UserInfoProvider] Component mounted');
		return () => {
			console.log('[UserInfoProvider] Component unmounting');
		};
	}, []);

	// Periodically update user agent and IP

	return <></>;
}
*/
