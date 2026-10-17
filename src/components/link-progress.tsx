"use client";
import { useLinkStatus } from "next/link";
export function LinkProgress() {
  const { pending } = useLinkStatus();
  return pending ? (
    <small className="link-progress" role="status">
      Abriendo…
    </small>
  ) : null;
}
