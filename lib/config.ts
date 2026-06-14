/** Matches the balanced preset default; used when custom preset has no model override. */
export const DEFAULT_MODEL = "z-ai/glm-5.1";
export const DEFAULT_TEMPERATURE = 0.2;

export const SAMPLE_IDEA = {
  projectName: "TutorMarket",
  projectIdea:
    "A marketplace where students can find tutors, book sessions, pay online, message tutors, and leave reviews. Tutors can create profiles, set availability, define subjects, and manage bookings. Admins can review tutor applications and resolve disputes.",
  appType: "marketplace" as const,
  preferredStack: "Next.js, TypeScript, PostgreSQL, Prisma, Stripe, Clerk",
  targetAgent: "Cursor" as const,
};

export function getServerDefaultModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
}

export function getClientDefaultModel(): string {
  return (
    process.env.NEXT_PUBLIC_OPENROUTER_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}
