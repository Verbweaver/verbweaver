import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './styles/index.css'
<<<<<<< HEAD
=======
import './index.css'
>>>>>>> release-testing

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

// Clear localStorage for desktop users to prevent auth conflicts
if (typeof window !== 'undefined' && window.electronAPI !== undefined) {
  localStorage.removeItem('auth-storage');
  console.log('Cleared localStorage for desktop app');
}

const Router = (window as any).electronAPI ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#333',
              color: '#fff',
            },
          }}
        />
      </Router>
    </QueryClientProvider>
  </React.StrictMode>,
) 