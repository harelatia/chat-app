Chat App

A real-time chat application built with FastAPI (backend), React (frontend), and Docker Compose.

Features

User Authentication: Signup and login functionality

Real-Time Messaging: Powered by Socket.IO for instant chat

Multiple Chat Rooms: Create or join different chat rooms

Persistent Storage: PostgreSQL to store users and messages

Search: Elasticsearch integration for message search

Dockerized: Easy setup and deployment with Docker Compose

Tech Stack

Backend: Python, FastAPI, Socket.IO, Uvicorn

Frontend: React, Material-UI

Database: PostgreSQL

Search: Elasticsearch

Containerization: Docker, Docker Compose

Architecture

flowchart LR
    FE[Frontend
(React UI)] --> BE[Backend
(FastAPI + Socket.IO)]
    BE --> DB[(PostgreSQL)]
    BE --> ES[(Elasticsearch)]

Frontend: Hosts the React application, connects to the backend via WebSockets and REST endpoints.

Backend: FastAPI server handling authentication, message routing via Socket.IO, RESTful APIs, and search queries.

Database: PostgreSQL stores user accounts, room metadata, and chat messages.

Search: Elasticsearch indexes messages for full-text search within chat rooms.

Networking: All services join chatnet allowing inter-service communication by container name.

Prerequisites

Docker

Docker Compose

Git

Getting Started

Clone the repository

git clone https://github.com/your-username/chat-app.git
cd chat-app

Environment Variables

Environment files are located per service:

backend/.env (example: .env.txt)

frontend/.env.local

Example (backend/.env):

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=chat
POSTGRES_HOST=database
POSTGRES_PORT=5432
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ES_HOST=http://elasticsearch:9200

Example (frontend/.env.local):

REACT_APP_SOCKET_SERVER_URL=http://localhost:4000

Build and Run

docker-compose up --build

Access the Application

Frontend: http://localhost:3000

Backend API Docs: http://localhost:4000/docs

Project Structure

./
├── backend/             # FastAPI backend service
│   ├── .env             # Local environment variables (gitignored)
│   ├── .env.txt         # Example env file
│   ├── app/             # Application code (routers, models, services)
│   ├── fallback.db      # SQLite fallback DB (if used)
│   ├── Dockerfile       # Dockerfile for backend
│   └── requirements.txt # Python dependencies
├── elasticsearch/       # Elasticsearch service
│   ├── config/          # Elasticsearch configuration files
│   └── Dockerfile       # Dockerfile for Elasticsearch
├── frontend/            # React frontend service
│   ├── .env.local       # Local environment variables (gitignored)
│   ├── Dockerfile       # Dockerfile for frontend
│   ├── public/          # Static assets
│   ├── src/             # React source code
│   ├── package.json     # npm dependencies and scripts
│   ├── package-lock.json
│   └── .gitignore
├── node_modules/        # (generated after npm install)
├── docker-compose.yml   # Docker Compose configuration
├── package.json         # Root-level npm config (if used)
├── package-lock.json
└── .gitignore           # Git ignore rules

Development Scripts

Backend (Local without Docker)

cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 4000

Frontend (Local without Docker)

cd frontend
npm install
npm start

Common Issues & Troubleshooting

Permission denied: react-scripts

Run chmod -R 755 frontend/node_modules/.bin or rebuild the frontend image.

Database Connection Errors

Verify that the database service is running and environment variables match.

Elasticsearch Not Starting

Check elasticsearch/config/ files and adjust heap settings if necessary.

Environment Variables Not Loading

Ensure .env and .env.local are in place and Docker Compose is configured to load them.

Backend Service Fails to Start

If docker-compose up doesn’t always spin up the backend, run:

docker-compose up -d backend

Contributing

Contributions are welcome! Please:

Fork the repository

Create a feature branch (git checkout -b feature/YourFeature)

Commit your changes (git commit -m "Add YourFeature")

Push to the branch (git push origin feature/YourFeature)

Open a Pull Request

License

This project is licensed under the MIT License. Feel free to use and modify it for your own needs.

