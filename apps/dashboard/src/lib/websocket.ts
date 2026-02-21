'use client'

type WebSocketEventType =
  | 'balance.updated'
  | 'transaction.created'
  | 'transaction.updated'
  | 'approval.required'
  | 'payment_request.received'

interface WebSocketEvent {
  type: WebSocketEventType
  data: any
  timestamp: string
}

type EventHandler = (event: WebSocketEvent) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private handlers: Map<WebSocketEventType, Set<EventHandler>> = new Map()
  private token: string | null = null
  private url: string

  constructor() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    this.url = apiUrl.replace('http', 'ws')
  }

  connect(token: string) {
    this.token = token
    this.createConnection()
  }

  private createConnection() {
    if (!this.token) return

    try {
      this.ws = new WebSocket(`${this.url}/ws?token=${this.token}`)

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.reconnectAttempts = 0
        this.reconnectDelay = 1000
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketEvent = JSON.parse(event.data)
          this.handleEvent(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.reconnect()
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      this.reconnect()
    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      this.createConnection()
    }, delay)
  }

  private handleEvent(event: WebSocketEvent) {
    const handlers = this.handlers.get(event.type)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event)
        } catch (error) {
          console.error('Error in event handler:', error)
        }
      })
    }
  }

  on(eventType: WebSocketEventType, handler: EventHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)
  }

  off(eventType: WebSocketEventType, handler: EventHandler) {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.handlers.clear()
  }
}

export const websocketClient = new WebSocketClient()
export type { WebSocketEvent, WebSocketEventType }
