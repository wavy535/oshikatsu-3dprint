/** Explicit runtime switch for an isolated, non-payment demo deployment. */
export function demoGuestEnabled() {
  return process.env.DEMO_GUEST_ENABLED === "true";
}

export function safeGuestRedirect(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[\\\r\n]/.test(value)
    ? value : "/";
}
