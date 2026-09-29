export function errorMessage(error: unknown, fallback = "Internal Server Error"): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
