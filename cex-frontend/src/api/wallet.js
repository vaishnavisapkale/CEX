import client from "./client";

export async function deposit(amount, asset = "INR") {
  try {
    const { data } = await client.post("/deposit", { asset, amount });
    return data;
  } catch (err) {
    const data = err.response?.data;

    if (data?.error === "validation_error") {
      throw new Error(
        data.issues?.map((issue) => issue.message).join(", ")
      );
    }
    throw new Error(
      data?.message ||
      data?.error ||
      "Deposit failed"
    );
  }
}

export async function balance() {
  try {
    const { data } = await client.get("/balance");
    return data;
  } catch (err) {
    const data = err.response?.data;

    if (data?.error === "validation_error") {
      throw new Error(
        data.issues?.map((issue) => issue.message).join(", ")
      );
    }
    throw new Error(
      data?.message ||
      data?.error ||
      "Balance request failed"
    );
  }
}
