import React from 'react';
import { create } from 'zustand';
import { WebSocketEventType } from '@verbweaver/shared';

interface WebSocketState {
  socket: WebSocket | null;
  isConnected: boolean;
  connectionError: string | null;
  connect: (projectId: string) => void;
  disconnect: () => void;
  send: (event: any) => void;
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  connectionError: null,

  connect: (projectId: string) => {
    const { socket, disconnect } = get();
    
    // Disconnect existing connection
    if (socket) {
      disconnect();
    }

    // Get auth token
    const token = localStorage.getItem('auth-storage');
    let accessToken = null;
    
    if (token) {
      try {
        const authData = JSON.parse(token);
        accessToken = authData.state?.accessToken;
      } catch (error) {
        console.error('Failed to parse auth token:', error);
      }
    }

    if (!accessToken) {
      set({ connectionError: 'No authentication token available' });
      return;
    }

    // Create new WebSocket connection
    const ws = new WebSocket(`${WS_URL}/${projectId}?token=${accessToken}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      set({ socket: ws, isConnected: true, connectionError: null });
      
      // Send initial join event
      ws.send(JSON.stringify({
        type: WebSocketEventType.USER_JOIN,
        data: { projectId }
      }));
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      set({ socket: null, isConnected: false });
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      set({ connectionError: 'WebSocket connection failed' });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    set({ socket: ws });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, isConnected: false });
    }
  },

  send: (event: any) => {
    const { socket, isConnected } = get();
    if (socket && isConnected) {
      socket.send(JSON.stringify(event));
    }
  }
}));

// Handle incoming WebSocket messages
function handleWebSocketMessage(message: any) {
  const { type, data } = message;

  switch (type) {
    case WebSocketEventType.USER_JOIN:
      console.log('User joined:', data);
      // Update UI to show new user
      break;
      
    case WebSocketEventType.USER_LEAVE:
      console.log('User left:', data);
      // Update UI to remove user
      break;
      
    case WebSocketEventType.CURSOR_MOVE:
      // Update other users' cursor positions
      break;
      
    case WebSocketEventType.NODE_CREATE:
      // Add new node to graph
      break;
      
    case WebSocketEventType.NODE_UPDATE:
      // Update existing node
      break;
      
    case WebSocketEventType.NODE_DELETE:
      // Remove node from graph
      break;
      
    case WebSocketEventType.EDGE_CREATE:
      // Add new edge to graph
      break;
      
    case WebSocketEventType.EDGE_DELETE:
      // Remove edge from graph
      break;
      
    case WebSocketEventType.FILE_UPDATE:
      // Update file content
      break;
      
    case WebSocketEventType.TASK_CREATE:
      // Add new task
      break;
      
    case WebSocketEventType.TASK_UPDATE:
      // Update existing task
      break;
      
    case WebSocketEventType.TASK_MOVE:
      // Move task to different column
      break;
      
    case WebSocketEventType.TASK_DELETE:
      // Remove task
      break;
      
    case WebSocketEventType.COMMENT_CREATE:
      // Add new comment
      break;
      
    case WebSocketEventType.TYPING_START:
      // Show typing indicator
      break;
      
    case WebSocketEventType.TYPING_STOP:
      // Hide typing indicator
      break;
      
    default:
      console.warn('Unknown WebSocket event type:', type);
  }
}

// Hook to use WebSocket in components
export function useWebSocket(projectId?: string) {
  const { connect, disconnect, send, isConnected } = useWebSocketStore();

  // Auto-connect when projectId changes
  React.useEffect(() => {
    if (projectId) {
      connect(projectId);
      return () => disconnect();
    }
  }, [projectId, connect, disconnect]);

  return { send, isConnected };
} 