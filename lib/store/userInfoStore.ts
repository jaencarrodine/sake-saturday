import { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { mountStoreDevtool } from 'simple-zustand-devtools';

type LoadingStatus = 'loading' | 'loaded' | 'error';

// TODO: Add proper user type when auth is implemented
type User = {
	id: string;
	email: string;
	created_at: string;
};

type UserInfoStore = {
	session: Session | null;
	setSession: (session: Session | null) => void;
	user: User | null;
	setUser: (user: User | null) => void;
	status: LoadingStatus;
	setStatus: (status: LoadingStatus) => void;
	error: Error | null;
	setError: (error: Error | null) => void;
};

const initialState = {
	session: null,
	user: null,
	status: 'loading' as LoadingStatus,
	error: null,
};

export const userInfoStore = create<UserInfoStore>((set) => ({
	...initialState,
	setSession: (session) => set({ session }),
	setUser: (user) => set({ user }),
	setStatus: (status) => set({ status }),
	setError: (error) => set({ error }),
}));

if (process.env.NODE_ENV === 'development') {
	mountStoreDevtool('UserInfoStore', userInfoStore);
}
