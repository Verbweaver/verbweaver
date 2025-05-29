import React from 'react';
import { create } from 'zustand';
import { WebSocketEventType, getWsUrl } from '@verbweaver/shared';
import { useNodeStore } from '../store/nodeStore';
import toast from 'react-hot-toast';

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

    // Create new WebSocket connection with dynamic URL
    const wsUrl = getWsUrl();
    const ws = new WebSocket(`${wsUrl}/${projectId}?token=${accessToken}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      set({ socket: ws, isConnected: true, connectionError: null });
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
  const { type, data, event, path, timestamp } = message;

  switch (type) {
    case 'connection':
      console.log('WebSocket connection status:', data);
      break;
      
    case 'file_change':
      console.log('File change detected:', event, path);
      // Reload nodes when files change
      const nodeStore = useNodeStore.getState();
      nodeStore.loadNodes().then(() => {
        // Show a subtle notification
        if (event === 'modified') {
          toast.success(`File updated: ${path.split('/').pop()}`, {
            duration: 2000,
            position: 'bottom-right'
          });
        } else if (event === 'created') {
          toast.success(`File created: ${path.split('/').pop()}`, {
            duration: 2000,
            position: 'bottom-right'
          });
        } else if (event === 'deleted') {
          toast.error(`File deleted: ${path.split('/').pop()}`, {
            duration: 2000,
            position: 'bottom-right'
          });
        }
      });
      break;
      
    case 'refresh_required':
      console.log('Refresh required');
      // Reload all data
      const store = useNodeStore.getState();
      store.loadNodes();
      break;
      
    case 'pong':
      // Response to ping, connection is alive
      break;
      
    case 'error':
      console.error('WebSocket error:', data);
      toast.error(data.message || 'WebSocket error occurred');
      break;
      
    // Legacy event types (for backwards compatibility)
    case WebSocketEventType.USER_JOIN:
      console.log('User joined:', data);
      break;
      
    case WebSocketEventType.USER_LEAVE:
      console.log('User left:', data);
      break;
      
    case WebSocketEventType.CURSOR_MOVE:
      // Update other users' cursor positions
      break;
      
    case WebSocketEventType.NODE_CREATE:
      // Add new node to graph
      useNodeStore.getState().loadNodes();
      break;
      
    case WebSocketEventType.NODE_UPDATE:
      // Update existing node
      useNodeStore.getState().loadNodes();
      break;
      
    case WebSocketEventType.NODE_DELETE:
      // Remove node from graph
      useNodeStore.getState().loadNodes();
      break;
      
    case WebSocketEventType.EDGE_CREATE:
      // Add new edge to graph
      useNodeStore.getState().loadNodes();
      break;
      
    case WebSocketEventType.EDGE_DELETE:
      // Remove edge from graph
      useNodeStore.getState().loadNodes();
      break;
      
    case WebSocketEventType.FILE_UPDATE:
      // Update file content
      useNodeStore.getState().loadNodes();
      break;
      
    case WebSocketEventType.TASK_CREATE:
    case WebSocketEventType.TASK_UPDATE:
    case WebSocketEventType.TASK_MOVE:
    case WebSocketEventType.TASK_DELETE:
      // Reload nodes since tasks are nodes
      useNodeStore.getState().loadNodes();
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
      
      // Set up ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        send({ type: 'ping' });
      }, 30000); // Ping every 30 seconds
      
      return () => {
        clearInterval(pingInterval);
        disconnect();
      };
    }
  }, [projectId, connect, disconnect, send]);

  return { send, isConnected };
} 