'use client'

import { useRouter, usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { apiRequest } from '../utils/api'
import Link from 'next/link'

interface MeResponse {
  profile: {
    id: string
    email: string
    profile: {
      name: string
      username: string
      avatarUrl?: string | null
    } | null
  }
}

export default function Protected({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userName, setUserName] = useState<string>('User')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [imgError, setImgError] = useState<boolean>(false)

  useEffect(() => {
    const cachedName = localStorage.getItem('userName')
    const cachedAvatar = localStorage.getItem('userAvatar')
    // Intentional: localStorage only exists after hydration, so cached values are
    // restored here (a lazy useState initializer would cause an SSR hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cachedName) setUserName(cachedName)
    if (cachedAvatar) setAvatarUrl(cachedAvatar)

    const token: string = localStorage.getItem('token') || ''
    if (!token) {
      router.push('/auth/signin')
      return
    }

    async function authCheck(): Promise<void> {
      try {
        const res = await apiRequest<MeResponse>('GET', '/user/me')
        if (res?.profile?.profile?.name) {
          setUserName(res.profile.profile.name)
          localStorage.setItem('userName', res.profile.profile.name)
        }
        if (res?.profile?.profile?.avatarUrl) {
          setAvatarUrl(res.profile.profile.avatarUrl)
          localStorage.setItem('userAvatar', res.profile.profile.avatarUrl)
        }
      } catch (error) {
        console.error('Auth error:', error)
        localStorage.removeItem('token')
        localStorage.removeItem('userName')
        localStorage.removeItem('userAvatar')
        router.push('/auth/signin')
      }
    }

    authCheck()
  }, [router])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      {/* Left Navigation Bar */}
      <div className="w-64 shrink-0 h-screen bg-[#1a0033] text-white flex flex-col justify-between p-6">
        <div>
          <div className="flex items-center gap-2 mb-10">
            <img src="/logo.png" alt="DotChat Logo" className="w-8 h-8" />
            <h1 className="text-xl font-bold tracking-wide text-gray-100">
              DotChat
            </h1>
          </div>

          <nav className="flex flex-col gap-2">
            <Link href="/messages">
              <div
                className={`rounded-xl px-4 py-3 flex items-center gap-3 transition ${
                  pathname.startsWith('/messages')
                    ? 'bg-[#2a0a4d] text-white'
                    : 'text-gray-300 hover:text-white hover:bg-[#2a0a4d]/60'
                }`}
              >
                <img src="/message.png" alt="" className="w-5 h-5" />
                <span className="text-sm font-semibold">Messages</span>
              </div>
            </Link>

            <Link href="/groups">
              <div
                className={`rounded-xl px-4 py-3 flex items-center gap-3 transition ${
                  pathname.startsWith('/groups')
                    ? 'bg-[#2a0a4d] text-white'
                    : 'text-gray-300 hover:text-white hover:bg-[#2a0a4d]/60'
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <span className="text-sm font-semibold">Groups</span>
              </div>
            </Link>
          </nav>
        </div>

        {/* User profile and logout footer */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {avatarUrl && !imgError ? (
              <img
                src={avatarUrl}
                alt={userName}
                className="w-9 h-9 shrink-0 rounded-full object-cover border border-white/20 shadow-xs"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-9 h-9 shrink-0 rounded-full bg-purple-400/30 text-white flex items-center justify-center font-bold text-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {userName}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('token')
              localStorage.removeItem('userName')
              localStorage.removeItem('userAvatar')
              router.push('/auth/signin')
            }}
            title="Logout"
            className="text-xs text-gray-400 hover:text-red-300 px-2 py-1 rounded transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content View */}
      <main className="flex-1 h-screen overflow-hidden">
        {children}
      </main>
    </div>
  )
}
