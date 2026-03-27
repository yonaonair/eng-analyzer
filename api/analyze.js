export default async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }

    const body = await req.json();

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
    });

    return new Response(apiRes.body, {
        status: apiRes.status,
        headers: {
            "Content-Type": apiRes.headers.get("content-type") || "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        },
    });
};

export const config = { runtime: "edge" };
