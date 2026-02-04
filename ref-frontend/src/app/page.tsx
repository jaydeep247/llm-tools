import { GlassmorphismNav } from "@/components/layout/glassmorphism-nav"
import { HeroSection } from "@/components/sections/hero-section"
import { ProblemSolutionSection } from "@/components/sections/problem-solution-section"
import Aurora from "@/components/animations/Aurora"
import { FeaturesSection } from "@/components/sections/features-section"
import { AITeamSection } from "@/components/sections/ai-team-section"
import { TestimonialsSection } from "@/components/sections/testimonials-section"
import { ROICalculatorSection } from "@/components/sections/roi-calculator-section"
import { CTASection } from "@/components/sections/cta-section"
import { Footer } from "@/components/layout/footer"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-black overflow-hidden">
      <main className="min-h-screen relative overflow-hidden">
        <div className="fixed inset-0 w-full h-full">
          <Aurora colorStops={["#475569", "#64748b", "#475569"]} amplitude={1.2} blend={0.6} speed={0.8} />
        </div>
        <div className="relative z-10">
          <GlassmorphismNav />
          <HeroSection />
          <ProblemSolutionSection />
          <FeaturesSection />
          <AITeamSection />
          <TestimonialsSection />
          <ROICalculatorSection />
          <CTASection />
          <Footer />
        </div>
      </main>
    </div>
  )
}
