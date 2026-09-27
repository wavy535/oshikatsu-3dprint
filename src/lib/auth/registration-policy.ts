/** Deployment policy. Disabling email verification never marks an email verified. */
export function emailVerificationRequired() {
  return process.env.AUTH_EMAIL_VERIFICATION !== "disabled";
}

export function creatorApplicationsEnabled() {
  return emailVerificationRequired() && process.env.CREATOR_APPLICATIONS_ENABLED === "true";
}
