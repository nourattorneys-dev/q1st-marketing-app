/** A form field as text, cut to `max` characters; a missing field or a file is "". */
export function formText(form: FormData, name: string, max = 1000): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, max) : "";
}
