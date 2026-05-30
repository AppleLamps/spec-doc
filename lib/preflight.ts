/** Heuristic: does preflight content require user confirmation before compile? */

export function needsPreflightConfirmation(content: string): boolean {
  if (!content.trim()) return false;

  if (/can proceed with assumptions\s*:\s*no\b/i.test(content)) return true;
  if (/proceed with assumptions\s*:\s*no\b/i.test(content)) return true;
  if (/proceed\s*:\s*no\b/i.test(content)) return true;

  if (/can proceed with assumptions\s*:\s*yes\b/i.test(content)) return false;
  if (/proceed with assumptions\s*:\s*yes\b/i.test(content)) return false;
  if (/proceed\s*:\s*yes\b/i.test(content)) return false;

  const hasCritical =
    /critical missing decisions/i.test(content) &&
    /-\s+\S/.test(content.slice(content.search(/critical missing decisions/i)));
  const hasRisky =
    /risky ambiguities/i.test(content) &&
    /-\s+\S/.test(content.slice(content.search(/risky ambiguities/i)));

  return hasCritical || hasRisky;
}

export function extractPreflightAssumptions(content: string): string {
  if (!content.trim()) return "";

  const match = content.match(
    /##\s*Reasonable assumptions[\s\S]*?(?=##\s|$)/i,
  );
  if (match) return match[0].trim();

  return content.slice(0, 2000);
}
