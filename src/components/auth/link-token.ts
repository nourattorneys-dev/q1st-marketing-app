/** The `token` of an emailed link as the page received it: one value, at most 200 characters. */
export function linkToken(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.slice(0, 200) : "";
}
