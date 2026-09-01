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
      setUser(toAuthUser(session));
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAuthUser(session));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sendMagicLink = async (email: string, name: string, redirectPath = '/') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}${redirectPath}`,
        data: { name },
      },
    });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
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
