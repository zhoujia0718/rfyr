"use client"

import * as React from "react"
import { supabase } from "@/lib/supabase"

interface AuthContextType {
  refreshAuth: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, forceUpdate] = React.useReducer((n) => n + 1, 0)

  const refreshAuth = React.useCallback(async () => {
    const customAuth = localStorage.getItem("custom_auth")
    if (!customAuth) return

    try {
      const authData = JSON.parse(customAuth)
      if (!authData.user?.id) return

      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authData.user.id)
        .single()

      if (userData) {
        const merged = { ...authData, user: { ...authData.user, ...userData } }
        localStorage.setItem("custom_auth", JSON.stringify(merged))
      }
    } catch {
      // ignore
    }

    forceUpdate()
    window.dispatchEvent(new CustomEvent("rfyr:auth-refresh"))
  }, [])

  return (
    <AuthContext.Provider value={{ refreshAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
