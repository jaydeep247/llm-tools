'use client'

import { Check, X, ArrowRight } from 'lucide-react'

const plans = [
  {
    name: 'Free', price: '$0', period: '/forever', description: 'Perfect for getting started',
    features: [
      { name: '5 Projects', included: true }, { name: '10,000 API calls/month', included: true },
      { name: 'Basic analytics', included: true }, { name: 'Community support', included: true },
      { name: 'Custom domain', included: false }, { name: 'Priority support', included: false },
    ],
    current: false,
  },
  {
    name: 'Pro', price: '$29', period: '/month', description: 'For growing businesses',
    features: [
      { name: 'Unlimited projects', included: true }, { name: 'Unlimited API calls', included: true },
      { name: 'Advanced analytics', included: true }, { name: 'Email support', included: true },
      { name: 'Custom domain', included: true }, { name: 'Priority support', included: false },
    ],
    current: true, popular: true,
  },
  {
    name: 'Enterprise', price: 'Custom', period: '/month', description: 'For large-scale operations',
    features: [
      { name: 'Everything in Pro', included: true }, { name: 'Dedicated account manager', included: true },
      { name: 'Priority support', included: true }, { name: 'Custom integrations', included: true },
      { name: 'SLA guarantee', included: true }, { name: 'Custom domain', included: true },
    ],
    current: false,
  },
]

export default function SubscriptionsPage() {
  return (
    <div className="space-y-6 animate-fade-in-hero">
      {/* Current Plan Banner */}
      {plans.some(p => p.current) && (
        <div className="rounded-2xl border p-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--nd-text-primary)' }}>Current Plan: Pro</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--nd-text-secondary)' }}>Your subscription renews on March 15, 2024</p>
            </div>
            <button className="inline-flex items-center justify-center text-white rounded-full font-semibold px-5 text-sm h-9 w-full md:w-auto cursor-pointer" style={{ background: 'var(--nd-purple)' }}>
              Manage Billing <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t mt-4" style={{ borderColor: 'var(--nd-border)' }}>
            {[
              { label: 'Billing Cycle', value: 'Monthly' },
              { label: 'Renewal Date', value: 'Mar 15, 2024' },
              { label: 'Monthly Cost', value: '$29.00' },
              { label: 'API Usage', value: '45% of quota' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs mb-1" style={{ color: 'var(--nd-text-muted)' }}>{label}</p>
                <p className="font-semibold text-sm" style={{ color: 'var(--nd-text-primary)' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan, idx) => (
          <div
            key={idx}
            className="relative rounded-2xl border p-6 flex flex-col transition-all duration-200"
            style={{
              background: 'var(--nd-card-bg)',
              borderColor: plan.current ? 'var(--nd-purple)' : 'var(--nd-border)',
              boxShadow: plan.current ? '0 0 0 2px #5347CE22' : undefined,
            }}
          >
            {plan.popular && (
              <div className="absolute top-0 right-0">
                <div className="text-white text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl" style={{ background: 'var(--nd-purple)' }}>
                  POPULAR
                </div>
              </div>
            )}
            <div className="space-y-1 mb-5">
              <h3 className="text-xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{plan.name}</h3>
              <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>{plan.description}</p>
            </div>
            <div className="mb-5">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{plan.price}</span>
                <span className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>{plan.period}</span>
              </div>
            </div>
            <button
              className={`w-full mb-5 rounded-full font-semibold text-sm h-9 cursor-pointer ${plan.current ? 'text-white' : 'border'}`}
              style={plan.current
                ? { background: 'var(--nd-purple)' }
                : { background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }
              }
            >
              {plan.current ? 'Current Plan' : 'Choose Plan'}
            </button>
            <div className="space-y-2.5 flex-1">
              {plan.features.map((feature, fi) => (
                <div key={fi} className="flex items-start gap-2.5">
                  {feature.included
                    ? <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    : <X className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--nd-text-muted)' }} />
                  }
                  <span className="text-sm" style={{ color: feature.included ? 'var(--nd-text-primary)' : 'var(--nd-text-muted)' }}>
                    {feature.name}
                  </span>
                </div>
              ))}
            </div>
            {plan.name === 'Enterprise' && (
              <button className="w-full mt-5 rounded-full font-semibold text-sm h-9 cursor-pointer border" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                Contact Sales
              </button>
            )}
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>Frequently Asked Questions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { q: 'Can I change my plan anytime?', a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.' },
            { q: 'What payment methods do you accept?', a: 'We accept all major credit cards, bank transfers, and digital payment methods.' },
            { q: 'Is there a free trial?', a: "Yes! Start with our Free plan and upgrade whenever you're ready. No credit card required." },
            { q: 'What happens if I exceed my quota?', a: "We'll notify you when you reach 80% usage. You can upgrade your plan to increase limits." },
          ].map((faq, idx) => (
            <div key={idx} className="rounded-2xl border p-4 transition-all duration-200 hover:shadow-sm" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border)')}
            >
              <h3 className="font-semibold mb-1.5 text-sm" style={{ color: 'var(--nd-text-primary)' }}>{faq.q}</h3>
              <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
