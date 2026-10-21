import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/editor/field-errors";

describe("field errors from a 400 invalid_input (spec v1.1 §9)", () => {
  it("puts each message on its form field, accepting the engine's snake_case names", () => {
    const result = fieldErrors({ status: 400, code: "invalid_input", message: "x", fields: { meta_description: "Too long", slug: "Use lowercase letters" } });
    expect(result.byField).toEqual({ metaDescription: "Too long", slug: "Use lowercase letters" });
    expect(result.other).toEqual([]);
  });

  it("keeps messages for fields the form doesn't have", () => {
    const result = fieldErrors({ status: 400, code: "invalid_input", message: "x", fields: { photo: "Required" } });
    expect(result.byField).toEqual({});
    expect(result.other).toEqual([{ field: "photo", message: "Required" }]);
  });

  it("is empty without field errors", () => {
    expect(fieldErrors(null)).toEqual({ byField: {}, other: [] });
    expect(fieldErrors({ status: 409, code: "version_conflict", message: "x" })).toEqual({ byField: {}, other: [] });
  });
});
