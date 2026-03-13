export default async (req, context) => {
    console.log("키 길이:", process.env.ANTHROPIC_API_KEY?.length); // ← 추가
    console.log("키 앞 10자:", process.env.ANTHROPIC_API_KEY?.slice(0, 10)); // ← 추가

    // CORS preflight
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

    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY, // ← 환경변수
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
        status: res.status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
    });
};

export const config = {
    path: "/api/analyze",
    timeout: 26, // 타임아웃 여기로
};
