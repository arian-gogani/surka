"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";

/**
 * A submit button that disables itself while the action is in flight.
 *
 * Without this, a slow connection looks like nothing happened: the user clicks
 * again and creates a second swap. With JavaScript off there is no pending
 * state to read, so it renders as an ordinary submit button and the form still
 * works, which is the trade the rest of the app makes too.
 */
export function SubmitButton({ children, pendingLabel }: { children: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button variant="action" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
