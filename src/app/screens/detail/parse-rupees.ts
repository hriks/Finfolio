// Pure helper: parses a rupee-string (as typed in the amount input) into
// integer paise, or null if the input isn't a valid positive amount.
export const parseRupees = (input: string): number | null => {
  const cleaned = input.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};
