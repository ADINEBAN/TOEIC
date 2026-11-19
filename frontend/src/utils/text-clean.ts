const TRANSCRIPT_NOISE_REGEX =
  /(?:&gt;&gt;|>>|[♪♫]|\[(?:music|âm nhạc|nhạc|applause|vỗ tay|laughter|tiếng cười|cheering|sound|inaudible)\]|\((?:music|âm nhạc)\))/gi;

const REDUNDANT_POS_PREFIX_REGEX = /^\[(?:Từ vựng[^\]]*)\]\s*/i;

export function cleanStudyText(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .replace(TRANSCRIPT_NOISE_REGEX, " ")
    .replace(/\s+/g, " ")
    .replace(/^[—\-\s]+|[—\-\s]+$/g, "")
    .trim();
}

export function cleanMeaningText(raw?: string | null): string {
  const cleaned = cleanStudyText(raw);
  if (!cleaned) return "";
  return cleaned.replace(REDUNDANT_POS_PREFIX_REGEX, "").trim();
}
