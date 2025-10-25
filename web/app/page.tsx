"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Languages, Sparkles, Mic, ShieldCheck, Cloud, Wrench } from "lucide-react";

type Item = {
  type: string;
  payload: any;
  at: number;
  seq_num?: number;
  uid?: string; // local id for updating translated text
};

export default function Page() {
  const [studentId, setStudentId] = useState("demo-student");
  const [role, setRole] = useState<"teacher" | "parent">("teacher");
  const [items, setItems] = useState<Item[]>([]);
  const [targetLocale, setTargetLocale] = useState("en");
  const noteRef = useRef<HTMLInputElement>(null);

  // translate status for viewer
  const [translateStatus, setTranslateStatus] = useState<"ok"|"missing_key"|"error"|"idle">("idle");

  // simple in-memory cache: key = `${locale}|${at}|${text}`
  const cacheRef = useRef<Map<string, string>>(new Map());

  // Subscribe to stream
  useEffect(() => {
    setItems([]);
    const es = new EventSource(`/api/s2/read?studentId=${encodeURIComponent(studentId)}`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.records) {
          const newOnes: Item[] = data.records.map((r: any) => {
            const body = JSON.parse(r.body);
            return { ...body, seq_num: r.seq_num, uid: `${r.seq_num ?? body.at}-${studentId}` };
          });
          setItems((prev) => [...prev, ...newOnes]);
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [studentId]);

  // Viewer-side translation
  useEffect(() => {
    if (role !== "parent") return;
    setTranslateStatus("idle");
    (async () => {
      const jobs = items.map(async (it) => {
        const text = it?.payload?.text;
        if (!text) return;
        const cacheKey = `${targetLocale}|${it.at}|${text}`;

        if (cacheRef.current.has(cacheKey)) {
          const cached = cacheRef.current.get(cacheKey)!;
          setItems((prev) =>
            prev.map((p) => (p.uid === it.uid ? { ...p, payload: { ...p.payload, _viewText: cached } } : p))
          );
          setTranslateStatus("ok");
          return;
        }

        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, targetLocale }),
        });

        if (!res.ok) {
          try {
            const j = await res.json();
            if (j?.reason === "missing_key") setTranslateStatus("missing_key");
            else setTranslateStatus("error");
          } catch { setTranslateStatus("error"); }
          // degrade to raw text
          setItems((prev) =>
            prev.map((p) => (p.uid === it.uid ? { ...p, payload: { ...p.payload, _viewText: text } } : p))
          );
          return;
        }

        const j = await res.json();
        const translated = j?.text ?? text;
        cacheRef.current.set(cacheKey, translated);
        setTranslateStatus("ok");
        setItems((prev) =>
          prev.map((p) => (p.uid === it.uid ? { ...p, payload: { ...p.payload, _viewText: translated } } : p))
        );
      });
      await Promise.all(jobs);
    })();
  }, [items, role, targetLocale]);

  // Post a note
  async function postNote() {
    const raw = noteRef.current?.value?.trim();
    if (!raw) return;

    const body = { type: "note", studentId, payload: { text: raw, authorRole: role } };

    const res = await fetch("/api/s2/append", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // stub push if needed
    let needStubPush = !res.ok;
    try {
      const json = await res.json();
      if (json?.stub) needStubPush = true;
    } catch {}
    if (needStubPush) {
      await fetch("/api/s2/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    if (noteRef.current) noteRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-black to-neutral-950 text-neutral-100">
      {/* glow backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-40 [background:radial-gradient(60%_40%_at_50%_0%,rgba(59,130,246,.25),transparent_70%)]" />

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        {/* HEADER */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                BayBridge Classroom
              </span>{" "}
              — San Francisco AI
            </h1>
            <p className="text-sm sm:text-base opacity-70">
              Real-time parent–teacher updates with translation and an auditable timeline per student.
            </p>
          </div>

          <motion.span
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="hidden sm:inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs ring-1 ring-white/10"
            title="San Francisco based"
          >
            <Sparkles className="h-4 w-4 text-emerald-300" />
            SF • Live Demo
          </motion.span>
        </header>

        {/* CONTROLS CARD */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs opacity-70">Student ID</label>
              <input
                aria-label="Student ID"
                className="border border-white/10 bg-black/40 rounded-xl px-3 py-2 outline-none focus:ring-2 ring-emerald-400/50"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="student-123"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs opacity-70">Role</label>
              <select
                aria-label="Role"
                className="border border-white/10 bg-black/40 rounded-xl px-3 py-2 outline-none focus:ring-2 ring-emerald-400/50"
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
              >
                <option value="teacher">Teacher</option>
                <option value="parent">Parent</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs opacity-70">Viewer language</label>
              <div className="relative">
                <Languages className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-70" />
                <select
                  aria-label="Language"
                  className="w-full pl-9 border border-white/10 bg-black/40 rounded-xl px-3 py-2 outline-none focus:ring-2 ring-emerald-400/50"
                  value={targetLocale}
                  onChange={(e) => setTargetLocale(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="zh">Chinese</option>
                </select>
              </div>
            </div>
          </div>

          {role === "parent" && (
            <div className="mt-3 text-xs">
              {translateStatus === "ok" && <span className="opacity-60">Translation: OK</span>}
              {translateStatus === "idle" && <span className="opacity-60">Translation: …</span>}
              {translateStatus === "missing_key" && (
                <span className="text-yellow-300">Translation disabled (missing LINGODOTDEV_API_KEY)</span>
              )}
              {translateStatus === "error" && (
                <span className="text-red-400">Translation unavailable (rate limit or error)</span>
              )}
            </div>
          )}

          {role === "teacher" && (
            <div className="mt-4 flex gap-2">
              <input
                ref={noteRef}
                aria-label="Classroom update"
                className="flex-1 border border-white/10 bg-black/40 rounded-xl px-3 py-2 outline-none focus:ring-2 ring-emerald-400/50"
                placeholder="Type a classroom update…"
                onKeyDown={(e) => e.key === "Enter" && postNote()}
              />
              <button
                onClick={postNote}
                className="rounded-xl bg-emerald-500/90 hover:bg-emerald-400 text-black font-medium px-4 py-2 transition-colors"
              >
                Post
              </button>
            </div>
          )}
        </motion.section>

        {/* TIMELINE */}
        <section className="space-y-3">
          <AnimatePresence initial={false}>
            {items.map((it) => {
              const raw = it?.payload?.text;
              const view = role === "parent" ? (it?.payload?._viewText ?? "Translating…") : raw;

              return (
                <motion.article
                  key={it.uid ?? `${it.seq_num ?? it.at}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.03] p-4 hover:border-emerald-400/30"
                >
                  <div className="text-[11px] opacity-60 flex items-center justify-between">
                    <span>#{it.seq_num ?? "-"}</span>
                    <span>{new Date(it.at).toLocaleString()}</span>
                  </div>
                  <h3 className="mt-1 font-semibold tracking-wide">{it.type.toUpperCase()}</h3>
                  <p className="mt-1 whitespace-pre-wrap leading-relaxed">{view}</p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] opacity-60">
                    {it.payload?.authorRole && <>by {it.payload.authorRole}</>}
                    {role === "parent" && it?.payload?._viewText && (
                      <span className="ml-auto">translated to {targetLocale}</span>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </section>

        {/* FOOTER — tech badges */}
        <footer className="pt-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
          <div className="text-xs opacity-70 mb-2">Built with</div>

          <div className="grid sm:grid-cols-5 gap-3">
            <TechBadge href="https://s2.dev/" title="S2.dev" subtitle="Durable streams & SSE">
              <Cloud className="h-4 w-4" />
            </TechBadge>

            <TechBadge href="https://cactuscompute.com/" title="Cactus Compute" subtitle="Local STT/TTS & LLM">
              <Mic className="h-4 w-4" />
            </TechBadge>

            <TechBadge href="https://randomlabs.ai/" title="Random Labs Slate" subtitle="Auto-improve via PRs">
              <Wrench className="h-4 w-4" />
            </TechBadge>

            <TechBadge href="https://lingo.dev/en" title="Lingo.dev" subtitle="Live translations">
              <Languages className="h-4 w-4" />
            </TechBadge>

            <TechBadge href="https://stack-auth.com/" title="Stack Auth" subtitle="Orgs & roles">
              <ShieldCheck className="h-4 w-4" />
            </TechBadge>
          </div>
        </footer>
      </main>
    </div>
  );
}

/** Small badge card for footer tech links */
function TechBadge({
  href,
  title,
  subtitle,
  children,
}: {
  href: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors p-3 no-underline"
    >
      <div className="flex items-center gap-2">
        <div className="rounded-xl bg-white/10 p-2">{children}</div>
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-[11px] opacity-70">{subtitle}</div>
        </div>
      </div>
    </a>
  );
}
