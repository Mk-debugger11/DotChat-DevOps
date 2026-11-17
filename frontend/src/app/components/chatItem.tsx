import React from 'react'

interface ChatItemProps {
  name: string
  username?: string
  message: string
  time?: string
  unread?: boolean
  unreadCount?: number
  active?: boolean
  avatarUrl?: string | null
  isOnline?: boolean
  isTyping?: boolean
  onClick?: () => void
}

export default function ChatItem({
  name,
  username,
  message,
  time,
  unread,
  unreadCount = 0,
  active,
  avatarUrl,
  isOnline,
  isTyping = false,
  onClick,
}: ChatItemProps): React.JSX.Element {
  const initial = (name || '?').charAt(0).toUpperCase()
  const hasUnread = Boolean(unread || unreadCount > 0)

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors
        ${active ? 'bg-purple-50 border border-purple-100' : 'hover:bg-gray-100/80'}
      `}
    >
      <div className="relative shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-10 h-10 rounded-full object-cover bg-gray-200"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-semibold text-sm">
            {initial}
          </div>
        )}
        {typeof isOnline === 'boolean' && (
          <span
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white transition-colors duration-200 ${
              isOnline ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
            title={isOnline ? 'Online' : 'Offline'}
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          {time && (
            <span
              className={`text-xs shrink-0 ml-2 ${
                hasUnread
                  ? 'text-emerald-600 font-semibold'
                  : 'text-gray-400 font-normal'
              }`}
            >
              {time}
            </span>
          )}
        </div>
        {username && (
          <p className="text-xs text-gray-400 truncate">@{username}</p>
        )}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          {isTyping ? (
            <p className="text-xs text-purple-600 font-medium flex items-center gap-1.5 truncate">
              <span className="flex items-center gap-0.5">
                <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" />
              </span>
              <span>typing...</span>
            </p>
          ) : (
            <p
              className={`text-xs truncate ${
                hasUnread
                  ? 'text-gray-900 font-semibold'
                  : 'text-gray-500 font-normal'
              }`}
            >
              {message}
            </p>
          )}

          {unreadCount > 0 ? (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-xs">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : unread ? (
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0" />
          ) : null}
        </div>
      </div>
    </div>
  )
}
