export type EventHandler = (data: any) => void;

/**
 * WebSocket manager for per-session connections to the Go backend.
 * Each conversation gets its own WebSocket connection to /api/v1/chat/ws/{session_id}
 */
class SessionWSManager {
  private connections: Map<string, WebSocket> = new Map();
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private urlBase: string;
  private reconnectTimers: Map<string, number> = new Map();
  private shouldReconnect: Map<string, boolean> = new Map();
  private sessionModels: Map<string, string> = new Map(); // Track model per session

  constructor(urlBase: string) {
    // Convert http/https to ws/wss
    this.urlBase = urlBase.startsWith("https") 
      ? urlBase.replace("https", "wss") 
      : urlBase.replace("http", "ws");
  }

  /**
   * Connect to a specific session's WebSocket endpoint
   */
  private async connect(sessionId: string, modelId?: string): Promise<WebSocket> {
    // Check if already connected
    const existing = this.connections.get(sessionId);
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return existing;
    }

    // Get Firebase token for authentication
    const { auth } = await import("@/lib/firebase");
    const user = auth.currentUser;
    let token = "";
    
    if (user) {
      try {
        token = await user.getIdToken();
      } catch (error) {
        console.error("[WS] Failed to get Firebase token:", error);
      }
    }

    // Create WebSocket URL matching Go backend: /api/v1/chat/ws/{session_id}
    let wsUrl = `${this.urlBase}/api/v1/chat/ws/${sessionId}`;
    
    console.log(`[WS] Model ID received:`, modelId, 'Type:', typeof modelId);
    
    // Add query parameters (model and token)
    const params = new URLSearchParams();
    if (modelId) {
      console.log(`[WS] Adding model parameter:`, modelId);
      params.append('model', modelId);
    } else {
      console.log(`[WS] No model ID provided, using backend default`);
    }
    if (token) {
      params.append('token', token);
    }
    
    if (params.toString()) {
      wsUrl += `?${params.toString()}`;
    }
    
    console.log(`[WS] Connecting to: ${wsUrl.replace(token, 'TOKEN_HIDDEN')}`);
    
    const ws = new WebSocket(wsUrl);
    this.connections.set(sessionId, ws);
    this.shouldReconnect.set(sessionId, true);

    ws.onopen = () => {
      console.log(`[WS] Connected to session: ${sessionId}`);
      // Clear any reconnect timer
      const timer = this.reconnectTimers.get(sessionId);
      if (timer !== undefined) {
        clearTimeout(timer);
        this.reconnectTimers.delete(sessionId);
      }
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string);
        console.log(`[WS] Message received:`, data.type || 'unknown');
        
        // Dispatch to all handlers for this session
        const listeners = this.handlers.get(sessionId);
        if (listeners && listeners.size > 0) {
          for (const fn of listeners) {
            try {
              fn(data);
            } catch (error) {
              console.error('[WS] Handler error:', error);
            }
          }
        }
      } catch (error) {
        console.error('[WS] Failed to parse message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log(`[WS] Disconnected from session ${sessionId}:`, {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        url: wsUrl
      });
      this.connections.delete(sessionId);
      
      // Attempt reconnect if there are still active handlers and reconnect is enabled
      const hasHandlers = this.handlers.get(sessionId)?.size || 0 > 0;
      const shouldReconnect = this.shouldReconnect.get(sessionId);
      
      if (hasHandlers && shouldReconnect) {
        console.log(`[WS] Scheduling reconnect for session ${sessionId}...`);
        const timer = window.setTimeout(() => {
          this.reconnectTimers.delete(sessionId);
          // Reconnect with the same model that was used initially
          const model = this.sessionModels.get(sessionId);
          this.connect(sessionId, model);
        }, 2000);
        this.reconnectTimers.set(sessionId, timer);
      }
    };

    ws.onerror = (event) => {
      console.error(`[WS] Connection error on session ${sessionId}:`, {
        type: event.type,
        target: event.target,
        wsUrl: wsUrl,
        readyState: ws.readyState
      });
    };

    return ws;
  }

  /**
   * Subscribe to WebSocket events for a specific session
   */
  async subscribe(sessionId: string, handler: EventHandler, modelId?: string): Promise<() => void> {
    if (!sessionId) {
      console.warn('[WS] Cannot subscribe without session ID');
      return () => {};
    }

    // Add handler to the set
    if (!this.handlers.has(sessionId)) {
      this.handlers.set(sessionId, new Set());
    }
    const set = this.handlers.get(sessionId)!;
    set.add(handler);

    // Store model ID for this session (for reconnection)
    if (modelId) {
      this.sessionModels.set(sessionId, modelId);
    }

    // Connect to WebSocket with optional model
    await this.connect(sessionId, modelId);

    // Return unsubscribe function
    return () => {
      const listeners = this.handlers.get(sessionId);
      if (!listeners) return;
      
      listeners.delete(handler);
      
      // If no more listeners, close the connection
      if (listeners.size === 0) {
        console.log(`[WS] No more listeners for session ${sessionId}, closing connection`);
        this.handlers.delete(sessionId);
        this.shouldReconnect.set(sessionId, false);
        this.sessionModels.delete(sessionId); // Clear stored model
        
        const ws = this.connections.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'No more listeners');
        }
        this.connections.delete(sessionId);
        
        // Clear reconnect timer
        const timer = this.reconnectTimers.get(sessionId);
        if (timer !== undefined) {
          clearTimeout(timer);
          this.reconnectTimers.delete(sessionId);
        }
      }
    };
  }

  /**
   * Send a message to a specific session's WebSocket
   */
  send(sessionId: string, data: any): boolean {
    const ws = this.connections.get(sessionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error(`[WS] Cannot send message - not connected to session ${sessionId}`);
      return false;
    }

    try {
      ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error(`[WS] Failed to send message:`, error);
      return false;
    }
  }

  /**
   * Close a specific session's WebSocket connection
   */
  close(sessionId: string) {
    this.shouldReconnect.set(sessionId, false);
    const ws = this.connections.get(sessionId);
    if (ws) {
      ws.close(1000, 'Manual close');
      this.connections.delete(sessionId);
    }
    this.handlers.delete(sessionId);
    this.sessionModels.delete(sessionId); // Clear stored model
    
    const timer = this.reconnectTimers.get(sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.reconnectTimers.delete(sessionId);
    }
  }

  /**
   * Get the current connection state for a session
   */
  getState(sessionId: string): number {
    const ws = this.connections.get(sessionId);
    return ws?.readyState ?? WebSocket.CLOSED;
  }
}

// Factory function to create WebSocket manager
export function createWSManager(host: string) {
  return new SessionWSManager(host);
}
