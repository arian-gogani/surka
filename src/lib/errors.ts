/** An error whose message is safe and useful to show to the person acting. */
export class SurkaError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "invalid"
      | "not_allowed"
      | "conflict" = "invalid",
  ) {
    super(message);
    this.name = "SurkaError";
  }
}

export function messageFor(error: unknown): string {
  if (error instanceof SurkaError) return error.message;
  console.error(error);
  return "Something went wrong on our side. Try again in a minute.";
}
