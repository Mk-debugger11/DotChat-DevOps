declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential?: string }) => void
            auto_select?: boolean
          }) => void
          prompt: (notification?: (notification: unknown) => void) => void
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>
          ) => void
        }
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
            error_callback?: (error: unknown) => void
          }) => {
            requestAccessToken: () => void
          }
        }
      }
    }
  }
}

export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve()
    if (window.google?.accounts) return resolve()

    const existingScript = document.getElementById('google-gsi-client')
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve())
      existingScript.addEventListener('error', (e) => reject(e))
      return
    }

    const script = document.createElement('script')
    script.id = 'google-gsi-client'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = (err) => reject(err)
    document.body.appendChild(script)
  })
}

export async function promptGoogleLogin(): Promise<{
  credential?: string
  accessToken?: string
}> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  if (!clientId || !clientId.trim()) {
    throw new Error(
      'Google Client ID is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in frontend/.env.local'
    )
  }

  await loadGoogleScript()

  if (!window.google?.accounts) {
    throw new Error(
      'Google Sign-In SDK failed to load. Please check your internet connection.'
    )
  }

  return new Promise((resolve, reject) => {
    let settled = false

    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'email profile openid',
      callback: (tokenResponse) => {
        if (settled) return
        settled = true
        if (tokenResponse.error) {
          reject(new Error(`Google sign-in error: ${tokenResponse.error}`))
        } else if (tokenResponse.access_token) {
          resolve({ accessToken: tokenResponse.access_token })
        } else {
          reject(new Error('Google did not return an access token.'))
        }
      },
      error_callback: (err) => {
        if (settled) return
        settled = true
        reject(err || new Error('Google Sign-In popup was closed or cancelled.'))
      },
    })

    tokenClient.requestAccessToken()
  })
}
