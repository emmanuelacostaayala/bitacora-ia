import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { type, payload, studentId } = await req.json();
  const basin = process.env.S2_BASIN;
  const token = process.env.S2_ACCESS_TOKEN;

  if (!studentId) return NextResponse.json({ ok:false, error:"studentId required" }, { status:400 });
  const stream = `students/${studentId}`;

  // Stub mode (no S2 creds yet)
  if (!basin || !token) {
    return NextResponse.json({ ok:true, stub:true, record:{ type, payload, at:Date.now(), stream }});
  }

  const res = await fetch(`https://${basin}.b.aws.s2.dev/v1/streams/${encodeURIComponent(stream)}/records`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records:[{ body: JSON.stringify({ type, payload, at: Date.now() }) }] })
  });

  if (!res.ok) return NextResponse.json({ ok:false, error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}
