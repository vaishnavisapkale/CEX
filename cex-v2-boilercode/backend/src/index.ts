import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { authRouter } from "./routes/auth-routes.js";
import { exchangeRouter } from "./routes/exchange-routes.js";
import { env } from "./utils/env.js";
import {
  connectRedis,
  listenForEngineResponses,
  pingRedis,
  subscribeToDepth,
  unsubscribeFromDepth,
  subscribeToTrades,
  unsubscribeFromTrades,
} from "./utils/engine-client.js";

await connectRedis();
void listenForEngineResponses();

const app = express();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

// app.use(cors({
//   origin: (origin, cb) => {
//     // allow server-to-server calls (no origin) and listed origins
//     if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
//     cb(new Error(`CORS: origin ${origin} not allowed`));
//   },
//   credentials: true,
// }));

console.log("ALLOWED_ORIGINS =", ALLOWED_ORIGINS);

app.use(cors({
  origin: (origin, cb) => {
    console.log("Incoming origin =", origin);

    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return cb(null, true);
    }

    console.log("BLOCKED ORIGIN =", origin);

    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

app.get("/health", async (_req, res) => {
  await pingRedis();
  res.json({ ok: true });
});

app.use(authRouter);
app.use(exchangeRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: err instanceof Error ? err.message : "internal_server_error",
  });
});

// WebSocket server for depth streaming 

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket) => {
  const depthSubs = new Map<string, (depth: unknown) => void>();
  const tradesSubs = new Map<string, (trades: unknown) => void>();

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type: string; symbol?: string };

      if (msg.type === "subscribe" && msg.symbol) {
        const symbol = msg.symbol;
        if (!depthSubs.has(symbol)) {
          const cb = (depth: unknown) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: "depth", data: depth }));
            }
          };
          depthSubs.set(symbol, cb);
          await subscribeToDepth(symbol, cb);
        }
      }

      if (msg.type === "unsubscribe" && msg.symbol) {
        const symbol = msg.symbol;
        const cb = depthSubs.get(symbol);
        if (cb) {
          depthSubs.delete(symbol);
          await unsubscribeFromDepth(symbol, cb);
        }
      }

      if (msg.type === "subscribe_trades" && msg.symbol) {
        const symbol = msg.symbol;
        if (!tradesSubs.has(symbol)) {
          const cb = (trades: unknown) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: "trades", data: trades }));
            }
          };
          tradesSubs.set(symbol, cb);
          await subscribeToTrades(symbol, cb);
        }
      }

      if (msg.type === "unsubscribe_trades" && msg.symbol) {
        const symbol = msg.symbol;
        const cb = tradesSubs.get(symbol);
        if (cb) {
          tradesSubs.delete(symbol);
          await unsubscribeFromTrades(symbol, cb);
        }
      }
    } catch {}
  });

  ws.on("close", async () => {
    for (const [symbol, cb] of depthSubs) {
      await unsubscribeFromDepth(symbol, cb);
    }
    for (const [symbol, cb] of tradesSubs) {
      await unsubscribeFromTrades(symbol, cb);
    }
    depthSubs.clear();
    tradesSubs.clear();
  });
});

httpServer.listen(env.port, () => {
  console.log(`Backend running on http://localhost:${env.port}`);
  console.log(`WebSocket depth streaming on ws://localhost:${env.port}`);
  console.log(`Response queue: ${env.responseQueue}`);
});
