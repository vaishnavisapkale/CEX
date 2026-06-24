# CEX Spot Exchange

A full-stack cryptocurrency exchange with a custom matching engine, real-time market data, and live order book updates.

## Features

* User Authentication (JWT)
* Buy & Sell Orders
* Market and Limit Orders
* Order Cancellation
* Real-time Order Book
* Live Trade Updates
* User Balances & Portfolio
* WebSocket Streaming

## Tech Stack

**Frontend**

* React
* TypeScript
* Vite

**Backend**

* Express
* WebSockets
* Redis
* Prisma

**Database**

* PostgreSQL (Neon)

## Architecture

```text
Frontend
   |
Backend API + WebSocket
   |
 Redis
   |
Matching Engine
   |
PostgreSQL
```

## Local Setup

```bash
# Backend
cd cex-v2-boilercode/backend
npm install
npm run dev

# Engine
cd cex-v2-boilercode/engine
npm install
npm run dev

# Frontend
cd cex-frontend
npm install
npm run dev
```

## Deployment

* Frontend: Vercel
* Backend: Render
* Redis: Upstash
* Database: Neon

## What I Learned

* Building a matching engine from scratch
* WebSocket-based real-time systems
* Redis for service communication
* Order book and trade execution logic
* Deploying distributed applications
