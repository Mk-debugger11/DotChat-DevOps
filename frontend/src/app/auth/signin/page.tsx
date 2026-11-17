'use client'
import React, { useState } from 'react'
import { apiRequest } from '@/app/utils/api';
import Spinner from '../../components/spinner'
import Link from 'next/link';
import { useAuthStore } from '@/app/store/authStore';
import { useRouter } from 'next/navigation';

import { promptGoogleLogin } from '@/app/utils/googleAuth';

interface LoginResponse {
  token: string;
  message: string;
}

export default function SignIn(): React.JSX.Element {
  const router = useRouter()
  const setToken = useAuthStore((state) => state.setToken)
  const method: string = 'POST'
  const endPoint: string = '/auth/login'
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [googleLoading, setGoogleLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [showPass, setShowPass] = useState<boolean>(false)
  
  async function handleGoogleSignIn(): Promise<void> {
    setError('')
    setGoogleLoading(true)
    try {
      const authData = await promptGoogleLogin()
      const data = await apiRequest<LoginResponse>('POST', '/auth/google', authData)
      if (data?.token) {
        setToken(data.token)
        localStorage.setItem('token', data.token)
        router.push('/messages')
      }
    } catch (err) {
      setError((err as Error).message || 'Google sign-in failed')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function sendRequest(s: React.FormEvent<HTMLFormElement>): Promise<void> {
    s.preventDefault()
    setError('')
    setLoading(true)
    const bodyData = {
      "email": email,
      "password": password
    }
    try {
      const data = await apiRequest<LoginResponse>(method, endPoint, bodyData)
      setLoading(false)
      setEmail('')
      setPassword('')
      setToken(data.token)
      router.push('/')
    } catch (error) {
      setError((error as Error).message)
      setLoading(false)
    }
  }
  return (
    <div className="w-full max-w-md">
      <h2 className="text-3xl font-semibold text-gray-900">
        Sign in to your account
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        Welcome back! Please enter your details.
      </p>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
        className="
          mt-6 w-full
          border border-gray-300
          rounded-lg
          py-3
          flex items-center justify-center gap-3
          text-sm font-medium
          hover:bg-gray-50
          transition
          cursor-pointer
          disabled:opacity-60 disabled:cursor-not-allowed
        ">
        {googleLoading ? (
          <Spinner />
        ) : (
          <>
            <img src="/google.png" className='w-5' alt="Google" />
            <p>Continue with Google</p>
          </>
        )}
      </button>

      <div className="my-6 flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-300" />
        <span className="text-xs text-gray-400">OR</span>
        <div className="flex-1 h-px bg-gray-300" />
      </div>

      <form className="space-y-4" onSubmit={sendRequest}>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value) }}
            className="
              mt-1 w-full
              border border-gray-300
              rounded-lg
              px-4 py-3
              text-sm
              focus:outline-none
              focus:ring-2 focus:ring-[#1a0033]
              focus:border-transparent
            "
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <div className="relative mt-1">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              placeholder="••••••••"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              className="
                w-full
                border border-gray-300
                rounded-lg
                px-4 py-3
                pr-12
                text-sm
                focus:outline-none
                focus:ring-2 focus:ring-[#1a0033]
                focus:border-transparent"
            />

            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="
                absolute
                right-3
                top-1/2
                -translate-y-1/2
                text-gray-500
                hover:text-gray-700
                focus:outline-none"
            >
              {showPass
                ? (<img src="/hide.png" className='w-5' />)
                : (<img src='/view.png' className='w-5' />)
              }
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button className="text-sm text-[#1a0033] hover:underline">
            Forgot password?
          </button>
        </div>
        {error && (
          <p
            className="
              mt-3
              text-sm
              text-red-600
              bg-red-50
              border border-red-200
              rounded-md
              px-3 py-2">
            {error}
          </p>
        )}
        <button
          disabled={loading}
          type='submit'
          className="
            w-full
            bg-[#1a0033]
            text-white
            py-3
            rounded-lg
            font-medium
            hover:bg-[#24004a]
            transition
            cursor-pointer
            disabled:bg-gray-400
            disabled:text-gray-700
            disabled:cursor-not-allowed
          "
        >
          {loading ?
            (<div className='flex justify-center gap-3 items-center'><Spinner /><span> Signing In </span></div>) : 'Sign In'}
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-500 text-center">
        Don&apos;t have an account?{" "}
        <span className="text-[#1a0033] font-medium cursor-pointer hover:underline">
          <Link href='/auth/signup'>Sign Up</Link>
        </span>
      </p>

    </div>
  );
}
