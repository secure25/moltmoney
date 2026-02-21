'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sparkles, Mail, Lock, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error?.message || 'Login failed')
      }
      
      // Store token in cookie with proper settings
      document.cookie = `token=${data.token}; path=/; max-age=${24 * 60 * 60}; samesite=strict`
      
      // Small delay to ensure cookie is set before redirect
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Force a hard navigation to ensure middleware picks up the cookie
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"></div>
          <div className="absolute bottom-20 right-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float" style={{ animationDelay: '2s' }}></div>
        </div>
        
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <Link href="/" className="flex items-center space-x-3 mb-12">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <span className="text-3xl font-bold">MoltMoney</span>
          </Link>
          
          <h1 className="text-5xl font-bold mb-6 leading-tight">
            Welcome back to the future of AI banking
          </h1>
          <p className="text-xl text-purple-100 leading-relaxed">
            Secure, scalable financial infrastructure for your autonomous agents.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 via-purple-50 to-amber-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center space-x-2 mb-8">
            <div className="w-10 h-10 rounded-xl gradient-premium flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gradient">MoltMoney</span>
          </div>

          <div className="glass rounded-2xl border border-purple-200/50 p-8 shadow-xl">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Sign in</h2>
              <p className="text-gray-600">Access your AI agent banking dashboard</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700 font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-11 h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-700 font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={8}
                    className="pl-11 h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 rounded-xl gradient-primary text-white font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all duration-300 flex items-center justify-center space-x-2" 
                disabled={loading}
              >
                <span>{loading ? 'Signing in...' : 'Sign in'}</span>
                {!loading && <ArrowRight className="w-5 h-5" />}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Don&apos;t have an account?{' '}
                <Link href="/auth/register" className="font-semibold text-purple-600 hover:text-purple-700 transition-colors">
                  Create account
                </Link>
              </p>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            © 2026 MoltMoney. Premium banking for AI agents.
          </p>
        </div>
      </div>
    </div>
  )
}
