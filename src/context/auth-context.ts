import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type {
  Company,
  CompanyMembership,
  UserProfile,
} from '../types/auth'

export interface SignInResult {
  error: string | null
}

export interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  membership: CompanyMembership | null
  company: Company | null
  loading: boolean
  contextError: string | null
  signIn: (email: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
  refreshUserContext: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
