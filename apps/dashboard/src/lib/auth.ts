import { cookies } from 'next/headers'
import { apiRequest } from './api'

export interface Owner {
  id: string
  email: string
  name: string
}

export async function getOwner(): Promise<Owner | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    
    if (!token) {
      return null
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return null
    }

    return response.json()
  } catch {
    return null
  }
}

export async function login(email: string, password: string): Promise<{ token: string; owner: Owner }> {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register(email: string, name: string, password: string): Promise<{ token: string; owner: Owner }> {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, name, password }),
  })
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('token')
}
