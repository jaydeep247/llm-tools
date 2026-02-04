"use client"

import { useEffect, useRef, useState } from "react"

const AnimatedChatDemo = ({ isActive }: { isActive: boolean }) => {
  const [messages, setMessages] = useState([
    { text: "Crawling example.com...", isBot: true, visible: false },
    { text: "✓ 247 pages discovered", isBot: false, visible: false },
    { text: "✓ SEO analysis complete", isBot: true, visible: false },
  ])
  const [typingDots, setTypingDots] = useState(0)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [cycleCount, setCycleCount] = useState(0)

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timeInterval)
  }, [])

  useEffect(() => {
    if (!isActive) return

    const scenarios = [
      [
        { text: "Crawling example.com...", isBot: true },
        { text: "✓ 247 pages discovered", isBot: false },
        { text: "✓ SEO analysis complete", isBot: true },
      ],
      [
        { text: "Analyzing site structure...", isBot: true },
        { text: "✓ Links extracted", isBot: false },
        { text: "✓ Schema generated", isBot: true },
      ],
      [
        { text: "Checking AEO metrics...", isBot: true },
        { text: "✓ AI bot access verified", isBot: false },
        { text: "✓ Performance scored", isBot: true },
      ],
    ]

    const currentScenario = scenarios[cycleCount % scenarios.length]
    setMessages(currentScenario.map((msg) => ({ ...msg, visible: false })))

    const timer = setTimeout(() => {
      setMessages((prev) => prev.map((msg, i) => ({ ...msg, visible: i === 0 })))

      setTimeout(() => {
        setMessages((prev) => prev.map((msg, i) => ({ ...msg, visible: i <= 1 })))

        setTimeout(() => {
          const typingInterval = setInterval(() => {
            setTypingDots((prev) => (prev + 1) % 4)
          }, 500)

          setTimeout(() => {
            clearInterval(typingInterval)
            setMessages((prev) => prev.map((msg) => ({ ...msg, visible: true })))

            setTimeout(() => {
              setCycleCount((prev) => prev + 1)
            }, 3000)
          }, 2000)
        }, 1000)
      }, 1500)
    }, 500)

    return () => clearTimeout(timer)
  }, [isActive, cycleCount])

  return (
    <div className="bg-slate-50 rounded-lg p-4 h-32 overflow-hidden relative">
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        <span className="text-xs text-slate-500 font-medium">Crawling</span>
      </div>
      <div className="space-y-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.isBot ? "justify-start" : "justify-end"} transition-all duration-500 ${
              msg.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <div
              className={`max-w-[80%] px-3 py-1.5 rounded-full text-xs ${
                msg.isBot ? "bg-slate-200 text-slate-700" : "bg-blue-500 text-white"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {typingDots > 0 && (
          <div className="flex justify-start">
            <div className="bg-slate-200 px-3 py-1.5 rounded-full">
              <div className="flex space-x-1">
                {[1, 2, 3].map((dot) => (
                  <div
                    key={dot}
                    className={`w-1 h-1 bg-slate-500 rounded-full transition-opacity duration-300 ${
                      typingDots >= dot ? "opacity-100" : "opacity-30"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const AnimatedPhoneDemo = ({ isActive }: { isActive: boolean }) => {
  const [seoMetrics, setSeoMetrics] = useState([
    { label: "Title Tags", score: 0 },
    { label: "Meta Desc", score: 0 },
    { label: "Headings", score: 0 },
  ])

  useEffect(() => {
    if (!isActive) return

    seoMetrics.forEach((_, index) => {
      setTimeout(() => {
        const targetScore = [95, 88, 92][index]
        const interval = setInterval(() => {
          setSeoMetrics((prev) =>
            prev.map((metric, i) => {
              if (i === index && metric.score < targetScore) {
                return { ...metric, score: Math.min(metric.score + 3, targetScore) }
              }
              return metric
            }),
          )
        }, 30)

        setTimeout(() => clearInterval(interval), 1000)
      }, index * 400)
    })
  }, [isActive])

  return (
    <div className="bg-slate-50 rounded-lg p-4 h-32 flex flex-col justify-center">
      <div className="space-y-2">
        {seoMetrics.map((metric, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-slate-700 w-20">{metric.label}</span>
            <div className="flex-1 bg-slate-200 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-300 bg-green-500"
                style={{ width: `${metric.score}%` }}
              />
            </div>
            <span className="text-xs font-medium w-8">{metric.score}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const AnimatedCalendarDemo = ({ isActive }: { isActive: boolean }) => {
  const [aeoScore, setAeoScore] = useState(0)
  const [botAccess, setBotAccess] = useState([
    { name: "GPTBot", allowed: false },
    { name: "Claude", allowed: false },
    { name: "Google", allowed: false },
  ])

  useEffect(() => {
    if (!isActive) return

    // Animate AEO score
    const scoreInterval = setInterval(() => {
      setAeoScore((prev) => {
        if (prev < 87) return prev + 2
        return prev
      })
    }, 40)

    // Animate bot access checks
    botAccess.forEach((_, index) => {
      setTimeout(() => {
        setBotAccess((prev) => prev.map((bot, i) => (i === index ? { ...bot, allowed: true } : bot)))
      }, 500 + index * 400)
    })

    return () => clearInterval(scoreInterval)
  }, [isActive])

  return (
    <div className="bg-slate-50 rounded-lg p-4 h-32 flex flex-col justify-center">
      <div className="text-center mb-3">
        <div className="text-3xl font-bold text-slate-700">{aeoScore}%</div>
        <div className="text-xs text-slate-500">AEO Score</div>
      </div>
      <div className="space-y-1">
        {botAccess.map((bot, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-slate-600">{bot.name}</span>
            {bot.allowed && <span className="text-green-600">✓ Allowed</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

const AnimatedEmailDemo = ({ isActive }: { isActive: boolean }) => {
  const [schemas, setSchemas] = useState([
    { type: "Organization", status: "pending" },
    { type: "Article", status: "pending" },
    { type: "Product", status: "pending" },
  ])

  useEffect(() => {
    if (!isActive) return

    schemas.forEach((_, index) => {
      setTimeout(
        () => {
          setSchemas((prev) => prev.map((schema, i) => (i === index ? { ...schema, status: "generated" } : schema)))
        },
        1000 + index * 800,
      )
    })
  }, [isActive])

  return (
    <div className="bg-slate-50 rounded-lg p-4 h-32 overflow-hidden">
      <div className="text-xs text-slate-600 mb-2 font-medium">Schema.org Generation</div>
      <div className="space-y-2">
        {schemas.map((schema, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 p-2 rounded transition-all duration-500 ${
              schema.status === "generated" ? "bg-green-100" : "bg-white"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${schema.status === "generated" ? "bg-green-500" : "bg-slate-300 animate-pulse"}`}
            />
            <span className="text-xs text-slate-700 flex-1">{schema.type}</span>
            {schema.status === "generated" && (
              <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const AnimatedLeadsDemo = ({ isActive }: { isActive: boolean }) => {
  const [performance, setPerformance] = useState([
    { metric: "LCP", score: 0, target: 92 },
    { metric: "FID", score: 0, target: 88 },
    { metric: "CLS", score: 0, target: 95 },
  ])

  useEffect(() => {
    if (!isActive) return

    performance.forEach((_, index) => {
      setTimeout(() => {
        const interval = setInterval(() => {
          setPerformance((prev) =>
            prev.map((perf, i) => {
              if (i === index && perf.score < perf.target) {
                return { ...perf, score: Math.min(perf.score + 4, perf.target) }
              }
              return perf
            }),
          )
        }, 40)

        setTimeout(() => clearInterval(interval), 1000)
      }, index * 500)
    })
  }, [isActive])

  return (
    <div className="bg-slate-50 rounded-lg p-4 h-32 flex flex-col justify-center overflow-hidden">
      <div className="text-xs text-slate-600 mb-2 font-medium">Core Web Vitals</div>
      <div className="space-y-2">
        {performance.map((perf, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-slate-700 w-10">{perf.metric}</span>
            <div className="flex-1 bg-slate-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  perf.score >= 80 ? "bg-green-500" : "bg-yellow-500"
                }`}
                style={{ width: `${perf.score}%` }}
              />
            </div>
            <span className="text-xs font-medium w-8">{perf.score}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const AnimatedIntegrationsDemo = ({ isActive }: { isActive: boolean }) => {
  const [backlinks, setBacklinks] = useState({
    total: 0,
    dofollow: 0,
    domains: 0,
  })

  useEffect(() => {
    if (!isActive) return

    const intervals = [
      setInterval(() => {
        setBacklinks((prev) => ({ ...prev, total: Math.min(prev.total + 45, 1247) }))
      }, 50),
      setInterval(() => {
        setBacklinks((prev) => ({ ...prev, dofollow: Math.min(prev.dofollow + 32, 892) }))
      }, 50),
      setInterval(() => {
        setBacklinks((prev) => ({ ...prev, domains: Math.min(prev.domains + 3, 87) }))
      }, 50),
    ]

    setTimeout(() => intervals.forEach(clearInterval), 1500)

    return () => intervals.forEach(clearInterval)
  }, [isActive])

  return (
    <div className="bg-slate-50 rounded-lg p-4 h-32 flex flex-col justify-center">
      <div className="text-xs text-slate-600 mb-3 font-medium">Backlink Analysis</div>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="text-xl font-bold text-slate-700">{backlinks.total}</div>
          <div className="text-xs text-slate-500">Total</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-green-600">{backlinks.dofollow}</div>
          <div className="text-xs text-slate-500">Dofollow</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-blue-600">{backlinks.domains}</div>
          <div className="text-xs text-slate-500">Domains</div>
        </div>
      </div>
    </div>
  )
}

const features = [
  {
    title: "Powerful Web Crawling",
    description:
      "Unlimited depth crawling discovers every page on your site. High-speed parallel processing with up to 150 concurrent requests, sitemap seeding, and smart URL filtering.",
    demo: AnimatedChatDemo,
    size: "large",
  },
  {
    title: "Comprehensive SEO Analysis",
    description:
      "Analyze title tags, meta descriptions, heading structure, images, links, canonical tags, and structured data. Identify broken links and duplicate content automatically.",
    demo: AnimatedPhoneDemo,
    size: "medium",
  },
  {
    title: "AEO Optimization",
    description:
      "AI bot access analysis (GPTBot, ClaudeBot, Google-Extended), content answerability scoring, entity recognition, and featured snippet optimization for voice search.",
    demo: AnimatedCalendarDemo,
    size: "medium",
  },
  {
    title: "AI-Powered Schema Generation",
    description:
      "Generate Schema.org markup for 10+ types including Organization, LocalBusiness, Article, Product using GPT-4o-mini. Real data extraction with no placeholders.",
    demo: AnimatedEmailDemo,
    size: "large",
  },
  {
    title: "Performance Audits",
    description:
      "Core Web Vitals (LCP, FID, CLS), Google PageSpeed Insights integration, mobile & desktop performance scoring, and actionable optimization recommendations.",
    demo: AnimatedLeadsDemo,
    size: "medium",
  },
  {
    title: "Competitor Backlink Analysis",
    description:
      "Comprehensive backlink metrics via DataForSEO. Domain authority, page authority, dofollow/nofollow ratio, quality scoring, and geographic distribution analysis.",
    demo: AnimatedIntegrationsDemo,
    size: "medium",
  },
]

export function FeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [activeDemo, setActiveDemo] = useState<number | null>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          console.log("[v0] Features Section is now visible") // Added debug log
          setIsVisible(true)
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -100px 0px",
      },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current)
      }
    }
  }, [])

  return (
    <section id="features" ref={sectionRef} className="relative z-10">
      <div className="bg-white rounded-t-[3rem] pt-16 sm:pt-24 pb-16 sm:pb-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.02]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgb(0,0,0) 1px, transparent 0)`,
              backgroundSize: "24px 24px",
            }}
          ></div>
        </div>

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-slate-200 rounded-full animate-float"
              style={{
                left: `${20 + i * 15}%`,
                top: `${30 + (i % 3) * 20}%`,
                animationDelay: `${i * 0.5}s`,
                animationDuration: `${4 + i * 0.5}s`,
              }}
            ></div>
          ))}
        </div>

        <div className="max-w-7xl mx-auto relative">
          <div
            className={`text-center mb-12 sm:mb-20 transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-sm font-medium mb-6">
              <svg className="w-4 h-4 mr-2 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V7H1V9H3V15H1V17H3V21C3 22.11 3.89 23 5 23H19C20.11 23 21 22.11 21 21V17H23V15H21V9H23ZM19 9V15H5V9H19ZM7.5 11.5C7.5 10.67 8.17 10 9 10S10.5 10.67 10.5 11.5 9.83 13 9 13 7.5 12.33 7.5 11.5ZM13.5 11.5C13.5 10.67 14.17 10 15 10S16.5 10.67 16.5 11.5 15.83 13 15 13 13.5 12.33 13.5 11.5ZM12 16C13.11 16 14.08 16.59 14.71 17.5H9.29C9.92 16.59 10.89 16 12 16Z" />
              </svg>
              Enterprise-Grade Analytics Platform
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 text-balance mb-4 sm:mb-6">
              Comprehensive{" "}
              <span className="bg-linear-to-r from-slate-600 to-slate-400 bg-clip-text text-transparent">
                Website Intelligence
              </span>
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-3xl mx-auto font-light leading-relaxed">
              Discover every page, analyze SEO/AEO metrics, generate AI-powered Schema.org markup, and gain competitive
              intelligence—all automated through powerful web crawling technology.
            </p>
          </div>

          <div
            className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 transition-all duration-1000 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
            }`}
          >
            {features.map((feature, index) => (
              <div
                key={index}
                className={`group transition-all duration-1000 ${feature.size === "large" ? "md:col-span-2" : ""}`}
                style={{
                  transitionDelay: isVisible ? `${300 + index * 100}ms` : "0ms",
                }}
                onMouseEnter={() => setActiveDemo(index)}
                onMouseLeave={() => setActiveDemo(null)}
              >
                <div className="bg-white rounded-2xl p-6 sm:p-8 h-full shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-slate-200 hover:border-slate-300">
                  <div className="mb-6">
                    <feature.demo isActive={activeDemo === index || isVisible} />
                  </div>

                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 group-hover:text-slate-700 transition-colors duration-300">
                    {feature.title}
                  </h3>

                  <p className="text-slate-600 text-sm sm:text-base leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
