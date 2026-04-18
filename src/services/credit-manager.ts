export interface CreditResult {
  success: boolean;
  remaining: number;
  message?: string;
}

export async function deductCredits(
  userId: string,
  amount: number,
  _reason?: string,
  _meta?: unknown
): Promise<CreditResult> {
  // Stub: always succeeds. Wire to billing system for production.
  return { success: true, remaining: 999 - amount };
}

export async function getCredits(userId: string): Promise<number> {
  return 999;
}
