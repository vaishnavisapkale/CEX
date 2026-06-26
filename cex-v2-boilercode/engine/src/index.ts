import "dotenv/config";
import { createClient } from "redis";
import express from "express";
import { env } from "./utils/env.js";
import {
  ORDERS,
  createOrder,
  getDepth,
  cancelOrder,
  getUserBalance,
  depositBalance,
  getUserOrders,
  getRecentTrades,
  hydrateFromDB,
  persistUserDefaultsIfNew,
} from "./store/exchange-store.js";

export type EngineCommandType =
  | "create_order"
  | "get_depth"
  | "get_user_balance"
  | "get_order"
  | "cancel_order"
  | "deposit_balance"
  | "get_user_orders"
  | "get_recent_trades";

export interface EngineRequest {
  correlationId: string;
  responseQueue: string;
  type:          EngineCommandType;
  payload:       Record<string, unknown>;
}

export interface EngineResponse {
  correlationId: string;
  ok:            boolean;
  data?:         unknown;
  error?:        string;
}

const brokerClient   = createClient({ url: env.redisUrl }).on("error", (e) => console.error("Redis broker error", e));
const responseClient = createClient({ url: env.redisUrl }).on("error", (e) => console.error("Redis response error", e));

await Promise.all([brokerClient.connect(), responseClient.connect()]);

async function publishDepth(symbol: string): Promise<void> {
  const depth = getDepth(symbol);
  await responseClient.publish(`depth:${symbol}`, JSON.stringify(depth));
}

async function publishTrades(symbol: string, trades: unknown[]): Promise<void> {
  if (trades.length === 0) return;
  await responseClient.publish(`trades:${symbol}`, JSON.stringify(trades));
}

async function sendResponse(responseQueue: string, response: EngineResponse): Promise<void> {
  await responseClient.lPush(responseQueue, JSON.stringify(response));
}

async function handleEngineRequest(message: EngineRequest): Promise<unknown> {
  const { type, payload } = message;

  if (type === "create_order") {
    const result = await createOrder(payload as any);
    await publishDepth(payload.symbol as string);
    if (result.fills.length > 0) {
      const newTrades = result.fills.map((f) => ({
        symbol: f.symbol,
        price:  f.price,
        qty:    f.qty,
        side:   result.side,
        time:   f.createdAt,
      }));
      await publishTrades(result.symbol, newTrades);
    }
    return result;
  }

  if (type === "get_depth") {
    return getDepth(payload.symbol as string);
  }

  if (type === "get_user_balance") {
    const userId  = payload.userId as string;
    const balance = getUserBalance(userId);
    // persistUserDefaultsIfNew uses upsert with no-op update so it's safe to call every time.
    // It only INSERTs when the user has no row in user_balances yet.
    await persistUserDefaultsIfNew(userId);
    return balance;
  }

  if (type === "get_order") {
    return ORDERS.get(payload.orderId as string) ?? null;
  }

  if (type === "cancel_order") {
    const order  = ORDERS.get(payload.orderId as string);
    const result = await cancelOrder(payload.orderId as string);
    if (order) await publishDepth(order.symbol);
    return result;
  }

  if (type === "deposit_balance") {
    return depositBalance(
      payload.userId as string,
      (payload.asset  as string) ?? "INR",
      payload.amount  as number,
    );
  }

  if (type === "get_recent_trades") {
    return getRecentTrades(payload.symbol as string);
  }

  if (type === "get_user_orders") {
    return getUserOrders(payload.userId as string);
  }

  throw new Error("Unknown command");
}


// Startup: hydrate in-memory state from Postgres, then start processing


// Start health server immediately so deployment platforms can health-check
// during the (potentially slow) DB hydration phase.
let engineReady = false;
const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true, ready: engineReady });
});
app.listen(process.env.PORT || 10000, () => {
  console.log("Engine health server started");
});

await hydrateFromDB();
engineReady = true;

console.log(`Engine listening on Redis queue: ${env.incomingQueue}`);

for (;;) {
  
  const item = await brokerClient.brPop(env.incomingQueue, 5);
  if (!item) continue;

  let message: EngineRequest;
  try {
    message = JSON.parse(item.element) as EngineRequest;
  } catch {
    console.error("Skipping invalid broker message");
    continue;
  }

  try {
    const data = await handleEngineRequest(message);
    await sendResponse(message.responseQueue, {
      correlationId: message.correlationId,
      ok:   true,
      data,
    });
  } catch (error) {
    await sendResponse(message.responseQueue, {
      correlationId: message.correlationId,
      ok:    false,
      error: error instanceof Error ? error.message : "engine_error",
    });
  }
}



