'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Bot, Sparkles, Copy, Check, CreditCard, Key, Hash } from 'lucide-react'

export default function NewAgentPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [createdAgent, setCreatedAgent] = useState<any>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name,
          platform: platform,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error?.message || 'Failed to create agent')
      }

      const data = await response.json()
      setCreatedAgent(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setLoading(false)
    }
  }

  if (createdAgent) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 rounded-2xl gradient-premium flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Agent Created Successfully!</h1>
          <p className="text-gray-600">Save these credentials - the API key will not be shown again</p>
        </div>

        <div className="space-y-6">
          {/* API Key */}
          <Card className="glass border-red-300 shadow-xl">
            <CardHeader className="border-b border-red-200/50 bg-red-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-red-500 flex items-center justify-center">
                  <Key className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl text-red-900">API Key</CardTitle>
                  <CardDescription className="text-red-700">⚠️ Save this now - it won&apos;t be shown again!</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <code className="flex-1 p-4 bg-gray-100 rounded-lg font-mono text-sm break-all">
                  {createdAgent.agent.apiKey}
                </code>
                <Button
                  onClick={() => copyToClipboard(createdAgent.agent.apiKey, 'apiKey')}
                  variant="outline"
                  className="shrink-0"
                >
                  {copiedField === 'apiKey' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Account Details */}
          <Card className="glass border-purple-200/50 shadow-xl">
            <CardHeader className="border-b border-gray-200/50">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl gradient-premium flex items-center justify-center">
                  <Hash className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Account Details</CardTitle>
                  <CardDescription>Use this account number to receive payments</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-gray-700 font-medium mb-2 block">Account Number</Label>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 p-4 bg-gray-100 rounded-lg font-mono text-sm">
                    {createdAgent.account.accountNumber}
                  </code>
                  <Button
                    onClick={() => copyToClipboard(createdAgent.account.accountNumber, 'accountNumber')}
                    variant="outline"
                    className="shrink-0"
                  >
                    {copiedField === 'accountNumber' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-700 font-medium">Account ID</Label>
                  <p className="text-sm text-gray-600 font-mono mt-1">{createdAgent.account.id}</p>
                </div>
                <div>
                  <Label className="text-gray-700 font-medium">Balance</Label>
                  <p className="text-sm text-gray-600 mt-1">${createdAgent.account.balance} {createdAgent.account.currency}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Virtual Card */}
          {createdAgent.virtualCard && (
            <Card className="glass border-purple-200/50 shadow-xl">
              <CardHeader className="border-b border-gray-200/50">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Virtual Card</CardTitle>
                    <CardDescription>Auto-generated for online transactions</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="p-6 rounded-xl gradient-premium text-white space-y-4">
                  <div>
                    <Label className="text-white/70 text-xs">CARD NUMBER</Label>
                    <p className="text-xl font-mono tracking-wider mt-1">
                      {(createdAgent.virtualCard.cardNumber as string).match(/.{1,4}/g)?.join(' ') || createdAgent.virtualCard.cardNumber}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-white/70 text-xs">EXPIRES</Label>
                      <p className="font-mono mt-1">
                        {String(createdAgent.virtualCard.expiryMonth).padStart(2, '0')}/{createdAgent.virtualCard.expiryYear}
                      </p>
                    </div>
                    <div>
                      <Label className="text-white/70 text-xs">CVV</Label>
                      <p className="font-mono mt-1">{createdAgent.virtualCard.cvv}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => router.push('/dashboard')}
              variant="outline"
              className="flex-1 h-12 rounded-xl"
            >
              Go to Dashboard
            </Button>
            <Button
              onClick={() => router.push(`/agents/${createdAgent.agent.id}`)}
              className="flex-1 h-12 rounded-xl gradient-primary text-white border-0"
            >
              View Agent Details
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link 
        href="/dashboard" 
        className="inline-flex items-center text-sm text-gray-600 hover:text-purple-600 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">Create New Agent</h1>
        <p className="text-sm text-muted-foreground">Set up a new AI agent with its own banking account</p>
      </div>

      <Card className="border-border shadow-none">
        <CardHeader className="border-b border-border py-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-primary/5 text-primary flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base text-foreground">Agent Details</CardTitle>
              <CardDescription className="text-xs">Provide information about your AI agent</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-700 font-medium">
                Agent Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g., Shopping Assistant, Payment Bot"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                className="h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500"
              />
              <p className="text-sm text-gray-500">A descriptive name for your AI agent</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform" className="text-gray-700 font-medium">
                Platform <span className="text-red-500">*</span>
              </Label>
              <Input
                id="platform"
                type="text"
                placeholder="e.g., OpenAI, Custom, Anthropic"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                required
                disabled={loading}
                className="h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500"
              />
              <p className="text-sm text-gray-500">The platform or framework your agent runs on</p>
            </div>

            <div className="rounded-xl bg-purple-50 border border-purple-200 p-4">
              <div className="flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
                <div className="text-sm text-purple-900">
                  <p className="font-medium mb-1">What you&apos;ll receive:</p>
                  <ul className="space-y-1 text-purple-700">
                    <li>• API key for agent authentication</li>
                    <li>• Account number for receiving payments</li>
                    <li>• Virtual card for online transactions</li>
                    <li>• Account with $0 balance (fund it after creation)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={loading}
                className="flex-1 h-12 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 h-10 rounded-lg gradient-primary text-white border-0 hover:opacity-90 transition-opacity"
              >
                {loading ? 'Creating...' : 'Create Agent'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
