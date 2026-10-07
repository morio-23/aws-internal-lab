export const LAB_OPERATION_STATUSES = [
  "queued",
  "waitingForCapacity",
  "running",
  "compensating",
  "succeeded",
  "failed",
  "cancelled",
  "timedOut",
] as const;

export type LabOperationStatus = (typeof LAB_OPERATION_STATUSES)[number];

const TERMINAL = new Set<LabOperationStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "timedOut",
]);

const TRANSITIONS: Record<LabOperationStatus, readonly LabOperationStatus[]> = {
  queued: ["waitingForCapacity", "running", "cancelled", "failed"],
  waitingForCapacity: ["running", "cancelled", "failed", "timedOut"],
  running: ["compensating", "succeeded", "failed", "timedOut"],
  compensating: ["failed", "timedOut"],
  succeeded: [],
  failed: [],
  cancelled: [],
  timedOut: [],
};

export function isTerminalOperationStatus(status: LabOperationStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionOperation(
  from: LabOperationStatus,
  to: LabOperationStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertOperationTransition(
  from: LabOperationStatus,
  to: LabOperationStatus,
): void {
  if (!canTransitionOperation(from, to)) {
    throw new Error(`Invalid operation transition: ${from} -> ${to}`);
  }
}

export function retryDelayMs(attempt: number): number {
  const cappedAttempt = Math.max(0, Math.min(attempt, 8));
  return Math.min(30_000, 250 * 2 ** cappedAttempt);
}
