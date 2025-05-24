#!/bin/bash

echo -e "\033[36mStarting Verbweaver Development Servers...\033[0m"

# Function to cleanup on exit
cleanup() {
    echo -e "\n\033[33mStopping servers...\033[0m"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

trap cleanup EXIT INT TERM

# Start Backend
echo -e "\n\033[33mStarting Backend Server...\033[0m"
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

echo -e "\033[32mBackend server starting on http://localhost:8000\033[0m"

# Wait a bit for backend to start
sleep 3

# Start Frontend
echo -e "\n\033[33mStarting Frontend Server...\033[0m"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo -e "\033[32mFrontend server starting on http://localhost:5173\033[0m"

echo -e "\n\033[36mServers are starting...\033[0m"
echo -e "\033[90mBackend PID: $BACKEND_PID\033[0m"
echo -e "\033[90mFrontend PID: $FRONTEND_PID\033[0m"

echo -e "\n\033[33mWaiting for servers to be ready...\033[0m"
sleep 5

# Test if servers are running
echo -e "\n\033[33mTesting servers...\033[0m"

# Test backend
if curl -s http://localhost:8000/health > /dev/null; then
    echo -e "\033[32m✓ Backend is running on http://localhost:8000\033[0m"
else
    echo -e "\033[31m✗ Backend is not running\033[0m"
fi

# Test frontend
if curl -s http://localhost:5173 > /dev/null; then
    echo -e "\033[32m✓ Frontend is running on http://localhost:5173\033[0m"
else
    echo -e "\033[31m✗ Frontend is not running\033[0m"
fi

echo -e "\n\033[36mPress Ctrl+C to stop the servers\033[0m"

# Keep script running
wait 