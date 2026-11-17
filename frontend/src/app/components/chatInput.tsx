'use client'

import React, { useState, useRef, useEffect } from 'react'

interface ChatInputProps {
  onSendMessage: (content: string) => Promise<void> | void
  onTyping?: () => void
  onStopTyping?: () => void
  disabled?: boolean
}

export default function ChatInput({
  onSendMessage,
  onTyping,
  onStopTyping,
  disabled = false,
}: ChatInputProps): React.JSX.Element {
  const [content, setContent] = useState<string>('')
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isTypingRef = useRef<boolean>(false)

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setContent(val)

    if (val.trim()) {
      if (!isTypingRef.current) {
        isTypingRef.current = true
        onTyping?.()
      }

      // Reset debounce timer
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false
        onStopTyping?.()
      }, 1500)
    } else {
      // Input is empty
      if (isTypingRef.current) {
        isTypingRef.current = false
        onStopTyping?.()
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || disabled) return

    // Immediately cancel typing on send
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    if (isTypingRef.current) {
      isTypingRef.current = false
      onStopTyping?.()
    }

    setContent('')
    await onSendMessage(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full px-6 py-3 bg-white">
      <div className="flex items-center gap-3 w-full rounded-full px-4 py-2 bg-gray-100 border border-gray-200 focus-within:border-purple-500 focus-within:bg-white transition-colors">
        <input
          type="text"
          value={content}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type a message..."
          className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400"
        />
        <button
          type="submit"
          disabled={disabled || !content.trim()}
          className="px-4 py-1.5 rounded-full text-xs font-semibold text-white bg-[#1a0033] hover:bg-[#2a0a4d] disabled:opacity-40 disabled:cursor-not-allowed transition shadow-xs"
        >
          Send
        </button>
      </div>
    </form>
  )
}
