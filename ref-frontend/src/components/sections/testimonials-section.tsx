"use client"

import { useEffect, useRef } from "react"
import { TestimonialsColumn } from "@/components/ui/testimonials-column"

export function TestimonialsSection() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const elements = entry.target.querySelectorAll(".fade-in-element")
            elements.forEach((element, index) => {
              setTimeout(() => {
                element.classList.add("animate-fade-in-up")
              }, index * 300)
            })
          }
        })
      },
      { threshold: 0.1 },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const testimonials = [
    {
      text: "Contentlytics saved us 40+ hours per month on manual SEO audits. The AI-powered Schema generation is a game-changer for our content team.",
      name: "Sarah Chen",
      role: "SEO Director",
    },
    {
      text: "The unlimited depth crawling discovered 200+ pages we didn't even know existed. Our site structure is now fully mapped and optimized.",
      name: "Mike Rodriguez",
      role: "Technical SEO Manager",
    },
    {
      text: "AEO analysis helped us optimize for AI bots. We're now appearing in ChatGPT and Claude responses, driving 30% more organic traffic.",
      name: "Jennifer Walsh",
      role: "Content Marketing Lead",
    },
    {
      text: "The performance audits and Core Web Vitals tracking helped us improve our PageSpeed score from 65 to 92. Rankings improved immediately.",
      name: "David Kim",
      role: "Web Performance Engineer",
    },
    {
      text: "Backlink analysis with DataForSEO integration gave us insights we never had before. Domain authority tracking is incredibly valuable.",
      name: "Lisa Thompson",
      role: "Link Building Specialist",
    },
    {
      text: "Real-time crawling with 150 concurrent requests means we can audit large e-commerce sites in minutes instead of days. Efficiency is through the roof.",
      name: "James Wilson",
      role: "E-commerce SEO Consultant",
    },
    {
      text: "The Schema.org generation extracted actual business data—no placeholders. We implemented JSON-LD markup across 500+ pages in one afternoon.",
      name: "Maria Garcia",
      role: "Structured Data Specialist",
    },
    {
      text: "Broken link detection and duplicate content identification saved us from major SEO penalties. Contentlytics is our first line of defense.",
      name: "Robert Martinez",
      role: "SEO Auditor",
    },
  ]

  return (
    <section id="testimonials" ref={sectionRef} className="relative pt-16 pb-16 px-4 sm:px-6 lg:px-8">
      {/* Grid Background */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Header Section - Keep as user loves it */}
        <div className="text-center mb-16 md:mb-32">
          <div className="fade-in-element opacity-0 translate-y-8 transition-all duration-1000 ease-out inline-flex items-center gap-2 text-white/60 text-sm font-medium tracking-wider uppercase mb-6">
            <div className="w-8 h-px bg-white/30"></div>
            Success Stories
            <div className="w-8 h-px bg-white/30"></div>
          </div>
          <h2 className="fade-in-element opacity-0 translate-y-8 transition-all duration-1000 ease-out text-5xl md:text-6xl lg:text-7xl font-light text-white mb-8 tracking-tight text-balance">
            Trusted by <span className="font-medium italic">SEO Professionals</span>
          </h2>
          <p className="fade-in-element opacity-0 translate-y-8 transition-all duration-1000 ease-out text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
            Discover how digital marketers and SEO teams are automating their website analysis with Contentlytics
          </p>
        </div>

        {/* Testimonials Carousel */}
        <div className="fade-in-element opacity-0 translate-y-8 transition-all duration-1000 ease-out relative flex justify-center items-center min-h-150 md:min-h-200 overflow-hidden">
          <div
            className="flex gap-8 max-w-6xl"
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
            }}
          >
            <TestimonialsColumn testimonials={testimonials.slice(0, 3)} duration={15} className="flex-1" />
            <TestimonialsColumn
              testimonials={testimonials.slice(2, 5)}
              duration={12}
              className="flex-1 hidden md:block"
            />
            <TestimonialsColumn
              testimonials={testimonials.slice(1, 4)}
              duration={18}
              className="flex-1 hidden lg:block"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
