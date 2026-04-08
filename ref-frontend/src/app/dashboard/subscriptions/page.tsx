'use client'

import { Button } from '@/components/ui/button'
import { Check, X, ArrowRight } from 'lucide-react'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/forever',
    description: 'Perfect for getting started',
    features: [
      { name: '5 Projects', included: true },
      { name: '10,000 API calls/month', included: true },
      { name: 'Basic analytics', included: true },
      { name: 'Community support', included: true },
      { name: 'Custom domain', included: false },
      { name: 'Priority support', included: false },
    ],
    current: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For growing businesses',
    features: [
      { name: 'Unlimited projects', included: true },
      { name: 'Unlimited API calls', included: true },
      { name: 'Advanced analytics', included: true },
      { name: 'Email support', included: true },
      { name: 'Custom domain', included: true },
      { name: 'Priority support', included: false },
    ],
    current: true,
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '/month',
    description: 'For large-scale operations',
    features: [
      { name: 'Everything in Pro', included: true },
      { name: 'Dedicated account manager', included: true },
      { name: 'Priority support', included: true },
      { name: 'Custom integrations', included: true },
      { name: 'SLA guarantee', included: true },
      { name: 'Custom domain', included: true },
    ],
    current: false,
  },
]

export default function SubscriptionsPage() {
  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
      {/* Current Plan Banner */}
      {plans.some(p => p.current) && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">Current Plan: Pro</h2>
                <p className="text-muted-foreground mt-1 text-sm">Your subscription renews on March 15, 2024</p>
              </div>
              <Button className="bg-primary text-primary-foreground hover:opacity-90 rounded-full font-semibold px-6 text-sm h-10 w-full md:w-auto cursor-pointer">
                Manage Billing <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Plan Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Billing Cycle</p>
                <p className="font-semibold text-foreground text-sm">Monthly</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Renewal Date</p>
                <p className="font-semibold text-foreground text-sm">Mar 15, 2024</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Monthly Cost</p>
                <p className="font-semibold text-foreground text-sm">$29.00</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">API Usage</p>
                <p className="font-semibold text-foreground text-sm">45% of quota</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {plans.map((plan, idx) => (
          <div
            key={idx}
            className={`relative rounded-2xl border p-6 transition-all duration-300 flex flex-col ${
              plan.current
                ? 'border-primary/50 bg-card md:scale-105 md:z-10 md:shadow-xl'
                : 'border-border bg-card hover:border-primary/20 hover:shadow-md'
            }`}
          >
            {plan.popular && (
              <div className="absolute top-0 right-0">
                <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl">
                  POPULAR
                </div>
              </div>
            )}

            <div className="space-y-2 mb-6">
              <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
              <p className="text-muted-foreground text-sm">{plan.description}</p>
            </div>

            {/* Pricing */}
            <div className="space-y-1 mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground text-base">{plan.period}</span>
              </div>
            </div>

            {/* CTA Button */}
            <Button
              className={`w-full mb-6 rounded-full font-semibold text-sm h-10 cursor-pointer ${
                plan.current
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-secondary text-foreground hover:bg-accent border border-border'
              }`}
            >
              {plan.current ? 'Current Plan' : 'Choose Plan'}
            </Button>

            {/* Features List */}
            <div className="space-y-3 flex-1">
              {plan.features.map((feature, featureIdx) => (
                <div key={featureIdx} className="flex items-start gap-3">
                  {feature.included ? (
                    <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  ) : (
                    <X className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <span className={`text-sm ${
                    feature.included ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {feature.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Contact for Enterprise */}
            {plan.name === 'Enterprise' && (
              <Button className="w-full mt-6 border border-border bg-secondary text-foreground hover:bg-accent rounded-full font-semibold text-sm h-10 cursor-pointer">
                Contact Sales
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* FAQ Section */}
      <div className="space-y-4">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">Frequently Asked Questions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {[
            {
              q: 'Can I change my plan anytime?',
              a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.',
            },
            {
              q: 'What payment methods do you accept?',
              a: 'We accept all major credit cards, bank transfers, and digital payment methods.',
            },
            {
              q: 'Is there a free trial?',
              a: 'Yes! Start with our Free plan and upgrade whenever you\'re ready. No credit card required.',
            },
            {
              q: 'What happens if I exceed my quota?',
              a: 'We\'ll notify you when you reach 80% usage. You can upgrade your plan to increase limits.',
            },
          ].map((faq, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-border bg-card p-4 hover:border-primary/20 hover:shadow-sm transition-all duration-300"
            >
              <h3 className="font-semibold mb-2 text-foreground text-base">{faq.q}</h3>
              <p className="text-sm text-muted-foreground">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
