import React from 'react'

export interface ChatHeaderUser {
  id: string
  name: string
  username: string
  avatarUrl?: string | null
}

interface ChatHeaderProps {
  user: ChatHeaderUser
  isOnline?: boolean
  isTyping?: boolean
}

export default function ChatHeader({
  user,
  isOnline = false,
  isTyping = false,
}: ChatHeaderProps): React.JSX.Element {
  const initial = (user.name || '?').charAt(0).toUpperCase()

  return (
    <div className="h-full w-full flex items-center justify-between px-6 border-b border-gray-200 bg-white shadow-xs">
      <div className="flex items-center gap-3">
        <div className="relative">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-11 h-11 rounded-full object-cover bg-gray-200 border border-gray-100"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-base border border-purple-200">
              {initial}
            </div>
          )}
          <span
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white transition-colors duration-200 ${
              isOnline ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
            title={isOnline ? 'Online' : 'Offline'}
          />
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900 leading-tight">
            {user.name}
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-xs text-gray-400">@{user.username}</p>
            <span className="text-gray-300 text-xs">•</span>
            {isTyping ? (
              <span className="text-xs font-semibold text-purple-600 flex items-center gap-1 animate-pulse">
                typing...
              </span>
            ) : isOnline ? (
              <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            ) : (
              <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                Offline
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isTyping ? (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium border border-purple-100 animate-pulse">
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" />
            </span>
            <span>Typing...</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-50 border border-gray-200/60">
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            />
            <span className="text-xs font-medium text-gray-600">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
