"use client"

import { useState, useEffect, useRef } from "react"
import { MessageCircle, Clock, Zap } from "lucide-react"

const conversations = [
  {
    title: "Comprehensive Site Crawl & SEO Analysis",
    messages: [
      { text: "Can you crawl my e-commerce site with 500+ pages?", sender: "customer", delay: 0 },
      {
        text: "Absolutely! Contentlytics supports unlimited depth crawling. Just enter your domain and we'll discover every page automatically.",
        sender: "ai",
        delay: 1000,
      },
      {
        text: "How long does it take to crawl that many pages?",
        sender: "customer",
        delay: 2500,
      },
      {
        text: "With 150 concurrent requests, we can crawl 500 pages in just a few minutes. You'll get real-time progress updates.",
        sender: "ai",
        delay: 3500,
      },
      { text: "Perfect! What SEO metrics will I get?", sender: "customer", delay: 5000 },
      {
        text: "You'll get title tags, meta descriptions, heading structure, image analysis, internal/external links, broken links, duplicate content, and structured data validation.",
        sender: "ai",
        delay: 6000,
      },
      { text: "That's comprehensive! Can I export the data?", sender: "customer", delay: 7500 },
      {
        text: "Yes! Export to CSV or JSON. Plus you get visual dashboards with AG-Grid for filtering and sorting your SEO data.",
        sender: "ai",
        delay: 8500,
      },
    ],
  },
  {
    title: "AEO & Schema Generation",
    messages: [
      { text: "What's AEO and why do I need it?", sender: "customer", delay: 0 },
      {
        text: "AEO (Answer Engine Optimization) ensures AI bots like ChatGPT, Claude, and Gemini can access your content. We analyze AI bot permissions in your robots.txt.",
        sender: "ai",
        delay: 1000,
      },
      {
        text: "Can you generate Schema.org markup for my pages?",
        sender: "customer",
        delay: 2500,
      },
      {
        text: "Yes! Our AI extracts real data and generates Schema for 10+ types: Organization, LocalBusiness, Article, Product, FAQ, and more—no placeholders!",
        sender: "ai",
        delay: 4000,
      },
      { text: "How accurate is the Schema generation?", sender: "customer", delay: 5500 },
      {
        text: "We use GPT-4o-mini to extract actual data from your pages. You get copy-paste ready JSON-LD markup with real addresses, contact info, and social links.",
        sender: "ai",
        delay: 6500,
      },
    ],
  },
  {
    title: "Performance Audits & Backlinks",
    messages: [
      {
        text: "Can you analyze my site's performance?",
        sender: "customer",
        delay: 0,
      },
      {
        text: "Yes! We integrate with Google PageSpeed Insights to measure Core Web Vitals: LCP, FID, and CLS for both mobile and desktop.",
        sender: "ai",
        delay: 1000,
      },
      { text: "What about competitor analysis?", sender: "customer", delay: 2500 },
      {
        text: "Our backlink analysis (via DataForSEO) shows domain authority, dofollow/nofollow ratios, quality scores, and geographic distribution of your backlinks.",
        sender: "ai",
        delay: 3500,
      },
      {
        text: "Can I track my progress over time?",
        sender: "customer",
        delay: 5000,
      },
      {
        text: "Absolutely! Every crawl session is saved in your history. Compare metrics across different dates to track SEO improvements and regressions.",
        sender: "ai",
        delay: 6000,
      },
    ],
  },
]

export function AITeamSection() {
  const sectionRef = useRef<HTMLElement>(null) // Added section ref for intersection observer
  const [isVisible, setIsVisible] = useState(false)
  const [currentConversation, setCurrentConversation] = useState(0)
  const [displayedMessages, setDisplayedMessages] = useState<any[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          console.log("[v0] AI Team Section is now visible")
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

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [displayedMessages, isTyping])

  useEffect(() => {
    const conversation = conversations[currentConversation]
    setDisplayedMessages([])
    setIsTyping(false)

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    let messageIndex = 0

    const showNextMessage = () => {
      if (messageIndex >= conversation.messages.length) {
        // Wait 3 seconds then move to next conversation
        timeoutRef.current = setTimeout(() => {
          setCurrentConversation((prev) => (prev + 1) % conversations.length)
        }, 3000)
        return
      }

      const message = conversation.messages[messageIndex]

      timeoutRef.current = setTimeout(() => {
        if (message.sender === "ai") {
          setIsTyping(true)
          timeoutRef.current = setTimeout(() => {
            setDisplayedMessages((prev) => [...prev, message])
            setIsTyping(false)
            messageIndex++
            showNextMessage()
          }, 800) // Reduced typing delay from 1500ms to 800ms for faster replies
        } else {
          setDisplayedMessages((prev) => [...prev, message])
          messageIndex++
          showNextMessage()
        }
      }, message.delay)
    }

    showNextMessage()

    // Cleanup timeout on unmount or conversation change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [currentConversation])

  return (
    <section id="ai-team" ref={sectionRef} className="relative z-10">
      <div className="bg-white rounded-b-[3rem] pt-16 sm:pt-24 pb-16 sm:pb-24 px-4 relative overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <div
              className={`inline-flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2 rounded-full text-sm font-medium mb-6 transition-all duration-1000 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              SEO Intelligence Platform Demo
            </div>

            <h2
              className={`text-4xl md:text-5xl font-bold text-slate-900 mb-4 transition-all duration-1000 delay-200 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              See How{" "}
              <span className="bg-linear-to-r from-slate-600 to-slate-400 bg-clip-text text-transparent">
                Contentlytics Works
              </span>
            </h2>

            <p
              className={`text-xl text-slate-600 max-w-2xl mx-auto transition-all duration-1000 delay-400 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              Watch how Contentlytics crawls entire websites, analyzes SEO/AEO metrics, and generates AI-powered insights.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 max-w-7xl mx-auto">
            {/* Left side - Text content */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center lg:h-150 space-y-6 lg:space-y-8 order-2 lg:order-1">
              <div
                className={`transition-all duration-1000 delay-600 ${
                  isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
                }`}
              >
                <h3 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-4 lg:mb-6">
                  This is how Contentlytics works
                </h3>

                <div className="space-y-3 lg:space-y-4 text-base lg:text-lg text-slate-700 leading-relaxed">
                  <p>
                    Contentlytics automatically discovers every page on your website through sitemap parsing and intelligent crawling.
                  </p>

                  <p>
                    Every conversation shows real features: SEO analysis, AEO optimization, Schema generation, performance audits, and backlink analysis.
                  </p>

                  <p className="text-lg lg:text-xl font-semibold text-slate-900">
                    Stop manual SEO audits. Automate everything.
                  </p>
                </div>
              </div>

              <div
                className={`transition-all duration-1000 delay-800 ${
                  isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
                }`}
              >
                <div className="p-4 lg:p-6 bg-slate-50 rounded-xl border-l-4 border-slate-900">
                  <p className="text-slate-800 font-medium text-sm lg:text-base">
                    "Contentlytics saved us 40+ hours per month on manual SEO audits. The AI-powered Schema generation is a game-changer for our content team."
                  </p>
                  <p className="text-xs lg:text-sm text-slate-600 mt-2">— Sarah Chen, SEO Director</p>
                </div>
              </div>
            </div>

            {/* Right side - Phone mockup */}
            <div className="w-full lg:w-1/2 flex justify-center order-1 lg:order-2">
              <div className="max-w-md w-full">
                <div
                  className={`relative transition-all duration-1000 delay-600 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                >
                  <div className="bg-slate-900 rounded-[2.5rem] p-2 shadow-2xl">
                    <div className="bg-black rounded-4xl p-1">
                      <div className="bg-white rounded-3xl overflow-hidden">
                        {/* Status bar */}
                        <div className="bg-slate-50 px-6 py-3 flex justify-between items-center text-sm">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                            <span className="font-medium text-slate-700">Car Dealership AI</span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-500">
                            <Clock className="w-3 h-3" />
                            <span className="text-xs">24/7</span>
                          </div>
                        </div>

                        <div className="bg-slate-900 px-6 py-4 text-white">
                          <div className="flex items-center gap-3">
                            <img
                              src="/images/michael-ai-agent.jpg"
                              alt="Contentlytics Assistant"
                              className="w-8 h-8 rounded-full object-cover mr-2 mt-1 shrink-0"
                            />
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm">Contentlytics Assistant</h3>
                              <p className="text-xs text-slate-300">SEO & AEO Platform</p>
                            </div>
                            <div className="text-xs text-green-400 flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                              Online
                            </div>
                          </div>
                        </div>

                        {/* Chat messages */}
                        <div
                          ref={chatContainerRef}
                          className="h-96 overflow-y-scroll scrollbar-hide p-4 space-y-3 bg-slate-50"
                          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                        >
                          {displayedMessages.map((message, index) => (
                            <div
                              key={index}
                              className={`flex ${message.sender === "customer" ? "justify-end" : "justify-start"}`}
                            >
                              {message.sender === "ai" && (
                                <img
                                  src="/images/michael-ai-agent.jpg"
                                  alt="Michael"
                                  className="w-6 h-6 rounded-full object-cover mr-2 mt-1 shrink-0"
                                />
                              )}
                              <div
                                className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${
                                  message.sender === "customer"
                                    ? "bg-slate-900 text-white rounded-br-md"
                                    : "bg-white text-slate-800 shadow-sm border border-slate-200 rounded-bl-md"
                                }`}
                              >
                                {message.text.split("\n").map((line, i) => (
                                  <div key={i}>{line}</div>
                                ))}
                              </div>
                              {message.sender === "customer" && (
                                <div className="w-6 h-6 rounded-full bg-slate-400 ml-2 mt-1 shrink-0 flex items-center justify-center text-xs text-white font-medium">
                                  C
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Typing indicator */}
                          {isTyping && (
                            <div className="flex justify-start items-start">
                              <img
                                src="/images/michael-ai-agent.jpg"
                                alt="Michael"
                                className="w-6 h-6 rounded-full object-cover mr-2 mt-1 shrink-0"
                              />
                              <div className="bg-white p-3 rounded-2xl rounded-bl-md shadow-sm border border-slate-200">
                                <div className="flex space-x-1">
                                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                  <div
                                    className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                                    style={{ animationDelay: "0.1s" }}
                                  ></div>
                                  <div
                                    className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                                    style={{ animationDelay: "0.2s" }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="p-4 bg-white border-t border-slate-200">
                          <div className="flex items-center gap-3 bg-slate-100 rounded-full px-4 py-2">
                            <span className="text-slate-500 text-sm lg:text-base flex-1">Michael is responding...</span>
                            <div className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center">
                              <Zap className="w-3 h-3 text-white" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
