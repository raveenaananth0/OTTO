export type ApprovalCharge = {
  id: string;
  payee: string;
  amount: number;
  kind: "bill" | "savings";
};
export type PaymentApproval = {
  id: string;
  token: string;
  email: string;
  charges: ApprovalCharge[];
  createdAt: number;
  expiresAt: number;
  status: "pending" | "declined" | "simulated";
  receiptId?: string;
  approvedAt?: number;
  requestKey?: string;
};
const key = "otto-payment-approval-preview-v1";
let memory: PaymentApproval[] = [];
let storageFailed = false;
const copy = (request: PaymentApproval): PaymentApproval => ({
  ...request,
  charges: request.charges.map((c) => ({ ...c })),
});
function validCharge(value: unknown): value is ApprovalCharge {
  if (!value || typeof value !== "object") return false;
  const c = value as ApprovalCharge;
  return (
    typeof c.id === "string" &&
    c.id.length > 0 &&
    c.id.length <= 150 &&
    typeof c.payee === "string" &&
    !!c.payee.trim() &&
    c.payee.length <= 100 &&
    (c.kind === "bill" || c.kind === "savings") &&
    Number.isFinite(c.amount) &&
    c.amount > 0 &&
    c.amount <= 10000 &&
    Math.abs(c.amount * 100 - Math.round(c.amount * 100)) <= 1e-6
  );
}
function list(): PaymentApproval[] {
  if (storageFailed)
    return memory.map(copy).sort((a, b) => b.createdAt - a.createdAt);
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) memory = [];
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (Array.isArray(value))
        memory = value.filter(
          (r): r is PaymentApproval =>
            !!r &&
            typeof r === "object" &&
            typeof r.id === "string" &&
            typeof r.token === "string" &&
            typeof r.email === "string" &&
            Number.isFinite(r.createdAt) &&
            Number.isFinite(r.expiresAt) &&
            Array.isArray(r.charges) &&
            r.charges.length > 0 &&
            r.charges.length <= 30 &&
            r.charges.every(validCharge) &&
            new Set(r.charges.map((c: ApprovalCharge) => c.id)).size ===
              r.charges.length &&
            ["pending", "declined", "simulated"].includes(r.status),
        );
    }
  } catch {
    storageFailed = true;
  }
  return memory.map(copy).sort((a, b) => b.createdAt - a.createdAt);
}
function persist(requests: PaymentApproval[]) {
  memory = requests.map(copy);
  try {
    localStorage.setItem(key, JSON.stringify(memory));
  } catch {
    storageFailed = true;
  }
}
export function approvalTotal(request: Pick<PaymentApproval, "charges">) {
  return (
    Math.round(request.charges.reduce((sum, c) => sum + c.amount, 0) * 100) /
    100
  );
}
export function decideApproval(
  request: PaymentApproval,
  token: string,
  decision: "approve" | "decline",
  now = Date.now(),
): PaymentApproval {
  if (token !== request.token)
    throw new Error("This approval link is invalid.");
  if (request.status === "simulated" && decision === "approve")
    return copy(request);
  if (request.status !== "pending")
    throw new Error("This request is no longer pending.");
  if (now >= request.expiresAt)
    throw new Error("This approval link has expired. Create a new request.");
  return decision === "decline"
    ? { ...copy(request), status: "declined" }
    : {
        ...copy(request),
        status: "simulated",
        approvedAt: now,
        receiptId: "demo-" + request.id,
      };
}
function create(
  email: string,
  charges: ApprovalCharge[],
  requestKey?: string,
): PaymentApproval {
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    throw new Error("Enter a valid recipient email address.");
  if (
    !Array.isArray(charges) ||
    !charges.length ||
    charges.length > 30 ||
    !charges.every(validCharge) ||
    new Set(charges.map((c) => c.id)).size !== charges.length
  )
    throw new Error("Choose valid charges in dollars and cents.");
  const requests = list(),
    existing = requests.find(
      (r) =>
        requestKey &&
        r.requestKey === requestKey &&
        r.email.toLowerCase() === email.trim().toLowerCase() &&
        JSON.stringify(r.charges) ===
          JSON.stringify(
            charges.map((c) => ({ ...c, payee: c.payee.trim() })),
          ) &&
        (r.status === "simulated" ||
          (r.status === "pending" && r.expiresAt > Date.now())),
    );
  if (existing) return copy(existing);
  const now = Date.now(),
    request: PaymentApproval = {
      id: crypto.randomUUID(),
      token: Array.from(crypto.getRandomValues(new Uint8Array(24)), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join(""),
      email: email.trim(),
      charges: charges.map((c) => ({ ...c, payee: c.payee.trim() })),
      status: "pending",
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      requestKey,
    };
  // A revised request supersedes old pending links; approval always binds an exact snapshot.
  persist([
    request,
    ...requests.map((r) =>
      requestKey && r.requestKey === requestKey && r.status === "pending"
        ? { ...r, status: "declined" as const }
        : r,
    ),
  ]);
  return copy(request);
}
function decide(id: string, token: string, decision: "approve" | "decline") {
  const requests = list(),
    request = requests.find((r) => r.id === id);
  if (!request)
    throw new Error("Request not found in this browser's preview outbox.");
  const updated = decideApproval(request, token, decision);
  persist(requests.map((r) => (r.id === id ? updated : r)));
  return updated;
}
// Demo only: the email outbox and receipt are local. These tokens cannot authorize Nessie.
export const paymentApprovals = {
  list,
  create,
  decide,
  get: (id: string) => list().find((r) => r.id === id) ?? null,
  url: (r: PaymentApproval) =>
    "/approvals?id=" +
    encodeURIComponent(r.id) +
    "&token=" +
    encodeURIComponent(r.token),
};
