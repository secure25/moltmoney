'use client'

import { LogOut } from 'lucide-react'

export function LogoutButton() {
  const handleLogout = async () => {
    try {
      // Call the logout API route to clear the cookie server-side
      await fetch('/api/logout', { method: 'POST' })
    } catch (error) {
      console.error('Logout error:', error)
    }
    
    // Clear client-side cookie as backup
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
    
    // Redirect to landing page
    window.location.href = '/'
  }

  return (
    <button 
      onClick={handleLogout}
      className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-white/50 hover:text-red-600 transition-all"
    >
      <LogOut className="w-4 h-4" />
      <span className="hidden sm:inline">Logout</span>
    </button>
  )
}
