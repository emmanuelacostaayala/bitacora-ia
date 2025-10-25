import { NextRequest } from "next/server";
export const runtime = "nodejs";

// in-memory buffers per stream in STUB mode
const stubBuffers = new Map<string, any[]>();

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return new Response("studentId required", { status: 400 });

  const basin = process.env.S2_BASIN;
  const token = process.env.S2_ACCESS_TOKEN;
  const stream = `students/${studentId}`;

  // ---- STUB MODE (no S2 creds): emit SSE safely ----
  if (!basin || !token) {
    const encoder = new TextEncoder();
    if (!stubBuffers.has(stream)) stubBuffers.set(stream, []);

    let closed = false;
    let iv: NodeJS.Timer | null = null;

    const body = new ReadableStream({
      start(controller) {
        // initial event (and a cheap keep-alive)
        controller.enqueue(encoder.encode(`: connected ${Date.now()}\n\n`));

        iv = setInterval(() => {
          if (closed) return;
          const buf = stubBuffers.get(stream)!;
          if (buf.length) {
            const batch = {
              records: buf.splice(0, buf.length).map((b, i) => ({
                body: JSON.stringify(b),
                seq_num: Date.now() + i, // monotonic-ish for demo
              })),
            };
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(batch)}\n\n`));
            } catch {
              // stream is closed; stop the interval
              closed = true;
              if (iv) clearInterval(iv);
            }
          } else {
            // lightweight keep-alive comment to reduce idle timeouts
            try {
              controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
            } catch {
              closed = true;
              if (iv) clearInterval(iv);
            }
          }
        }, 1000);
      },
      cancel() {
        closed = true;
        if (iv) clearInterval(iv);
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    });
  }

  // ---- REAL S2 SSE ----
  const url = new URL(
    `https://${basin}.b.aws.s2.dev/v1/streams/${encodeURIComponent(stream)}/records`,
  );
  url.searchParams.set("seq_num", "0");
  url.searchParams.set("clamp", "true");
  url.searchParams.set("wait", "60");

  const upstream = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("S2 read failed", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
    },
  });
}

// POST here is our STUB-ingest so the client can push events into the buffer
export async function POST(req: NextRequest) {
  const { type, payload, studentId } = await req.json();
  const key = `students/${studentId || "demo"}`;
  if (!stubBuffers.has(key)) stubBuffers.set(key, []);
  stubBuffers.get(key)!.push({ type, payload, at: Date.now() });
  return new Response("ok");
}
