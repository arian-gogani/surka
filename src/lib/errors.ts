/** An error whose message is safe and useful to show to the person acting. */
export class AmboError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "invalid"
      | "not_allowed"
      | "conflict" = "invalid",
  ) {
    super(message);
    this.name = "AmboError";
  }
}

export function messageFor(error: unknown): string {
  if (error instanceof AmboError) return error.message;
  console.error(error);
  return "Something went wrong on our side. Try again in a minute.";
}
