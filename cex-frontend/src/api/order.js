import client from "./client";

export async function submitOrder({ symbol, side, type, price, qty }) {
  try {
    const { data } = await client.post("/order", { symbol, side, type, price, qty });
    return data;
  } catch (err) {
    const data = err.response?.data;
    if (data?.error === "validation_error") {
      throw new Error(data.issues?.map((issue) => issue.message).join(", ") || "Order validation failed");
    }
    throw new Error(data?.message || data?.error || "Order submission failed");
  }
}

export async function cancelOrder(orderId) {
  try {
    const { data } = await client.delete(`/order/${orderId}`);
    return data;
  } catch (err) {
    const data = err.response?.data;
    if (data?.error === "validation_error") {
      throw new Error(data.issues?.map((issue) => issue.message).join(", ") || "Cancel validation failed");
    }
    throw new Error(data?.message || data?.error || "Cancel failed");
  }
}
