import client from "./client";

export async function login(username, password) {
    try {
        const { data } = await client.post("/signin", { username, password });
        return data;
    } catch (err) {
        const data = err.response?.data;

        if (data?.error === "validation_error") {
            throw new Error(
                data.issues?.map(issue => issue.message).join(", ")
            );
        }
        throw new Error(
            data?.message ||
            data?.error ||
            "Login failed"
        );
    }
}

export async function signup(username, password) {
    try {
        const { data } = await client.post("/signup", { username, password });
        return data;
    } catch (err) {
        const data = err.response?.data;

        if (data?.error === "validation_error") {
            throw new Error(
                data.issues?.map(issue => issue.message).join(", ")
            );
        }
        throw new Error(
            data?.message ||
            data?.error ||
            "Login failed"
        );
    }
}