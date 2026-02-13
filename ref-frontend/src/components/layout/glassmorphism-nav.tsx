"use client"

import { useState, useEffect, useRef } from "react"
import { Menu, X, ArrowRight, User, LogOut, LayoutDashboard, UserCircle, ChevronDown } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AuthModal } from "../auth/auth-modal"
import { useAuth } from "@/hooks/useAuth"
import { useLogoutMutation } from "@/store/api/authApi"

const navigation = [
  { name: "Features", href: "#features" },
  { name: "Platform Demo", href: "#ai-team" },
  { name: "Testimonials", href: "#testimonials" },
  { name: "ROI Calculator", href: "#roi-calculator" },
]

export function GlassmorphismNav() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false)
  const lastScrollY = useRef(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Use the new auth hook
  const { isAuthenticated, user, refreshAuth } = useAuth()
  const [logout] = useLogoutMutation()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false)
      }
    }

    if (isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isProfileDropdownOpen])

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasLoaded(true)
    }, 100)

    const controlNavbar = () => {
      if (typeof window !== "undefined") {
        const currentScrollY = window.scrollY

        // Only hide/show after scrolling past 50px to avoid flickering at top
        if (currentScrollY > 50) {
          if (currentScrollY > lastScrollY.current && currentScrollY - lastScrollY.current > 5) {
            // Scrolling down - hide navbar
            setIsVisible(false)
          } else if (lastScrollY.current - currentScrollY > 5) {
            // Scrolling up - show navbar
            setIsVisible(true)
          }
        } else {
          // Always show navbar when near top
          setIsVisible(true)
        }

        lastScrollY.current = currentScrollY
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("scroll", controlNavbar, { passive: true })

      return () => {
        window.removeEventListener("scroll", controlNavbar)
        clearTimeout(timer)
      }
    }

    return () => clearTimeout(timer)
  }, []) // Removed lastScrollY dependency to prevent infinite re-renders

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleLogout = async () => {
    try {
      await logout().unwrap()
      await refreshAuth()
      setIsProfileDropdownOpen(false)
      router.push('/')
    } catch (error) {
      console.error('Logout error:', error)
      await refreshAuth()
      router.push('/')
    }
  }

  const handleAuthSuccess = async () => {
    await refreshAuth()
    router.push('/dashboard')
  }

  const scrollToSection = (href: string) => {
    if (href.startsWith("/")) {
      return
    }

    const element = document.querySelector(href)
    if (element) {

      const rect = element.getBoundingClientRect()
      const currentScrollY = window.pageYOffset || document.documentElement.scrollTop
      const elementAbsoluteTop = rect.top + currentScrollY
      const navbarHeight = 100
      const targetPosition = Math.max(0, elementAbsoluteTop - navbarHeight)

      window.scrollTo({
        top: targetPosition,
        behavior: "smooth",
      })
    }
    setIsOpen(false)
  }

  return (
    <>
      <nav
        className={`fixed top-4 md:top-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
          isVisible ? "translate-y-0 opacity-100" : "-translate-y-20 md:-translate-y-24 opacity-0"
        } ${hasLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{
          transition: hasLoaded ? "all 0.5s ease-out" : "opacity 0.8s ease-out, transform 0.8s ease-out",
        }}
      >
        {/* Main Navigation */}
        <div className="w-[90vw] max-w-xs md:max-w-4xl mx-auto">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-full px-4 py-3 md:px-6 md:py-2">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <Link
                href="/"
                className="flex items-center hover:scale-105 transition-transform duration-200 cursor-pointer"
              >
                <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center">
                  <Image
                    src="/images/attrock_logo.png"
                    alt="Attrock"
                    width={40}
                    height={40}
                    className="w-full h-full object-contain"
                  />
                </div>
              </Link>

              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center space-x-8">
                {navigation.map((item) =>
                  item.href.startsWith("/") ? (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="text-white/80 hover:text-white hover:scale-105 transition-all duration-200 font-medium cursor-pointer"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <button
                      key={item.name}
                      onClick={() => scrollToSection(item.href)}
                      className="text-white/80 hover:text-white hover:scale-105 transition-all duration-200 font-medium cursor-pointer"
                    >
                      {item.name}
                    </button>
                  ),
                )}
              </div>

              {/* Desktop CTA Button & Profile */}
              <div className="hidden md:flex items-center gap-3">
                {!isAuthenticated ? (
                  <button
                    className="relative bg-white hover:bg-gray-50 text-black font-medium px-6 py-2 rounded-full flex items-center transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer group"
                    onClick={() => setIsAuthModalOpen(true)}
                  >
                    <span className="mr-2">Get Started</span>
                    <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </button>
                ) : (
                  <div 
                    className="relative" 
                    ref={dropdownRef}
                    onMouseEnter={() => setIsProfileDropdownOpen(true)}
                    onMouseLeave={() => setIsProfileDropdownOpen(false)}
                  >
                    <button
                      className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all duration-300 hover:scale-105 cursor-pointer"
                      title={user?.name || user?.email || 'Profile'}
                    >
                      <User className="w-5 h-5 text-white" />
                    </button>

                    {/* Dropdown Menu */}
                    {isProfileDropdownOpen && (
                      <div className="absolute right-0 mt-1 w-56 bg-black/90 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl py-2 z-50 before:content-[''] before:absolute before:-top-1 before:right-0 before:w-full before:h-1 before:bg-transparent">
                        {/* User Info */}
                        <div className="px-4 py-3 border-b border-white/10">
                          <p className="text-sm font-semibold text-white truncate">{user?.name || user?.email?.split('@')[0] || 'User'}</p>
                          <p className="text-xs text-white/60 truncate">{user?.email}</p>
                        </div>

                        {/* Menu Items */}
                        <button
                          onClick={() => {
                            setIsProfileDropdownOpen(false)
                            router.push('/dashboard')
                          }}
                          className="w-full px-4 py-2.5 text-left text-white/90 hover:bg-white/10 transition-colors duration-200 flex items-center gap-3 cursor-pointer"
                        >
                          <LayoutDashboard size={18} />
                          <span className="text-sm font-medium">Go to Dashboard</span>
                        </button>

                        <button
                          onClick={() => {
                            setIsProfileDropdownOpen(false)
                            router.push('/dashboard/settings')
                          }}
                          className="w-full px-4 py-2.5 text-left text-white/90 hover:bg-white/10 transition-colors duration-200 flex items-center gap-3 cursor-pointer"
                        >
                          <UserCircle size={18} />
                          <span className="text-sm font-medium">Profile</span>
                        </button>

                        <div className="border-t border-white/10 my-1"></div>

                        <button
                          onClick={handleLogout}
                          className="w-full px-4 py-2.5 text-left text-red-400 hover:bg-red-500/20 transition-colors duration-200 flex items-center gap-3 cursor-pointer"
                        >
                          <LogOut size={18} />
                          <span className="text-sm font-medium">Logout</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="md:hidden text-white hover:scale-110 transition-transform duration-200 cursor-pointer"
              >
                <div className="relative w-6 h-6">
                  <Menu
                    size={24}
                    className={`absolute inset-0 transition-all duration-300 ${
                      isOpen ? "opacity-0 rotate-180 scale-75" : "opacity-100 rotate-0 scale-100"
                    }`}
                  />
                  <X
                    size={24}
                    className={`absolute inset-0 transition-all duration-300 ${
                      isOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-180 scale-75"
                    }`}
                  />
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="md:hidden relative">
          {/* Backdrop overlay */}
          <div
            className={`fixed inset-0 bg-black/20 backdrop-blur-sm transition-all duration-300 ${
              isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onClick={() => setIsOpen(false)}
            style={{ top: "0", left: "0", right: "0", bottom: "0", zIndex: -1 }}
          />

          {/* Menu container */}
          <div
            className={`mt-2 w-[90vw] max-w-xs mx-auto transition-all duration-500 ease-out transform-gpu ${
              isOpen ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-8 scale-95 pointer-events-none"
            }`}
          >
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-2xl">
              <div className="flex flex-col space-y-1">
                <div className="h-px bg-white/10 my-2" />
                
                {!isAuthenticated ? (
                  <button
                    className={`relative bg-white hover:bg-gray-50 text-black font-medium px-6 py-3 rounded-full flex items-center transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer group transform ${
                      isOpen ? "animate-mobile-menu-item" : ""
                    }`}
                    style={{
                      animationDelay: isOpen ? `${navigation.length * 80 + 150}ms` : "0ms",
                    }}
                    onClick={() => {
                      setIsOpen(false)
                      setIsAuthModalOpen(true)
                    }}
                  >
                    <span className="mr-2">Get Started</span>
                    <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </button>
                ) : (
                  <>
                    <button
                      className={`w-full py-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center gap-2 hover:bg-white/20 transition-all duration-300 hover:scale-105 cursor-pointer transform ${
                        isOpen ? "animate-mobile-menu-item" : ""
                      }`}
                      style={{
                        animationDelay: isOpen ? `${navigation.length * 80 + 150}ms` : "0ms",
                      }}
                      onClick={() => {
                        setIsOpen(false)
                        router.push('/dashboard')
                      }}
                    >
                      <LayoutDashboard className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">Go to Dashboard</span>
                    </button>
                    <button
                      className={`w-full py-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center gap-2 hover:bg-white/20 transition-all duration-300 hover:scale-105 cursor-pointer transform ${
                        isOpen ? "animate-mobile-menu-item" : ""
                      }`}
                      style={{
                        animationDelay: isOpen ? `${navigation.length * 80 + 230}ms` : "0ms",
                      }}
                      onClick={() => {
                        setIsOpen(false)
                        router.push('/dashboard/settings')
                      }}
                    >
                      <UserCircle className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">Profile</span>
                    </button>
                    <button
                      className={`w-full py-3 rounded-full bg-red-500/20 backdrop-blur-md border border-red-300/30 flex items-center justify-center gap-2 hover:bg-red-500/30 transition-all duration-300 hover:scale-105 cursor-pointer transform ${
                        isOpen ? "animate-mobile-menu-item" : ""
                      }`}
                      style={{
                        animationDelay: isOpen ? `${navigation.length * 80 + 310}ms` : "0ms",
                      }}
                      onClick={() => {
                        setIsOpen(false)
                        handleLogout()
                      }}
                    >
                      <LogOut className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">Logout</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>
      
      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  )
}
     