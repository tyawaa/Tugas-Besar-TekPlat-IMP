'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { UserRole } from './mock-data'
import { initializeMockData } from './init-mock-data'

interface AuthContextType {
  userId: string | null
  userName: string | null
  userRole: UserRole | null
  userEmail: string | null
  login: (userId: string, userName: string, email: string, role: UserRole) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load from localStorage on mount
  useEffect(() => {
    // Initialize mock data first
    initializeMockData()
    
    try {
      const stored = localStorage.getItem('iotbridge_auth')
      if (stored) {
        const auth = JSON.parse(stored)
        setUserId(auth.userId)
        setUserName(auth.userName)
        setUserRole(auth.userRole)
        setUserEmail(auth.userEmail)
      }
    } catch (err) {
      console.error('Error loading auth:', err)
    }
    setIsLoading(false)
  }, [])

  const login = (userId: string, userName: string, email: string, role: UserRole) => {
    setUserId(userId)
    setUserName(userName)
    setUserRole(role)
    setUserEmail(email)
    localStorage.setItem('iotbridge_auth', JSON.stringify({ userId, userName, userRole: role, userEmail: email }))
  }

  const logout = () => {
    setUserId(null)
    setUserName(null)
    setUserRole(null)
    setUserEmail(null)
    localStorage.removeItem('iotbridge_auth')
  }

  return (
    <AuthContext.Provider value={{ userId, userName, userRole, userEmail, login, logout, isLoading }}>
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
