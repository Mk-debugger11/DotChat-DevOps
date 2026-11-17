'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { apiRequest } from '../../utils/api'
import { getSocket } from '../../utils/socket'
import ChatInput from '../../components/chatInput'

interface ParticipantUser {
  id: string
  profile: {
    name: string
    username: string
    avatarUrl?: string | null
  } | null
}

interface GroupParticipant {
  id: string
  userId: string
  user: ParticipantUser
}

interface MessageItem {
  id: string
  content: string
  senderId: string
  threadId: string
  createdAt: string
  sender?: {
    id: string
    profile: {
      name: string
      username: string
      avatarUrl?: string | null
    } | null
  } | null
}

interface GroupThread {
  id: string
  name: string
  isGroup: boolean
  adminId?: string
  createdAt: string
  participants: GroupParticipant[]
  messages: MessageItem[]
}

interface DiscoverUser {
  userId: string
  username: string
  name: string
  avatarUrl?: string | null
}

interface MeResponse {
  profile: {
    id: string
    email: string
    profile: {
      name: string
      username: string
    } | null
  }
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function deduplicateGroups(list: GroupThread[]): GroupThread[] {
  const seen = new Set<string>()
  return list.filter((g) => {
    if (!g?.id || seen.has(g.id)) return false
    seen.add(g.id)
    return true
  })
}

export default function GroupsPage(): React.JSX.Element {
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [groups, setGroups] = useState<GroupThread[]>([])
  const [activeGroup, setActiveGroup] = useState<GroupThread | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [loadingGroups, setLoadingGroups] = useState<boolean>(true)
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false)
  const [sending, setSending] = useState<boolean>(false)

  // Presence & Typing State
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [typingUsers, setTypingUsers] = useState<Record<string, Set<string>>>({})

  // Modal state for creating a new group
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false)
  const [newGroupName, setNewGroupName] = useState<string>('')
  const [availableUsers, setAvailableUsers] = useState<DiscoverUser[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [creatingGroup, setCreatingGroup] = useState<boolean>(false)
  const [createError, setCreateError] = useState<string>('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const activeGroupIdRef = useRef<string | null>(null)
  activeGroupIdRef.current = activeGroup?.id || null

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 1. Fetch Current User
  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const res = await apiRequest<MeResponse>('GET', '/user/me')
        if (res?.profile?.id) {
          setCurrentUserId(res.profile.id)
        }
      } catch (err) {
        console.error('Failed to load current user:', err)
      }
    }
    loadCurrentUser()
  }, [])

  // 2. Fetch Groups List
  const fetchGroups = useCallback(async () => {
    try {
      const res = await apiRequest<{ data: GroupThread[] }>('GET', '/group')
      if (res?.data) {
        setGroups(deduplicateGroups(res.data))
      }
    } catch (err) {
      console.error('Failed to load groups:', err)
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  // 3. Socket.IO Global Listeners for Groups, Presence & Typing
  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const socket = getSocket(token)

    const handleGroupCreated = (newGroup: GroupThread) => {
      setGroups((prev) => deduplicateGroups([newGroup, ...prev]))
    }

    const handleThreadUpdated = (data: {
      threadId: string
      lastMessage: MessageItem
    }) => {
      setGroups((prev) => {
        const index = prev.findIndex((g) => g.id === data.threadId)
        if (index !== -1) {
          const current = prev[index]
          const updated: GroupThread = {
            ...current,
            messages: [data.lastMessage],
          }
          const remaining = prev.filter((_, i) => i !== index)
          return [updated, ...remaining]
        }
        return prev
      })
    }

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

    socket.on('group_created', handleGroupCreated)
    socket.on('thread_updated', handleThreadUpdated)
    socket.on('online_users', handleOnlineUsers)
    socket.on('user_status_changed', handleUserStatusChanged)
    socket.on('user_typing', handleUserTyping)
    socket.on('user_stop_typing', handleUserStopTyping)

    socket.emit('get_online_users', (users?: string[]) => {
      if (users) setOnlineUserIds(new Set(users))
    })

    return () => {
      socket.off('group_created', handleGroupCreated)
      socket.off('thread_updated', handleThreadUpdated)
      socket.off('online_users', handleOnlineUsers)
      socket.off('user_status_changed', handleUserStatusChanged)
      socket.off('user_typing', handleUserTyping)
      socket.off('user_stop_typing', handleUserStopTyping)
    }
  }, [])

  // 4. Load Messages & Socket Room for Active Group
  useEffect(() => {
    if (!activeGroup) {
      setMessages([])
      return
    }

    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const socket = getSocket(token)
    const threadId = activeGroup.id
    let isMounted = true

    async function loadInitialMessages() {
      setLoadingMessages(true)
      try {
        const res = await apiRequest<{ data: MessageItem[] }>(
          'GET',
          `/message/${threadId}`
        )
        if (isMounted && res?.data) {
          setMessages(res.data)
        }
      } catch (err) {
        console.error('Failed to load group messages:', err)
      } finally {
        if (isMounted) {
          setLoadingMessages(false)
        }
      }
    }

    loadInitialMessages()

    socket.emit('join_thread', { threadId })

    const handleNewMessage = (msg: MessageItem) => {
      if (msg.threadId === activeGroupIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      }
    }

    socket.on('new_message', handleNewMessage)

    return () => {
      isMounted = false
      socket.emit('leave_thread', { threadId })
      socket.off('new_message', handleNewMessage)
    }
  }, [activeGroup])

  // 5. Open Create Group Modal
  const openCreateModal = async () => {
    setShowCreateModal(true)
    setNewGroupName('')
    setSelectedUserIds([])
    setCreateError('')
    try {
      const res = await apiRequest<{ data: DiscoverUser[] }>('GET', '/user')
      if (res?.data) {
        setAvailableUsers(res.data)
      }
    } catch (err) {
      console.error('Failed to load available users:', err)
    }
  }

  // 6. Handle Create Group Submit
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')

    if (!newGroupName.trim()) {
      setCreateError('Please enter a group name')
      return
    }
    if (selectedUserIds.length === 0) {
      setCreateError('Please select at least one member')
      return
    }

    setCreatingGroup(true)
    try {
      const res = await apiRequest<{ data: GroupThread }>('POST', '/group', {
        name: newGroupName.trim(),
        memberIds: selectedUserIds,
      })

      if (res?.data) {
        setGroups((prev) => deduplicateGroups([res.data, ...prev]))
        setActiveGroup(res.data)
        setShowCreateModal(false)
      }
    } catch (err: unknown) {
      setCreateError((err as Error).message || 'Failed to create group')
    } finally {
      setCreatingGroup(false)
    }
  }

  // 7. Toggle member selection checkbox
  const toggleMemberSelection = (uid: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    )
  }

  // 8. Send message in group via Socket.IO
  const handleSendMessage = async (content: string) => {
    if (!activeGroup || !content.trim()) return

    setSending(true)
    const trimmed = content.trim()
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const socket = getSocket(token)

    try {
      if (socket && socket.connected) {
        socket.emit(
          'send_message',
          { threadId: activeGroup.id, content: trimmed },
          (res: { success: boolean; data?: MessageItem; error?: string }) => {
            if (res?.success && res.data) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === res.data!.id)) return prev
                return [...prev, res.data!]
              })
            }
          }
        )
      } else {
        const res = await apiRequest<{ data: MessageItem }>(
          'POST',
          '/message',
          { threadId: activeGroup.id, content: trimmed }
        )
        if (res?.data) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === res.data.id)) return prev
            return [...prev, res.data]
          })
        }
      }
    } catch (err) {
      console.error('Failed to send group message:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="w-full h-full flex bg-gray-50 overflow-hidden relative">
      {/* Left Groups Sidebar */}
      <div className="w-1/3 min-w-[300px] max-w-[360px] h-full bg-white border-r border-gray-200 flex flex-col p-4 shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Groups</h2>
          <button
            onClick={openCreateModal}
            className="px-3 py-1.5 rounded-xl bg-[#1a0033] hover:bg-[#2a0a4d] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
          >
            <span>+</span>
            <span>New Group</span>
          </button>
        </div>

        {/* Groups List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {loadingGroups ? (
            <div className="p-4 text-center text-xs text-gray-400">
              Loading groups...
            </div>
          ) : groups.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto mb-3 text-xl font-bold">
                👥
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-1">
                No groups yet
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Create a group to collaborate and chat with multiple team members.
              </p>
              <button
                onClick={openCreateModal}
                className="px-4 py-2 rounded-xl bg-[#1a0033] text-white text-xs font-semibold hover:bg-[#2a0a4d] transition"
              >
                Create First Group
              </button>
            </div>
          ) : (
            deduplicateGroups(groups).map((group) => {
              const isActive = activeGroup?.id === group.id
              const lastMsg = group.messages?.[0]
              const memberCount = group.participants?.length || 0

              return (
                <div
                  key={group.id}
                  onClick={() => setActiveGroup(group)}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition ${
                    isActive
                      ? 'bg-purple-50 border border-purple-100'
                      : 'hover:bg-gray-100/80'
                  }`}
                >
                  {/* Group Avatar */}
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 shadow-xs border border-gray-100">
                    <img
                      src="/group-avatar.svg"
                      alt={group.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Group Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {group.name}
                      </p>
                      {lastMsg && (
                        <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                          {formatTime(lastMsg.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-purple-700/80 font-medium">
                      {memberCount} members
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {lastMsg
                        ? `${lastMsg.sender?.profile?.name || 'Member'}: ${lastMsg.content}`
                        : 'No messages yet'}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right Group Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-white relative min-w-0">
        {activeGroup ? (
          <>
            {/* Group Header */}
            {(() => {
              const typingUserIdsInActiveGroup = activeGroup
                ? Array.from(typingUsers[activeGroup.id] || []).filter(
                    (uid) => uid !== currentUserId
                  )
                : []

              const typingMemberNames = typingUserIdsInActiveGroup
                .map(
                  (uid) =>
                    activeGroup?.participants.find((p) => p.userId === uid)
                      ?.user?.profile?.name || 'Member'
                )
                .join(', ')

              const onlineMemberCount = activeGroup
                ? activeGroup.participants.filter((p) =>
                    onlineUserIds.has(p.userId)
                  ).length
                : 0

              return (
                <div className="h-[70px] shrink-0 border-b border-gray-200 bg-white px-6 flex items-center justify-between shadow-xs z-10">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full overflow-hidden shadow-xs shrink-0 border border-gray-100">
                      <img
                        src="/group-avatar.svg"
                        alt={activeGroup.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-gray-900 leading-tight truncate">
                        {activeGroup.name}
                      </h2>
                      {typingUserIdsInActiveGroup.length > 0 ? (
                        <p className="text-xs font-semibold text-purple-600 flex items-center gap-1 animate-pulse truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-ping" />
                          {typingMemberNames} {typingUserIdsInActiveGroup.length === 1 ? 'is' : 'are'} typing...
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 truncate">
                          {activeGroup.participants
                            .map((p) => p.user?.profile?.name || 'Member')
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {onlineMemberCount} Online
                    </span>
                    <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-xs font-semibold">
                      {activeGroup.participants.length} Members
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* Messages Feed */}
            <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4 bg-gray-50/60">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  Loading group messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-3 text-xl">
                    💬
                  </div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-1">
                    No messages in this group yet
                  </h4>
                  <p className="text-xs text-gray-400 max-w-xs">
                    Say hello to start the discussion with your team!
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const isMine = message.senderId === currentUserId
                  const senderName =
                    message.sender?.profile?.name ||
                    activeGroup.participants.find((p) => p.userId === message.senderId)?.user?.profile?.name ||
                    'Member'

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-md rounded-2xl px-4 py-2.5 shadow-xs text-sm break-words ${
                          isMine
                            ? 'bg-[#1a0033] text-white rounded-br-xs'
                            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-xs'
                        }`}
                      >
                        {/* Show sender name for incoming messages in group */}
                        {!isMine && (
                          <p className="text-[11px] font-bold text-purple-700 mb-1">
                            {senderName}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <div
                          className={`flex justify-end text-[10px] mt-1 ${
                            isMine ? 'text-gray-300' : 'text-gray-400'
                          }`}
                        >
                          <span>{formatTime(message.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              {/* Dynamic Typing Indicator in Group Message Feed */}
              {(() => {
                const typingUserIdsInActiveGroup = activeGroup
                  ? Array.from(typingUsers[activeGroup.id] || []).filter(
                      (uid) => uid !== currentUserId
                    )
                  : []

                if (typingUserIdsInActiveGroup.length === 0) return null

                const typingMemberNames = typingUserIdsInActiveGroup
                  .map(
                    (uid) =>
                      activeGroup?.participants.find((p) => p.userId === uid)
                        ?.user?.profile?.name || 'Member'
                  )
                  .join(', ')

                return (
                  <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white text-gray-600 text-xs w-fit shadow-2xs border border-gray-200/60 animate-fade-in">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" />
                    </span>
                    <span className="font-medium text-xs text-gray-700">
                      {typingMemberNames}{' '}
                      {typingUserIdsInActiveGroup.length === 1
                        ? 'is'
                        : 'are'}{' '}
                      typing...
                    </span>
                  </div>
                )
              })()}
              <div ref={scrollRef} />
            </div>

            {/* Input Bar */}
            <div className="shrink-0 border-t border-gray-100 z-10">
              <ChatInput
                onSendMessage={handleSendMessage}
                onTyping={() => {
                  if (activeGroup) {
                    const token =
                      typeof window !== 'undefined'
                        ? localStorage.getItem('token') || ''
                        : ''
                    const socket = getSocket(token)
                    socket.emit('typing_start', { threadId: activeGroup.id })
                  }
                }}
                onStopTyping={() => {
                  if (activeGroup) {
                    const token =
                      typeof window !== 'undefined'
                        ? localStorage.getItem('token') || ''
                        : ''
                    const socket = getSocket(token)
                    socket.emit('typing_stop', { threadId: activeGroup.id })
                  }
                }}
                disabled={sending}
              />
            </div>
          </>
        ) : (
          /* Empty State when no group is opened */
          <div className="flex-1 flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50/40">
            <div className="w-16 h-16 rounded-2xl bg-purple-100/70 text-purple-700 flex items-center justify-center mb-4 text-2xl shadow-xs">
              👥
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              Select a group or create one
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Collaborate and chat with multiple team members in real time.
            </p>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Create New Group</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Engineering Team"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 outline-none text-sm text-gray-800 focus:bg-white focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                  Select Members ({selectedUserIds.length} selected)
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-gray-100 rounded-xl p-2 bg-gray-50/50">
                  {availableUsers.length === 0 ? (
                    <div className="p-3 text-center text-xs text-gray-400">
                      No other users found
                    </div>
                  ) : (
                    availableUsers.map((user) => {
                      const isSelected = selectedUserIds.includes(user.userId)
                      return (
                        <div
                          key={user.userId}
                          onClick={() => toggleMemberSelection(user.userId)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                            isSelected
                              ? 'bg-purple-50 border border-purple-200'
                              : 'hover:bg-white border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-900">
                                {user.name}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                @{user.username}
                              </p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4 pointer-events-none"
                          />
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {createError && (
                <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                  {createError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1a0033] hover:bg-[#2a0a4d] text-white transition disabled:opacity-50"
                >
                  {creatingGroup ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
