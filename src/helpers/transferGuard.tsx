export function transferGuard(amount: number, checking: number) {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 500 ||
    Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6
  )
    throw new Error(
      "Choose a savings goal between $0.01 and $500, to the nearest cent.",
    );
  if (!Number.isFinite(checking) || checking - amount < 200)
    throw new Error(
      "This transfer would leave less than $200 in checking. Lower the goal first.",
    );
}
