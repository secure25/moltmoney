'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AuthErrorHandler() {
  const router = useRouter()

  useEffect(() => {
    // Listen for auth errors from API calls
    const handleAuthError = () => {
      // Clear token and redirect to login
      document.cookie = 'token=; path=/; max-age=0'
      router.push('/auth/login')
    }

    // You can add event listeners here if needed
    window.addEventListener('auth-error', handleAuthError)

    return () => {
      window.removeEventListener('auth-error', handleAuthError)
    }
  }, [router])

  return null
}
