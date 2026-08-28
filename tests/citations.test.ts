import { describe, expect, it } from "vitest";
import { refKey, segmentCitations } from "../src/lib/format";

// The model writes refs the way it renders them in prose. The stored ref is
// bare. When those did not compare equal, every citation silently failed to
// bind and the letters looked sourced while being untraceable.
describe("citation references match across how they are written", () => {
  const same: Array<[string, string]> = [
    ["[5.]", "5."],
    ["[5.]", "5"],
    ["[13]", "13"],
    ["13.", "13"],
    ["[Section 4]", "section 4"],
    ["(9.2)", "9.2"],
    ["[Article 5(1)(c)] ", "article 51c"],
  ];

  for (const [written, stored] of same) {
    it(`treats ${written} and ${stored} as one citation`, () => {
      expect(refKey(written)).toBe(refKey(stored));
    });
  }

  it("keeps genuinely different provisions apart", () => {
    expect(refKey("[5.]")).not.toBe(refKey("[6.]"));
    expect(refKey("[9.1]")).not.toBe(refKey("[9.2]"));
  });
});

describe("splitting a letter into citations and prose", () => {
  it("finds each bracketed reference and leaves the wording untouched", () => {
    const body =
      "Your terms at [5.] state the total cost, and [13] says you refund by the original method.";
    const parts = segmentCitations(body);

    expect(parts.filter((p) => p.ref).map((p) => p.ref)).toEqual(["5.", "13"]);
    expect(parts.map((p) => p.text).join("")).toBe(body);
  });

  it("returns a letter with no citations as a single run of prose", () => {
    const body = "Please refund the amount by 11 September.";
    const parts = segmentCitations(body);
    expect(parts).toHaveLength(1);
    expect(parts[0].ref).toBeUndefined();
  });

  it("handles a citation at the very start and very end", () => {
    const parts = segmentCitations("[2.2] applies here, and so does [9.1]");
    expect(parts[0].ref).toBe("2.2");
    expect(parts[parts.length - 1].ref).toBe("9.1");
  });

  it("does not treat an unclosed bracket as a citation", () => {
    const body = "The clause [5. was never closed";
    const parts = segmentCitations(body);
    expect(parts.filter((p) => p.ref)).toHaveLength(0);
    expect(parts.map((p) => p.text).join("")).toBe(body);
  });

  it("never loses or duplicates text", () => {
    const body =
      "One [a] two [b] three [c] four. Trailing prose with no reference.";
    expect(segmentCitations(body).map((p) => p.text).join("")).toBe(body);
  });
});
