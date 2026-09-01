'use client';
 
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  sendMagicLink: (email: string, name: string, redirectPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AUTH_CONFIG = {
  /**
   * Set to true to require authentication on the home page (redirects unauthenticated users to /login).
   * Set to false during development to allow direct access to the home page UI without requiring login.
   */
  requireAuthOnHome: false,
};

export function sanitizeRedirectPath(path?: string | null): string {
  if (!path || typeof path !== 'string') return '/';
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return '/';
  }
  if (/[\r\n\t]/.test(trimmed)) {
    return '/';
  }
  return trimmed;
}

export function toAuthUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  const { id, email, user_metadata } = session.user;
  const metaName = (user_metadata as Record<string, unknown> | undefined)?.name;
  return {
    id,
    email: email ?? '',
    name: (typeof metaName === 'string' && metaName) || email || 'ผู้เล่น',
  };
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const authUser = toAuthUser(session);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[AUTH] Initial session loaded:', authUser ? `User: ${authUser.id}` : 'Unauthenticated');
      }
      setUser(authUser);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const authUser = toAuthUser(session);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AUTH] onAuthStateChange event: ${event}`, authUser ? `User: ${authUser.id}` : 'Unauthenticated');
      }
      setUser(authUser);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sendMagicLink = async (email: string, name: string, redirectPath = '/') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const safeNext = sanitizeRedirectPath(redirectPath);
    const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH] Sending OTP magic link to email with redirect:', callbackUrl);
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl,
        data: { name },
      },
    });

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AUTH] signInWithOtp error:', error.message);
      }
      throw new Error(error.message);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH] OTP request successful');
    }
  };

  const signOut = async () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH] Signing out');
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, sendMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

