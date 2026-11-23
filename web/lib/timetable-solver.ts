// Builds a clash-free timetable. The AI only turns the school's rules into numbers (see /api/ai/timetable); THIS code places the periods,
// so a teacher can never be in two classes at once, whatever the AI says.
export type SolverCfg = {
  days: number; periods: number; maxPerDay: number;
  weekly: Record<string, number>;                   // lower-case subject name -> periods per week
  allowed: Record<string, number[]>;                // lower-case subject name -> only these periods (1-based)
  teacherOff: Record<string, number[]>;             // staff id -> days (0 = Monday) they cannot teach
};
export type SClass = { id: string; label: string; subjects: { id: string; name: string; teacher_id: string | null }[] };
export type Placed = { class_id: string; day: number; period: number; subject_id: string };
export type Solved = { placed: Placed[]; unplaced: { class: string; subject: string; missing: number }[] };

export function solve(classes: SClass[], cfg: SolverCfg, seed = 7): Solved {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const busy = new Set<string>();                    // teacher|day|period
  const placed: Placed[] = []; const unplaced: Solved["unplaced"] = [];
  const cells = cfg.days * cfg.periods;
  // classes whose subjects share teachers are done together-first: most constrained first
  const order = [...classes].sort((a, b) => b.subjects.filter((x) => x.teacher_id).length - a.subjects.filter((x) => x.teacher_id).length);
  for (const c of order) {
    const n = c.subjects.length || 1;
    const need = c.subjects.map((sb, i) => ({ sb, n: cfg.weekly[sb.name.toLowerCase()] ?? Math.floor(cells / n) + (i < cells % n ? 1 : 0) }));
    let total = need.reduce((a, b) => a + b.n, 0);
    while (total > cells) { const big = need.reduce((a, b) => (b.n > a.n ? b : a)); big.n--; total--; }
    let best: { grid: (string | null)[]; left: Map<string, number>; filled: number } | null = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const grid: (string | null)[] = Array(cells).fill(null);   // index = day*periods + (period-1)
      const left = new Map(need.map((x) => [x.sb.id, x.n])); const perDay = new Map<string, number>(); const mine: string[] = [];
      const ok = (sb: SClass["subjects"][number], d: number, p: number, relax: number) => {
        if (grid[d * cfg.periods + p - 1]) return false;
        const al = cfg.allowed[sb.name.toLowerCase()]; if (al && !al.includes(p)) return false;
        if (sb.teacher_id && (busy.has(`${sb.teacher_id}|${d}|${p}`) || cfg.teacherOff[sb.teacher_id]?.includes(d))) return false;
        return (perDay.get(`${sb.id}|${d}`) ?? 0) < cfg.maxPerDay + relax;
      };
      const put = (sb: SClass["subjects"][number], d: number, p: number) => { grid[d * cfg.periods + p - 1] = sb.id; perDay.set(`${sb.id}|${d}`, (perDay.get(`${sb.id}|${d}`) ?? 0) + 1); left.set(sb.id, left.get(sb.id)! - 1); if (sb.teacher_id) mine.push(`${sb.teacher_id}|${d}|${p}`); };
      // hardest subjects first: restricted periods, then busiest teachers
      const queue = shuffle(need).sort((a, b) => Number(!!cfg.allowed[b.sb.name.toLowerCase()]) - Number(!!cfg.allowed[a.sb.name.toLowerCase()]) || b.n - a.n);
      for (const relax of [0, 1, 2]) {
        for (const { sb } of queue) {
          while (left.get(sb.id)! > 0) {
            // spread over the week: prefer the day this subject has the fewest periods
            const options: [number, number][] = [];
            for (let d = 0; d < cfg.days; d++) for (let p = 1; p <= cfg.periods; p++) if (ok(sb, d, p, relax)) options.push([d, p]);
            if (!options.length) break;
            const score = ([d]: [number, number]) => (perDay.get(`${sb.id}|${d}`) ?? 0) + rnd() * 0.9;
            options.sort((x, y) => score(x) - score(y)); put(sb, ...options[0]);
          }
        }
      }
      const filled = grid.filter(Boolean).length;
      if (!best || filled > best.filled) { best = { grid: [...grid], left: new Map(left), filled }; (best as unknown as { mine: string[] }).mine = [...mine]; }
      if ([...left.values()].every((v) => v === 0)) break;
    }
    const b = best!;
    for (const k of (b as unknown as { mine: string[] }).mine) busy.add(k);
    b.grid.forEach((sid, i) => { if (sid) placed.push({ class_id: c.id, day: Math.floor(i / cfg.periods), period: (i % cfg.periods) + 1, subject_id: sid }); });
    for (const [sid, m] of b.left) if (m > 0) unplaced.push({ class: c.label, subject: c.subjects.find((x) => x.id === sid)!.name, missing: m });
  }
  return { placed, unplaced };
}
