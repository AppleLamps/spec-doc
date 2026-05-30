/** Parse agent-readiness score from quality-review.md */

export function parseReadinessScore(content: string): number | null {
  if (!content.trim()) return null;

  const patterns = [
    /agent-readiness score\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i,
    /readiness score\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i,
    /agent readiness\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const score = Number(match[1]);
      if (Number.isFinite(score)) return Math.min(10, Math.max(1, score));
    }
  }

  return null;
}

export function formatReadinessLabel(score: number | null): string {
  if (score === null) return "Not reviewed";
  return `Readiness ${score}/10`;
}
