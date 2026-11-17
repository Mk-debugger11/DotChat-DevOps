'use client'

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import ChatSidebar, {
  UserProfileInfo,
  ThreadItem,
} from '../../components/chatSidebar'
import ChatHeader from '../../components/chatHeader'
import ChatMessages, { MessageItem } from '../../components/chatMessages'
import ChatInput from '../../components/chatInput'
import { apiRequest } from '../../utils/api'
import { getSocket } from '../../utils/socket'

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

interface MessagesResponse {
  message: string
  data: MessageItem[]
}

function deduplicateAndSortThreads(list: ThreadItem[]): ThreadItem[] {
  const seen = new Set<string>()
  const unique = list.filter((item) => {
    const id = item?.thread?.id
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })

  return unique.sort((a, b) => {
    const timeA = a.thread.messages?.[0]?.createdAt
      ? new Date(a.thread.messages[0].createdAt).getTime()
      : new Date(a.thread.createdAt).getTime()
    const timeB = b.thread.messages?.[0]?.createdAt
      ? new Date(b.thread.messages[0].createdAt).getTime()
      : new Date(b.thread.createdAt).getTime()
    return timeB - timeA
  })
}

export default function MessagesPage(): React.JSX.Element {
  const [currentUser, setCurrentUser] = useState<UserProfileInfo | null>(null)
  const [threads, setThreads] = useState<ThreadItem[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [activeUser, setActiveUser] = useState<UserProfileInfo | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [loadingThreads, setLoadingThreads] = useState<boolean>(true)
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false)
  const [sending, setSending] = useState<boolean>(false)

  // Presence & Typing State
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [typingUsers, setTypingUsers] = useState<Record<string, Set<string>>>({})

  const activeThreadIdRef = useRef<string | null>(activeThreadId)
  const activeUserRef = useRef<UserProfileInfo | null>(activeUser)
  const currentUserRef = useRef<UserProfileInfo | null>(currentUser)

  // Keep the latest values for socket handlers (synced after render, before paint)
  useLayoutEffect(() => {
    activeThreadIdRef.current = activeThreadId
    activeUserRef.current = activeUser
    currentUserRef.current = currentUser
  }, [activeThreadId, activeUser, currentUser])

  const readTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Helper to mark a thread as read both via socket and REST API
  const markActiveThreadAsRead = useCallback((threadId: string) => {
    if (!threadId) return
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const socket = getSocket(token)
    socket.emit('mark_read', { threadId })
    apiRequest('POST', `/message/read/${threadId}`).catch(() => {})

    setThreads((prev) =>
      prev.map((t) =>
        t.thread.id === threadId ? { ...t, unreadCount: 0 } : t
      )
    )
  }, [])

  // When user returns to tab or focuses the window, mark active thread as read
  useEffect(() => {
    const handleActiveFocus = () => {
      if (
        typeof document !== 'undefined' &&
        !document.hidden &&
        document.hasFocus() &&
        activeThreadIdRef.current
      ) {
        markActiveThreadAsRead(activeThreadIdRef.current)
      }
    }

    window.addEventListener('focus', handleActiveFocus)
    window.addEventListener('click', handleActiveFocus)
    document.addEventListener('visibilitychange', handleActiveFocus)

    return () => {
      window.removeEventListener('focus', handleActiveFocus)
      window.removeEventListener('click', handleActiveFocus)
      document.removeEventListener('visibilitychange', handleActiveFocus)
    }
  }, [markActiveThreadAsRead])

  // 1. Fetch Current User Profile
  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const res = await apiRequest<MeResponse>('GET', '/user/me')
        if (res?.profile) {
          setCurrentUser({
            id: res.profile.id,
            name: res.profile.profile?.name || 'User',
            username: res.profile.profile?.username || '',
            avatarUrl: res.profile.profile?.avatarUrl,
          })
        }
      } catch (err) {
        console.error('Failed to load current user:', err)
      }
    }
    loadCurrentUser()
  }, [])

  // 2. Fetch Threads List (Initial REST call)
  const fetchThreads = useCallback(async () => {
    try {
      const res = await apiRequest<{ data: ThreadItem[] }>('GET', '/chat')
      if (res?.data) {
        setThreads((prev) => {
          const serverThreads = res.data
          const currentActiveId = activeThreadIdRef.current
          const currentActUser = activeUserRef.current

          const missingActive =
            currentActiveId &&
            currentActUser &&
            !serverThreads.some((t) => t.thread.id === currentActiveId)
              ? prev.find((t) => t.thread.id === currentActiveId)
              : null

          const combined = missingActive
            ? [missingActive, ...serverThreads]
            : serverThreads

          return deduplicateAndSortThreads(combined)
        })
      }
    } catch (err) {
      console.error('Failed to fetch threads:', err)
    } finally {
      setLoadingThreads(false)
    }
  }, [])

  useEffect(() => {
    fetchThreads()
  }, [fetchThreads])

  // 3. Setup WebSocket Connection, Presence & Global Thread Update Listeners
  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const socket = getSocket(token)

    // A. Online Presence Listeners
    const handleOnlineUsers = (userIds: string[]) => {
      setOnlineUserIds(new Set(userIds))
    }

    const handleUserStatusChanged = (data: {
      userId: string
      status: 'online' | 'offline'
    }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev)
        if (data.status === 'online') {
          next.add(data.userId)
        } else {
          next.delete(data.userId)
        }
        return next
      })
    }

    // B. Typing Indicator Global Listeners
    const handleUserTyping = (data: { threadId: string; userId: string }) => {
      setTypingUsers((prev) => {
        const currentSet = new Set(prev[data.threadId] || [])
        currentSet.add(data.userId)
        return { ...prev, [data.threadId]: currentSet }
      })
    }

    const handleUserStopTyping = (data: {
      threadId: string
      userId: string
    }) => {
      setTypingUsers((prev) => {
        const currentSet = new Set(prev[data.threadId] || [])
        currentSet.delete(data.userId)
        return { ...prev, [data.threadId]: currentSet }
      })
    }

    // C. Read Receipts Listeners - Turns sent checkmarks blue in real-time
    const handleMessagesRead = (data: {
      threadId: string
      readerId: string
    }) => {
      if (data.threadId === activeThreadIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.isRead ? m : { ...m, isRead: true }))
        )
      }

      setThreads((prev) =>
        prev.map((t) => {
          if (t.thread.id !== data.threadId) return t
          const updatedUnread =
            data.readerId === currentUserRef.current?.id ? 0 : t.unreadCount
          return {
            ...t,
            unreadCount: updatedUnread,
            thread: {
              ...t.thread,
              messages: t.thread.messages.map((m) => ({ ...m, isRead: true })),
            },
          }
        })
      )
    }

    const handleThreadRead = (data: {
      threadId: string
      readerId: string
    }) => {
      if (data.threadId === activeThreadIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.isRead ? m : { ...m, isRead: true }))
        )
      }
      if (data.readerId === currentUserRef.current?.id) {
        setThreads((prev) =>
          prev.map((t) =>
            t.thread.id === data.threadId ? { ...t, unreadCount: 0 } : t
          )
        )
      }
    }

    // D. Thread Update Listener
    const handleThreadUpdated = (data: {
      threadId: string
      lastMessage: MessageItem
    }) => {
      const isCurrentActive = activeThreadIdRef.current === data.threadId
      const isFromOther =
        data.lastMessage.senderId !== currentUserRef.current?.id

      const isTabActive =
        typeof document !== 'undefined' &&
        !document.hidden &&
        document.hasFocus()

      setThreads((prev) => {
        const index = prev.findIndex((t) => t.thread.id === data.threadId)
        if (index !== -1) {
          const current = prev[index]
          const isViewingNow = isCurrentActive && isTabActive
          const unreadIncrement = !isViewingNow && isFromOther ? 1 : 0
          const updated: ThreadItem = {
            ...current,
            unreadCount: isViewingNow
              ? 0
              : (current.unreadCount || 0) + unreadIncrement,
            thread: {
              ...current.thread,
              messages: [data.lastMessage],
            },
          }
          const remaining = prev.filter((_, i) => i !== index)
          return [updated, ...remaining]
        }
        fetchThreads()
        return prev
      })
    }

    socket.on('online_users', handleOnlineUsers)
    socket.on('user_status_changed', handleUserStatusChanged)
    socket.on('user_typing', handleUserTyping)
    socket.on('user_stop_typing', handleUserStopTyping)
    socket.on('messages_read', handleMessagesRead)
    socket.on('thread_read', handleThreadRead)
    socket.on('thread_updated', handleThreadUpdated)

    // Request active online users immediately
    socket.emit('get_online_users', (users?: string[]) => {
      if (users) setOnlineUserIds(new Set(users))
    })

    return () => {
      socket.off('online_users', handleOnlineUsers)
      socket.off('user_status_changed', handleUserStatusChanged)
      socket.off('user_typing', handleUserTyping)
      socket.off('user_stop_typing', handleUserStopTyping)
      socket.off('messages_read', handleMessagesRead)
      socket.off('thread_read', handleThreadRead)
      socket.off('thread_updated', handleThreadUpdated)
    }
  }, [fetchThreads])

  // 4. WebSocket Room Joining, Mark as Read & Real-time Messages for Active Thread
  useEffect(() => {
    if (!activeThreadId) {
      // Clear the message pane when no thread is selected
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([])
      return
    }

    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const socket = getSocket(token)

    let isMounted = true

    // Fetch initial message history from MongoDB
    async function loadInitialMessages() {
      setLoadingMessages(true)
      try {
        const res = await apiRequest<MessagesResponse>(
          'GET',
          `/message/${activeThreadId}`
        )
        if (isMounted && res?.data) {
          setMessages(res.data)
        }
      } catch (err) {
        console.error('Failed to load message history:', err)
      } finally {
        if (isMounted) {
          setLoadingMessages(false)
        }
      }
    }

    loadInitialMessages()

    // Join the thread's real-time WebSocket room
    socket.emit('join_thread', { threadId: activeThreadId })

    // Only mark as read if this browser tab/window is currently focused and visible
    const isTabActive =
      typeof document !== 'undefined' &&
      !document.hidden &&
      document.hasFocus()

    if (isTabActive) {
      markActiveThreadAsRead(activeThreadId)
    }

    // Real-time listener: receive message instantly without polling
    const handleNewMessage = (msg: MessageItem) => {
      if (msg.threadId === activeThreadIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) {
            return prev.map((m) =>
              m.id === msg.id ? { ...m, isRead: msg.isRead } : m
            )
          }
          return [...prev, msg]
        })

        // If message is from another participant, only mark read after active viewing
        if (msg.senderId !== currentUserRef.current?.id) {
          const isViewingNow =
            typeof document !== 'undefined' &&
            !document.hidden &&
            document.hasFocus()

          if (isViewingNow) {
            // User is actively looking at the room.
            // Allow a natural 1.5s reading delay before emitting mark_read,
            // so the sender clearly sees delivered state (✓✓ grey) first.
            if (readTimerRef.current) clearTimeout(readTimerRef.current)
            readTimerRef.current = setTimeout(() => {
              if (
                activeThreadIdRef.current === msg.threadId &&
                typeof document !== 'undefined' &&
                !document.hidden &&
                document.hasFocus()
              ) {
                markActiveThreadAsRead(msg.threadId)
              }
            }, 1500)
          }
        }
      }
    }

    socket.on('new_message', handleNewMessage)

    return () => {
      isMounted = false
      if (readTimerRef.current) clearTimeout(readTimerRef.current)
      socket.emit('leave_thread', { threadId: activeThreadId })
      socket.off('new_message', handleNewMessage)
    }
  }, [activeThreadId, markActiveThreadAsRead])

  // Select an existing thread
  const handleSelectThread = (
    threadId: string,
    otherUser: UserProfileInfo
  ) => {
    setActiveThreadId(threadId)
    setActiveUser(otherUser)
    markActiveThreadAsRead(threadId)
  }

  // Select a user to start/open conversation
  const handleSelectUser = async (user: UserProfileInfo) => {
    try {
      const myId = currentUserRef.current?.id || ''

      // Check if thread with this user already exists
      const existing = threads.find((t) =>
        t.thread.participants.some((p) => p.userId === user.id)
      )

      if (existing) {
        setActiveThreadId(existing.thread.id)
        setActiveUser(user)
        markActiveThreadAsRead(existing.thread.id)
        return
      }

      // If not, create or find thread via backend
      const res = await apiRequest<{ threadId: string }>('POST', '/chat', {
        participantId: user.id,
      })

      if (res?.threadId) {
        const provisionalThread: ThreadItem = {
          id: res.threadId,
          threadId: res.threadId,
          unreadCount: 0,
          thread: {
            id: res.threadId,
            createdAt: new Date().toISOString(),
            participants: [
              {
                id: 'me',
                userId: myId,
                user: {
                  id: myId,
                  profile: {
                    name: currentUserRef.current?.name || 'Me',
                    username: currentUserRef.current?.username || 'me',
                    avatarUrl: currentUserRef.current?.avatarUrl,
                  },
                },
              },
              {
                id: user.id,
                userId: user.id,
                user: {
                  id: user.id,
                  profile: {
                    name: user.name,
                    username: user.username,
                    avatarUrl: user.avatarUrl,
                  },
                },
              },
            ],
            messages: [],
          },
        }

        setThreads((prev) =>
          deduplicateAndSortThreads([provisionalThread, ...prev])
        )

        setActiveThreadId(res.threadId)
        setActiveUser(user)
        setMessages([])
        fetchThreads()
      }
    } catch (err) {
      console.error('Failed to initiate conversation:', err)
    }
  }

  // Typing Emitters
  const handleTypingStart = useCallback(() => {
    if (!activeThreadId) return
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const socket = getSocket(token)
    socket.emit('typing_start', { threadId: activeThreadId })
    markActiveThreadAsRead(activeThreadId)
  }, [activeThreadId, markActiveThreadAsRead])

  const handleTypingStop = useCallback(() => {
    if (!activeThreadId) return
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const socket = getSocket(token)
    socket.emit('typing_stop', { threadId: activeThreadId })
  }, [activeThreadId])

  // Send message via WebSocket
  const handleSendMessage = async (content: string) => {
    if (!activeThreadId || !content.trim()) return

    setSending(true)
    const trimmed = content.trim()
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const socket = getSocket(token)

    try {
      if (socket && socket.connected) {
        socket.emit(
          'send_message',
          { threadId: activeThreadId, content: trimmed },
          (res: { success: boolean; data?: MessageItem; error?: string }) => {
            if (res?.success && res.data) {
              const newMsg = res.data
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev
                return [...prev, newMsg]
              })
            }
          }
        )
      } else {
        const res = await apiRequest<{ message: string; data: MessageItem }>(
          'POST',
          '/message',
          { threadId: activeThreadId, content: trimmed }
        )
        if (res?.data) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === res.data.id)) return prev
            return [...prev, res.data]
          })
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  const isActiveUserOnline = Boolean(
    activeUser && onlineUserIds.has(activeUser.id)
  )
  const isActiveUserTyping = Boolean(
    activeThreadId &&
      activeUser &&
      typingUsers[activeThreadId]?.has(activeUser.id)
  )

  return (
    <div className="w-full h-full flex bg-gray-50 overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-1/3 min-w-[300px] max-w-[360px] h-full shrink-0">
        <ChatSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          currentUserId={currentUser?.id || ''}
          loading={loadingThreads}
          onlineUserIds={onlineUserIds}
          typingUserIdsByThread={typingUsers}
          onSelectThread={handleSelectThread}
          onSelectUser={handleSelectUser}
        />
      </div>

      {/* Right Chat Room Area */}
      <div className="flex-1 flex flex-col h-full bg-white relative min-w-0">
        {activeUser && activeThreadId ? (
          <>
            {/* Chat Header */}
            <div className="h-[70px] shrink-0 z-10">
              <ChatHeader
                user={activeUser}
                isOnline={isActiveUserOnline}
                isTyping={isActiveUserTyping}
              />
            </div>

            {/* Messages Stream */}
            <div
              className="flex-1 overflow-y-auto flex flex-col justify-between"
              onClick={() => {
                if (activeThreadIdRef.current) {
                  markActiveThreadAsRead(activeThreadIdRef.current)
                }
              }}
            >
              <ChatMessages
                messages={messages}
                currentUserId={currentUser?.id || ''}
                otherUserName={activeUser.name}
                loading={loadingMessages}
                isRecipientOnline={isActiveUserOnline}
              />

              {/* Dynamic Typing Indicator Bubble in Message Stream */}
              {isActiveUserTyping && (
                <div className="px-6 py-2 bg-white shrink-0">
                  <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-gray-100 text-gray-600 text-xs w-fit shadow-2xs border border-gray-200/60 animate-fade-in">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" />
                    </span>
                    <span className="font-medium text-xs text-gray-700">
                      {activeUser.name} is typing...
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="shrink-0 border-t border-gray-100 z-10">
              <ChatInput
                onSendMessage={handleSendMessage}
                onTyping={handleTypingStart}
                onStopTyping={handleTypingStop}
                disabled={sending}
              />
            </div>
          </>
        ) : (
          /* Empty State when no conversation is opened */
          <div className="flex-1 flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50/40">
            <div className="w-16 h-16 rounded-2xl bg-purple-100/70 text-purple-700 flex items-center justify-center mb-4 text-2xl shadow-xs">
              💬
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              Start chat, open any chat room
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Select a conversation from the sidebar or pick a user from the list
              to start messaging.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
