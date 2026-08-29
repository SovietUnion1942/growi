/**
 * Shared `name (1).ext` numbering used to propose a non-conflicting file name on
 * a non-overwrite CONFLICT. Both `NasStorageService.putFile` and
 * `NasStorageService.completeChunkedUpload` (Req 3.2 / 10.6) must offer the same
 * suggestion, so the logic lives here as a single pure source rather than a
 * per-method closure.
 */

/** Max number of `name (n).ext` candidates probed before giving up (Req 3.2). */
export const MAX_SUGGESTION_ATTEMPTS = 999;

/**
 * Split a file name into the stem and its extension (including the leading dot).
 * A leading-dot name with no further dot (`.env`, `README`) has an empty ext, so
 * the numbering lands as `.env (1)` / `README (1)`.
 */
export const splitFileName = (name: string): { stem: string; ext: string } => {
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === name.length - 1) {
    return { stem: name, ext: '' };
  }
  return { stem: name.slice(0, lastDot), ext: name.slice(lastDot) };
};

/**
 * Probe `name (1).ext`, `name (2).ext`, ... and return the first candidate the
 * `isTaken` probe reports as free. Returns `undefined` when every candidate up
 * to `MAX_SUGGESTION_ATTEMPTS` is taken (the caller then returns a bare
 * CONFLICT).
 *
 * `isTaken` must resolve `true` only when it can positively confirm the
 * candidate already exists; any ambiguous probe result should be treated as
 * taken so the search keeps moving.
 */
export const suggestNonConflictingName = async (
  targetName: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string | undefined> => {
  const { stem, ext } = splitFileName(targetName);
  for (let n = 1; n <= MAX_SUGGESTION_ATTEMPTS; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    // biome-ignore lint/performance/noAwaitInLoops: sequential probing is intentional — stop at the first free name
    const taken = await isTaken(candidate);
    if (!taken) {
      return candidate;
    }
  }
  return undefined;
};
