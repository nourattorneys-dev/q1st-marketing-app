/**
 * Vercel refuses request bodies over 4.5 MB before a server action runs, and the browser then sees "can't be reached".
 * Uploads stay under 4 MB (room for the form's other fields), whatever larger limit the engine allows.
 */
export const UPLOAD_MAX_BYTES = 4 * 1_048_576;

export const uploadLimit = (engineMaxBytes: number) => Math.min(engineMaxBytes, UPLOAD_MAX_BYTES);

