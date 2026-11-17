const rawBaseUrl: string =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const baseUrl: string = rawBaseUrl.endsWith('/')
  ? rawBaseUrl.slice(0, -1)
  : rawBaseUrl

export async function apiRequest<T = Record<string, unknown>>(
  method: string,
  endPoint: string,
  bodyData?: Record<string, unknown>
): Promise<T> {
  const token: string | null =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const options: RequestInit = {
    method,
    headers: { 'Content-type': 'application/json' },
    credentials: 'include',
  }
  if (bodyData) {
    options.body = JSON.stringify(bodyData)
  }
  if (token) {
    (options.headers as Record<string, string>).authorization = `Bearer ${token}`
  }
  const normalizedEndpoint = endPoint.startsWith('/') ? endPoint : `/${endPoint}`
  const response: Response = await fetch(baseUrl + normalizedEndpoint, options)
  let data: T
  try {
    data = (await response.json()) as T
  } catch {
    data = {} as T
  }

  if (!response.ok) {
    throw new Error((data as Record<string, unknown>).message as string)
  }
  return data
}
