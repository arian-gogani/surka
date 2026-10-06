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
    <>
      {/*
        aria-disabled rather than disabled. Disabling the button the user just
        activated removes it from the accessibility tree and the tab order, so
        focus falls to the body and their place is lost, and a disabled
        element's label is not announced. The click guard still blocks the
        second submit.
      */}
      <Button
        variant="action"
        type="submit"
        aria-disabled={pending}
        onClick={(event) => {
          if (pending) event.preventDefault();
        }}
        className={pending ? "cursor-not-allowed opacity-50" : ""}
      >
        {pending ? pendingLabel : children}
      </Button>
      <span role="status" className="sr-only">
        {pending ? pendingLabel : ""}
      </span>
    </>
  );
}
