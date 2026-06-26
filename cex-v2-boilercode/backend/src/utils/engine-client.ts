import { createClient } from "redis";
import { env } from "./env.js";
import type { EngineCommandType, EngineRequest, EngineResponse } from "../types/engine.js";

// --- pending response tracking ---

interface PendingEntry {
  resolve: (r: EngineResponse) => void;
  reject: (e: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingEntry>();

function waitForResponse(correlationId: string, timeoutMs: number): Promise<EngineResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(correlationId);
      reject(new Error("Engine response timed out"));
    }, timeoutMs);
    pending.set(correlationId, { resolve, reject, timeout });
  });
}

function resolveResponse(response: EngineResponse): void {
  const entry = pending.get(response.correlationId);
  if (!entry) return;
  clearTimeout(entry.timeout);
  pending.delete(response.correlationId);
  entry.resolve(response);
}

// --- redis clients ---

const publisher = createClient({ url: env.redisUrl }).on("error", (e) =>
  console.error("Redis publisher error", e)
);
const subscriber = createClient({ url: env.redisUrl }).on("error", (e) =>
  console.error("Redis subscriber error", e)
);
// separate client for depth pub/sub (pub/sub mode blocks other commands)
const depthSubscriber = createClient({ url: env.redisUrl }).on("error", (e) =>
  console.error("Redis depth subscriber error", e)
);

export async function connectRedis(): Promise<void> {
  await Promise.all([publisher.connect(), subscriber.connect(), depthSubscriber.connect()]);
}

export async function pingRedis(): Promise<string> {
  return publisher.ping();
}

export async function sendToEngine(
  type: EngineCommandType,
  payload: Record<string, unknown>
): Promise<EngineResponse> {
  const correlationId = crypto.randomUUID();
  const responsePromise = waitForResponse(correlationId, env.engineTimeoutMs);

  const message: EngineRequest = {
    correlationId,
    responseQueue: env.responseQueue,
    type,
    payload,
  };

  await publisher.lPush(env.incomingQueue, JSON.stringify(message));
  return responsePromise;
}

export async function listenForEngineResponses(): Promise<void> {
  console.log(`Listening for engine responses on ${env.responseQueue}`);
  for (;;) {
    const response = await subscriber.brPop(env.responseQueue, 5);
    if (!response) continue;
    try {
      const parsed = JSON.parse(response.element) as EngineResponse;
      resolveResponse(parsed);
    } catch (error) {
      console.error("Invalid engine response", error);
    }
  }
}

// --- depth pub/sub for WebSocket streaming ---

type DepthCallback = (depth: unknown) => void;
const depthCallbacks = new Map<string, Set<DepthCallback>>();

export async function subscribeToDepth(symbol: string, cb: DepthCallback): Promise<void> {
  const channel = `depth:${symbol}`;
  if (!depthCallbacks.has(symbol)) {
    depthCallbacks.set(symbol, new Set());
    await depthSubscriber.subscribe(channel, (message) => {
      try {
        const depth = JSON.parse(message);
        depthCallbacks.get(symbol)?.forEach((fn) => fn(depth));
      } catch {}
    });
  }
  depthCallbacks.get(symbol)!.add(cb);
}

export async function unsubscribeFromDepth(symbol: string, cb: DepthCallback): Promise<void> {
  const callbacks = depthCallbacks.get(symbol);
  if (!callbacks) return;
  callbacks.delete(cb);
  if (callbacks.size === 0) {
    depthCallbacks.delete(symbol);
    await depthSubscriber.unsubscribe(`depth:${symbol}`);
  }
}

// --- trades pub/sub (pattern subscribe trades:*) ---

type TradesCallback = (trades: unknown) => void;
const tradesCallbacks = new Map<string, Set<TradesCallback>>();
let tradesPatternActive = false;

export async function subscribeToTrades(symbol: string, cb: TradesCallback): Promise<void> {
  if (!tradesCallbacks.has(symbol)) {
    tradesCallbacks.set(symbol, new Set());
  }
  tradesCallbacks.get(symbol)!.add(cb);

  if (!tradesPatternActive) {
    tradesPatternActive = true;
    await depthSubscriber.pSubscribe("trades:*", (message, channel) => {
      try {
        const sym = channel.slice("trades:".length);
        const trades = JSON.parse(message);
        tradesCallbacks.get(sym)?.forEach((fn) => fn(trades));
      } catch {}
    });
  }
}

export async function unsubscribeFromTrades(symbol: string, cb: TradesCallback): Promise<void> {
  const callbacks = tradesCallbacks.get(symbol);
  if (!callbacks) return;
  callbacks.delete(cb);
  if (callbacks.size === 0) {
    tradesCallbacks.delete(symbol);
  }
  if (tradesCallbacks.size === 0 && tradesPatternActive) {
    tradesPatternActive = false;
    await depthSubscriber.pUnsubscribe("trades:*");
  }
}
