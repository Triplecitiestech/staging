import { DiscoveryInput, RecommendationResult } from "./types";
import { recommendationConfig, getPackages } from "./config";
import { totalDevices } from "./calc";

// Build a flat fact context referenced by recommendation rules.
function buildContext(input: DiscoveryInput): Record<string, any> {
  const compliance = input.company.compliance.filter((c) => c && c !== "None");
  const heavy = compliance.some((c) => /HIPAA|CMMC|DFS/i.test(c));
  const totalUsers = (input.users.standard || 0) + (input.users.frontline || 0);
  return {
    company: {
      locations: input.company.locations || 0,
      complianceNotNone: compliance.length > 0,
      complianceHeavy: heavy,
      securityPriority: !!input.company.securityPriority,
    },
    users: { total: totalUsers, frontline: input.users.frontline || 0, standard: input.users.standard || 0 },
    devices: { total: totalDevices(input) },
    servers: { count: (input.servers || []).length },
    internalIT: {
      hasInternalIT: !!input.internalIT.hasInternalIT,
      comanagedAccess: !!input.internalIT.comanagedAccess,
      escalationSupport: !!input.internalIT.escalationSupport,
      afterHoursSupport: !!input.internalIT.afterHoursSupport,
    },
    licensing: {
      meetsPremium: /Premium|E3|E5/i.test(input.licensing.currentLicense || ""),
    },
  };
}

// ---- Tiny safe expression evaluator (supports: identifiers a.b.c, numbers,
// true/false, == >= > <= < && || and parentheses). No code execution. ----
type Tok = { t: string; v: string };
function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  const re = /\s*(>=|<=|==|!=|&&|\|\||[()<>]|[A-Za-z_][A-Za-z0-9_.]*|\d+(?:\.\d+)?)/y;
  let m: RegExpExecArray | null;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    m = re.exec(s);
    if (!m) break;
    i = re.lastIndex;
    const tok = m[1];
    if (/^(>=|<=|==|!=|<|>)$/.test(tok)) toks.push({ t: "cmp", v: tok });
    else if (tok === "&&") toks.push({ t: "and", v: tok });
    else if (tok === "||") toks.push({ t: "or", v: tok });
    else if (tok === "(") toks.push({ t: "lp", v: tok });
    else if (tok === ")") toks.push({ t: "rp", v: tok });
    else if (/^\d/.test(tok)) toks.push({ t: "num", v: tok });
    else if (tok === "true" || tok === "false") toks.push({ t: "bool", v: tok });
    else toks.push({ t: "id", v: tok });
  }
  return toks;
}

function resolve(path: string, ctx: Record<string, any>): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx);
}

function evaluate(expr: string, ctx: Record<string, any>): boolean {
  const toks = tokenize(expr);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];

  function primary(): any {
    const tk = peek();
    if (!tk) return false;
    if (tk.t === "lp") { next(); const v = orExpr(); if (peek()?.t === "rp") next(); return v; }
    if (tk.t === "num") { next(); return parseFloat(tk.v); }
    if (tk.t === "bool") { next(); return tk.v === "true"; }
    if (tk.t === "id") { next(); return resolve(tk.v, ctx); }
    next(); return false;
  }
  function cmpExpr(): any {
    let left = primary();
    while (peek()?.t === "cmp") {
      const op = next().v;
      const right = primary();
      switch (op) {
        case "==": left = left === right; break;
        case "!=": left = left !== right; break;
        case ">=": left = left >= right; break;
        case "<=": left = left <= right; break;
        case ">": left = left > right; break;
        case "<": left = left < right; break;
      }
    }
    return left;
  }
  function andExpr(): any {
    let left = cmpExpr();
    while (peek()?.t === "and") { next(); const right = cmpExpr(); left = !!left && !!right; }
    return left;
  }
  function orExpr(): any {
    let left = andExpr();
    while (peek()?.t === "or") { next(); const right = andExpr(); left = !!left || !!right; }
    return left;
  }
  return !!orExpr();
}

export function recommend(input: DiscoveryInput): RecommendationResult {
  const ctx = buildContext(input);
  const scores: Record<string, number> = {};
  for (const p of getPackages()) scores[p.id] = 0;
  // Premium-first baseline lean
  for (const [pid, pts] of Object.entries<number>(recommendationConfig.baseline || {})) {
    scores[pid] = (scores[pid] || 0) + pts;
  }
  const matched: { reason: string; points: Record<string, number>; floor?: string }[] = [];
  const floorsHit: string[] = [];

  for (const rule of recommendationConfig.rules as any[]) {
    let hit = false;
    try { hit = evaluate(rule.when, ctx); } catch { hit = false; }
    if (hit) {
      for (const [pid, pts] of Object.entries<number>(rule.points)) {
        scores[pid] = (scores[pid] || 0) + pts;
      }
      matched.push({ reason: rule.reason, points: rule.points, floor: rule.floor });
      if (rule.floor) floorsHit.push(rule.floor);
    }
  }

  const order: string[] = recommendationConfig.tieBreakerOrder || getPackages().map((p) => p.id);
  const ranked = Object.entries(scores).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return order.indexOf(a[0]) - order.indexOf(b[0]);
  });
  let winnerId = ranked[0]?.[0];

  // Floor enforcement: never recommend below the required minimum tier.
  const ladder: Record<string, number> = recommendationConfig.ladderRank || {};
  const floorRanks: Record<string, number> = recommendationConfig.floors || {};
  let reqRank = 0, reqId: string | null = null;
  for (const f of floorsHit) {
    const r = floorRanks[f] || 0;
    if (r > reqRank) { reqRank = r; reqId = f; }
  }
  if (reqId && (ladder[winnerId] || 0) < reqRank) winnerId = reqId;

  const runnerUpId = ranked.find((r) => r[0] !== winnerId)?.[0] ?? null;
  const winner = getPackages().find((p) => p.id === winnerId)!;

  // Surface reasons that contributed to (or set the floor for) the recommended package.
  let rationale = matched.filter((m) => (m.points[winnerId] || 0) > 0 || m.floor === winnerId).map((m) => m.reason);
  if (rationale.length === 0) rationale = matched.map((m) => m.reason).slice(0, 4);

  return {
    recommendedPackageId: winnerId,
    recommendedPackageName: winner?.name || "",
    scores,
    rationale,
    runnerUpId,
  };
}
