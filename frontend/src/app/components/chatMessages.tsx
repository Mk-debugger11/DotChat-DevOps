'use client'

import React, { useEffect, useRef } from 'react'

export interface MessageItem {
  id: string
  content: string
  senderId: string
  threadId: string
  createdAt: string
  isRead?: boolean
  readBy?: string[]
}

interface ChatMessagesProps {
  messages: MessageItem[]
  currentUserId: string
  otherUserName: string
  loading?: boolean
  isRecipientOnline?: boolean
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function ChatMessages({
  messages,
  currentUserId,
  otherUserName,
  loading = false,
  isRecipientOnline = false,
}: ChatMessagesProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full p-6 text-gray-400">
        <div className="text-sm">Loading messages...</div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-3 font-semibold text-lg">
          💬
        </div>
        <h4 className="text-sm font-semibold text-gray-800 mb-1">
          No messages here yet
        </h4>
        <p className="text-xs text-gray-400 max-w-xs">
          Send a message below to start your conversation with {otherUserName}!
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4 bg-gray-50/60 min-h-full">
      {messages.map((message) => {
        const isMine = message.senderId === currentUserId

        return (
          <div
            key={message.id}
            className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-md rounded-2xl px-4 py-2.5 shadow-xs text-sm break-words
                ${
                  isMine
                    ? 'bg-[#1a0033] text-white rounded-br-xs'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-xs'
                }
              `}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              <div
                className={`flex items-center justify-end gap-1.5 text-[10px] mt-1 select-none ${
                  isMine ? 'text-purple-200/80' : 'text-gray-400'
                }`}
              >
                <span>{formatTime(message.createdAt)}</span>
                {isMine && (
                  <span
                    className="inline-flex items-center ml-0.5"
                    title={
                      message.isRead
                        ? 'Read'
                        : isRecipientOnline
                        ? 'Delivered'
                        : 'Sent'
                    }
                  >
                    {message.isRead ? (
                      /* Read: Double Blue Checkmark */
                      <svg
                        className="w-4 h-2.5 shrink-0"
                        viewBox="0 0 16 11"
                        fill="none"
                        stroke="#34b7f1"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1.5 6L4.5 9L10.5 2.5" />
                        <path d="M6 6L9 9L15 2.5" />
                      </svg>
                    ) : isRecipientOnline ? (
                      /* Delivered: Double Grey Checkmark */
                      <svg
                        className="w-4 h-2.5 shrink-0"
                        viewBox="0 0 16 11"
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1.5 6L4.5 9L10.5 2.5" />
                        <path d="M6 6L9 9L15 2.5" />
                      </svg>
                    ) : (
                      /* Sent: Single Grey Checkmark */
                      <svg
                        className="w-3.5 h-2.5 shrink-0"
                        viewBox="0 0 12 11"
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 6L5 9L10.5 2.5" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={scrollRef} />
    </div>
  )
}
