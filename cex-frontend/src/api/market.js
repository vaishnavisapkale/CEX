import client from "./client";

export async function getDepth(symbol) {
  const { data } = await client.get(`/depth/${symbol}`);
  return data;
}

export async function getRecentTrades(symbol) {
  const { data } = await client.get(`/trades/${symbol}`);
  return data;
}

export async function getMyOrders() {
  const { data } = await client.get("/orders");
  return data;
}