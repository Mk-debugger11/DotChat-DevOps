'use client'

import React, { useState, useEffect } from 'react'
import ChatItem from './chatItem'
import { apiRequest } from '../utils/api'

export interface UserProfileInfo {
  id: string
  name: string
  username: string
  avatarUrl?: string | null
}

export interface ThreadItem {
  id: string
  threadId: string
  unreadCount?: number
  thread: {
    id: string
    createdAt: string
    participants: {
      id: string
      userId: string
      user: {
        id: string
        profile: {
          name: string
          username: string
          avatarUrl?: string | null
        } | null
      }
    }[]
    messages: {
      id: string
      content: string
      createdAt: string
      senderId: string
      isRead?: boolean
    }[]
  }
}

interface DiscoverUser {
  userId: string
  username: string
  name: string
  avatarUrl?: string | null
}

interface ChatSidebarProps {
  threads: ThreadItem[]
  activeThreadId: string | null
  currentUserId: string
  loading: boolean
  onlineUserIds?: Set<string>
  typingUserIdsByThread?: Record<string, Set<string>>
  onSelectThread: (threadId: string, otherUser: UserProfileInfo) => void
  onSelectUser: (user: UserProfileInfo) => void
}

function formatPreviewTime(isoString?: string): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    const now = new Date()
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function ChatSidebar({
  threads,
  activeThreadId,
  currentUserId,
  loading,
  onlineUserIds = new Set(),
  typingUserIdsByThread = {},
  onSelectThread,
  onSelectUser,
}: ChatSidebarProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<DiscoverUser[]>([])
  const [allUsers, setAllUsers] = useState<DiscoverUser[]>([])
  const [searching, setSearching] = useState<boolean>(false)

  // 1. Fetch all discoverable users on mount
  useEffect(() => {
    async function loadAllUsers() {
      try {
        const res = await apiRequest<{ data: DiscoverUser[] }>('GET', '/user')
        if (res?.data) {
          setAllUsers(res.data)
        }
      } catch (err) {
        console.error('Failed to load users:', err)
      }
    }
    loadAllUsers()
  }, [])

  // 2. Debounced search when query changes
  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest<{ data: DiscoverUser[] }>(
          'GET',
          `/user/search?q=${encodeURIComponent(query)}`
        )
        setSearchResults(res.data || [])
      } catch (err) {
        console.error('Failed to search users:', err)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const isSearchActive = searchQuery.trim().length > 0

  return (
    <div className="w-full h-full bg-white flex flex-col p-4 border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">Messages</h2>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users by username..."
          className="w-full pl-9 pr-8 py-2 rounded-xl bg-gray-100 outline-none text-sm text-gray-800 focus:bg-white focus:ring-1 focus:ring-purple-500 border border-transparent focus:border-purple-300 transition"
        />
        <svg
          className="w-4 h-4 text-gray-400 absolute left-3 top-2.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        {isSearchActive && (
          <button
            onClick={() => {
              setSearchQuery('')
              setSearchResults([])
            }}
            className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 text-xs font-semibold"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {isSearchActive ? (
          /* Search Results */
          <div>
            <div className="mb-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {searching ? 'Searching...' : 'Users Found'}
              </span>
            </div>

            {searchResults.length === 0 && !searching ? (
              <div className="p-4 text-center text-xs text-gray-400">
                No users found with username starting with &quot;{searchQuery}&quot;
              </div>
            ) : (
              searchResults.map((user) => (
                <ChatItem
                  key={user.userId}
                  name={user.name}
                  username={user.username}
                  message={`Click to chat with @${user.username}`}
                  avatarUrl={user.avatarUrl}
                  isOnline={onlineUserIds.has(user.userId)}
                  onClick={() => {
                    setSearchQuery('')
                    setSearchResults([])
                    onSelectUser({
                      id: user.userId,
                      name: user.name,
                      username: user.username,
                      avatarUrl: user.avatarUrl,
                    })
                  }}
                />
              ))
            )}
          </div>
        ) : (
          /* Normal View: Conversations & Available Users */
          <>
            {/* Conversations */}
            <div>
              <div className="mb-2 px-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Conversations
                </span>
              </div>

              {loading ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  Loading chats...
                </div>
              ) : threads.length === 0 ? (
                <div className="p-3 text-center text-xs text-gray-400">
                  No conversations yet.
                </div>
              ) : (
                threads.map((item) => {
                  const other =
                    item.thread.participants.find(
                      (p) => currentUserId && p.userId !== currentUserId
                    ) ||
                    item.thread.participants.find(
                      (p) => p.userId !== currentUserId
                    ) ||
                    item.thread.participants[0]

                  const otherUserId = other?.user?.id || other?.userId || ''
                  const otherUser: UserProfileInfo = {
                    id: otherUserId,
                    name:
                      other?.user?.profile?.name ||
                      other?.user?.profile?.username ||
                      'User',
                    username: other?.user?.profile?.username || 'user',
                    avatarUrl: other?.user?.profile?.avatarUrl,
                  }
                  const lastMsg = item.thread.messages?.[0]
                  const previewText = lastMsg
                    ? lastMsg.content
                    : 'Conversation started'
                  const timeText = formatPreviewTime(
                    lastMsg?.createdAt || item.thread.createdAt
                  )

                  const isOnline = onlineUserIds.has(otherUserId)
                  const isTyping = Boolean(
                    typingUserIdsByThread[item.thread.id]?.has(otherUserId)
                  )

                  return (
                    <ChatItem
                      key={item.thread.id}
                      name={otherUser.name}
                      username={otherUser.username}
                      message={previewText}
                      time={timeText}
                      active={item.thread.id === activeThreadId}
                      avatarUrl={otherUser.avatarUrl}
                      isOnline={isOnline}
                      isTyping={isTyping}
                      unreadCount={item.unreadCount || 0}
                      onClick={() => onSelectThread(item.thread.id, otherUser)}
                    />
                  )
                })
              )}
            </div>

            {/* Users List for Discovery */}
            {allUsers.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <div className="mb-2 px-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Users
                  </span>
                </div>
                {allUsers.map((user) => (
                  <ChatItem
                    key={user.userId}
                    name={user.name}
                    username={user.username}
                    message={`Start chat with @${user.username}`}
                    avatarUrl={user.avatarUrl}
                    isOnline={onlineUserIds.has(user.userId)}
                    onClick={() => {
                      onSelectUser({
                        id: user.userId,
                        name: user.name,
                        username: user.username,
                        avatarUrl: user.avatarUrl,
                      })
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
