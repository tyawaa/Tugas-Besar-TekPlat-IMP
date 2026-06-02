'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { UserRole } from './mock-data'
import { getCurrentAccount, loginAccount, logoutAccount, registerAccount } from './api'
import { PublicUser } from './auth-types'

interface AuthContextType {
  userId: string | null
  userName: string | null
  userRole: UserRole | null
  userRoles: UserRole[]
  userEmail: string | null
  setActiveRole: (role: UserRole) => void
  login: (email: string, password: string) => Promise<void>
  register: (payload: { name: string; email: string; password: string; role: UserRole }) => Promise<void>
  logout: () => Promise<void>
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const ACTIVE_ROLE_STORAGE_KEY = 'iotbridge_active_role'

function getInitialActiveRole(user: PublicUser): UserRole {
  const roles = user.roles?.length ? user.roles : [user.role]

  if (typeof window !== 'undefined') {
    const storedRole = window.localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY) as UserRole | null
    if (storedRole && roles.includes(storedRole)) return storedRole
  }

  return roles.includes(user.role) ? user.role : roles[0]
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const setUser = (user: PublicUser | null) => {
    setUserId(user?.id || null)
    setUserName(user?.name || null)
    setUserRoles(user?.roles?.length ? user.roles : user ? [user.role] : [])
    setUserRole(user ? getInitialActiveRole(user) : null)
    setUserEmail(user?.email || null)
  }

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { user } = await getCurrentAccount()
        setUser(user)
      } catch (err) {
        console.error('Error loading auth session:', err)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadSession()
  }, [])

  const login = async (email: string, password: string) => {
    const { user } = await loginAccount({ email, password })
    setUser(user)
  }

  const register = async (payload: { name: string; email: string; password: string; role: UserRole }) => {
    const { user } = await registerAccount(payload)
    setUser(user)
  }

  const logout = async () => {
    try {
      await logoutAccount()
    } finally {
      window.localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY)
      setUser(null)
    }
  }

  const setActiveRole = (role: UserRole) => {
    if (!userRoles.includes(role)) return
    window.localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, role)
    setUserRole(role)
  }

  return (
    <AuthContext.Provider
      value={{ userId, userName, userRole, userRoles, userEmail, setActiveRole, login, register, logout, isLoading }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
