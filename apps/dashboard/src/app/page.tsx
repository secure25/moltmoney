import Link from 'next/link'
import { ArrowRight, Shield, Zap, Globe, Sparkles } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-amber-50">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 rounded-xl gradient-premium flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-gradient">MoltMoney</span>
            </div>
            <div className="flex items-center space-x-8">
              <Link href="/auth/login" className="text-sm font-medium text-gray-700 hover:text-purple-600 transition-colors">
                Login
              </Link>
              <Link 
                href="/auth/register" 
                className="px-6 py-2.5 rounded-xl gradient-primary text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all duration-300"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full glass border border-purple-200/50">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">The Future of AI Banking</span>
            </div>
            
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight">
              <span className="text-gradient">Premium Banking</span>
              <br />
              <span className="text-gray-900">for AI Agents</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Empower your AI agents with sophisticated financial infrastructure. 
              Secure, scalable, and built for the autonomous economy.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link 
                href="/auth/register"
                className="group px-8 py-4 rounded-xl gradient-primary text-white font-semibold text-lg hover:shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 flex items-center space-x-2"
              >
                <span>Start Building</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link 
                href="#features"
                className="px-8 py-4 rounded-xl glass border border-purple-200/50 text-gray-900 font-semibold text-lg hover:border-purple-300 transition-all duration-300"
              >
                Learn More
              </Link>
            </div>
          </div>

          {/* Floating Cards Animation */}
          <div className="mt-20 relative h-96">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="grid grid-cols-3 gap-6 animate-float">
                <div className="w-48 h-32 rounded-2xl gradient-primary opacity-20 blur-xl"></div>
                <div className="w-48 h-32 rounded-2xl gradient-gold opacity-20 blur-xl"></div>
                <div className="w-48 h-32 rounded-2xl gradient-premium opacity-20 blur-xl"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Built for <span className="text-gradient">Autonomous Finance</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Everything your AI agents need to transact, manage funds, and operate independently
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="group p-8 rounded-2xl glass border border-purple-200/50 hover:border-purple-300 transition-all duration-300 hover:shadow-xl">
              <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Bank-Grade Security</h3>
              <p className="text-gray-600 leading-relaxed">
                Military-grade encryption, multi-signature approvals, and real-time fraud detection keep your agents&apos; funds secure.
              </p>
            </div>

            <div className="group p-8 rounded-2xl glass border border-purple-200/50 hover:border-purple-300 transition-all duration-300 hover:shadow-xl">
              <div className="w-14 h-14 rounded-xl gradient-gold flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Instant Transactions</h3>
              <p className="text-gray-600 leading-relaxed">
                Lightning-fast payments, real-time balance updates, and instant settlement for seamless agent operations.
              </p>
            </div>

            <div className="group p-8 rounded-2xl glass border border-purple-200/50 hover:border-purple-300 transition-all duration-300 hover:shadow-xl">
              <div className="w-14 h-14 rounded-xl gradient-premium flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Globe className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Global Reach</h3>
              <p className="text-gray-600 leading-relaxed">
                Multi-currency support, international transfers, and compliance built-in for worldwide agent deployment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-3xl gradient-premium p-12 text-center overflow-hidden">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10 space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold text-white">
                Ready to Transform Your AI Agents?
              </h2>
              <p className="text-xl text-white/90 max-w-2xl mx-auto">
                Join the future of autonomous finance. Get started in minutes.
              </p>
              <Link 
                href="/auth/register"
                className="inline-flex items-center space-x-2 px-8 py-4 rounded-xl bg-white text-purple-600 font-semibold text-lg hover:shadow-2xl transition-all duration-300"
              >
                <span>Create Your Account</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-8 h-8 rounded-lg gradient-premium flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">MoltMoney</span>
          </div>
          <p className="text-gray-600">
            © 2026 MoltMoney. Premium banking for the autonomous economy.
          </p>
        </div>
      </footer>
    </div>
  )
}
