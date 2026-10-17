"use client";
import type * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Submit button for server-action forms: while the form is submitting every
// SubmitButton in it is disabled, so a double tap on a slow connection cannot
// send a second request (which would come back as a false "conflict").
export function SubmitButton({
  children,
  pendingText = "Guardando…",
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending, data } = useFormStatus();
  const name = typeof props.name === "string" ? props.name : null;
  const clicked =
    pending &&
    (!name || !data || data.get(name) === String(props.value ?? ""));
  return (
    <Button
      type="submit"
      {...props}
      disabled={pending || disabled}
      aria-busy={clicked || undefined}
    >
      {clicked ? pendingText : children}
    </Button>
  );
}
