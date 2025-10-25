import { NextRequest, NextResponse } from "next/server";
import { LingoDotDevEngine } from "lingo.dev/sdk";

const HAS_KEY = !!process.env.LINGODOTDEV_API_KEY;
const engine = HAS_KEY
  ? new LingoDotDevEngine({ apiKey: process.env.LINGODOTDEV_API_KEY! })
  : null;

export async function POST(req: NextRequest) {
  const { text, targetLocale, sourceLocale } = await req.json();

  if (!HAS_KEY) {
    return NextResponse.json(
      { ok: false, reason: "missing_key", text },
      { status: 400 }
    );
  }

  try {
    const out = await engine!.localizeText(text, {
      targetLocale: targetLocale || "en",
      sourceLocale: sourceLocale || null, // auto-detect
      fast: true,
    });
    return NextResponse.json({ ok: true, text: out });
  } catch (e: any) {
    // Dev-friendly info en server logs
    console.error("Lingo translate error:", e?.message || e);
    return NextResponse.json(
      { ok: false, reason: "upstream_error", text },
      { status: 502 }
    );
  }
}
