import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type {
  Company,
  CompanyMembership,
  UserProfile,
} from '../types/auth'
import {
  AuthContext,
  type AuthContextValue,
  type SignInResult,
} from './auth-context'

interface AuthProviderProps {
  children: ReactNode
}

function translateAuthError(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Debes confirmar tu correo antes de iniciar sesión.'
  }

  if (normalized.includes('user is banned')) {
    return 'Este usuario se encuentra deshabilitado.'
  }

  return 'No fue posible iniciar sesión. Revisa los datos e inténtalo nuevamente.'
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [membership, setMembership] =
    useState<CompanyMembership | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [contextError, setContextError] = useState<string | null>(null)

  const activeSessionUserIdRef = useRef<string | null>(null)
  const loadedContextUserIdRef = useRef<string | null>(null)
  const contextLoadUserIdRef = useRef<string | null>(null)
  const contextLoadPromiseRef = useRef<Promise<void> | null>(null)

  const clearBusinessContext = useCallback(() => {
    loadedContextUserIdRef.current = null
    setProfile(null)
    setMembership(null)
    setCompany(null)
    setContextError(null)
  }, [])

  const loadBusinessContext = useCallback(async (authUser: User) => {
    setContextError(null)

    const { data: profileData, error: profileError } = await supabase
      .from('perfiles')
      .select('id, nombres, apellidos, telefono, avatar_url, activo')
      .eq('id', authUser.id)
      .maybeSingle()

    if (profileError) {
      throw new Error(`No se pudo consultar el perfil: ${profileError.message}`)
    }

    if (!profileData || !profileData.activo) {
      throw new Error('El perfil no existe o se encuentra deshabilitado.')
    }

    const { data: membershipData, error: membershipError } =
      await supabase
        .from('usuarios_empresa')
        .select('id, empresa_id, perfil_id, rol, activo')
        .eq('perfil_id', authUser.id)
        .eq('activo', true)
        .limit(1)
        .maybeSingle()

    if (membershipError) {
      throw new Error(
        `No se pudo consultar la membresía: ${membershipError.message}`,
      )
    }

    if (!membershipData) {
      throw new Error(
        'El usuario no tiene una membresía empresarial activa.',
      )
    }

    const { data: companyData, error: companyError } = await supabase
      .from('empresas')
      .select(
        'id, nombre, razon_social, ruc, moneda, zona_horaria, activo',
      )
      .eq('id', membershipData.empresa_id)
      .maybeSingle()

    if (companyError) {
      throw new Error(
        `No se pudo consultar la empresa: ${companyError.message}`,
      )
    }

    if (!companyData || !companyData.activo) {
      throw new Error('La empresa no existe o se encuentra deshabilitada.')
    }

    if (activeSessionUserIdRef.current !== authUser.id) {
      return
    }

    setProfile(profileData as UserProfile)
    setMembership(membershipData as CompanyMembership)
    setCompany(companyData as Company)
    loadedContextUserIdRef.current = authUser.id
  }, [])

  const loadContextForUser = useCallback(
    async (authUser: User, force = false) => {
      if (!force && loadedContextUserIdRef.current === authUser.id) {
        return
      }

      if (
        contextLoadPromiseRef.current &&
        contextLoadUserIdRef.current === authUser.id
      ) {
        await contextLoadPromiseRef.current
        return
      }

      if (contextLoadPromiseRef.current) {
        await contextLoadPromiseRef.current
      }

      const request = (async () => {
        setLoading(true)
        setContextError(null)

        try {
          await loadBusinessContext(authUser)
        } catch (error) {
          if (activeSessionUserIdRef.current !== authUser.id) {
            return
          }

          clearBusinessContext()
          setContextError(
            error instanceof Error
              ? error.message
              : 'No se pudo cargar la información empresarial.',
          )
        } finally {
          if (activeSessionUserIdRef.current === authUser.id) {
            setLoading(false)
          }
        }
      })()

      contextLoadUserIdRef.current = authUser.id
      contextLoadPromiseRef.current = request

      try {
        await request
      } finally {
        if (contextLoadPromiseRef.current === request) {
          contextLoadPromiseRef.current = null
          contextLoadUserIdRef.current = null
        }
      }
    },
    [clearBusinessContext, loadBusinessContext],
  )

  const applySession = useCallback(
    async (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null

      activeSessionUserIdRef.current = nextUser?.id ?? null
      setSession(nextSession)
      setUser(nextUser)

      if (!nextUser) {
        clearBusinessContext()
        setLoading(false)
        return
      }

      if (
        loadedContextUserIdRef.current &&
        loadedContextUserIdRef.current !== nextUser.id
      ) {
        clearBusinessContext()
      }

      await loadContextForUser(nextUser)
    },
    [clearBusinessContext, loadContextForUser],
  )

  useEffect(() => {
    let active = true

    const initialize = async () => {
      setLoading(true)

      const {
        data: { session: currentSession },
        error,
      } = await supabase.auth.getSession()

      if (!active) return

      if (error) {
        setContextError(`No se pudo recuperar la sesión: ${error.message}`)
        setLoading(false)
        return
      }

      await applySession(currentSession)
    }

    void initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      window.setTimeout(() => {
        if (!active) return

        if (event === 'INITIAL_SESSION') {
          return
        }

        if (event === 'SIGNED_OUT' || !nextSession) {
          void applySession(null)
          return
        }

        activeSessionUserIdRef.current = nextSession.user.id
        setSession(nextSession)
        setUser(nextSession.user)

        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          return
        }

        void applySession(nextSession)
      }, 0)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [applySession])

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      setContextError(null)

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        return { error: translateAuthError(error.message) }
      }

      await applySession(data.session)

      return { error: null }
    },
    [applySession],
  )

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      setContextError(`No se pudo cerrar la sesión: ${error.message}`)
      return
    }

    await applySession(null)
  }, [applySession])

  const refreshUserContext = useCallback(async () => {
    if (!user) return

    loadedContextUserIdRef.current = null
    await loadContextForUser(user, true)
  }, [loadContextForUser, user])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      membership,
      company,
      loading,
      contextError,
      signIn,
      signOut,
      refreshUserContext,
    }),
    [
      session,
      user,
      profile,
      membership,
      company,
      loading,
      contextError,
      signIn,
      signOut,
      refreshUserContext,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
