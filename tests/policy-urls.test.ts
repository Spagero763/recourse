import { describe, expect, it } from "vitest";
import { scoreUrl } from "../convex/policies";

// Every rejection below is a page the scorer once accepted and paid Firecrawl
// to read. Substring matching on the whole path is what did it.
describe("rejects pages a claim cannot be argued from", () => {
  it("does not read a product slug containing 'cancelling' as a cancellation policy", () => {
    expect(
      scoreUrl(
        "https://www.currys.co.uk/products/sony-wh1000xm6-wireless-bluetooth-noisecancelling-headphones-black-10282441.html",
      ),
    ).toBeNull();
  });

  it("does not read a hyphenated 'noise-cancelling' slug as a policy either", () => {
    expect(
      scoreUrl("https://www.currys.co.uk/gaming/noise-cancelling-headphones"),
    ).toBeNull();
  });

  it("does not read a catalogue section named 'warranties' as a warranty policy", () => {
    expect(
      scoreUrl(
        "https://business.currys.co.uk/catalogue/office-supplies/warranties/hpe-tech-care-basic-service-post-warranty/P280297P",
      ),
    ).toBeNull();
  });

  it("rejects a blog post that happens to discuss refunds", () => {
    expect(scoreUrl("https://example.com/blog/our-refund-story")).toBeNull();
  });

  it("rejects anything carrying a SKU", () => {
    expect(scoreUrl("https://example.com/returns/item-1029384756")).toBeNull();
  });

  it("rejects a product page whose slug contains 'cancellation'", () => {
    expect(
      scoreUrl(
        "https://www.johnlewis.com/apple-airpods-4th-generation-with-active-noise-cancellation-usb-c-charging-case-2024/p112608885",
      ),
    ).toBeNull();
  });

  it("rejects a browse-tree facet named after a guarantee", () => {
    expect(
      scoreUrl(
        "https://www.johnlewis.com/browse/electricals/fridges-freezers/freezers/interest-bearing-credit/2-year-guarantee-included/_/N-adrZq1imZ1yzvi2y",
      ),
    ).toBeNull();
    expect(
      scoreUrl(
        "https://www.johnlewis.com/browse/furniture-lights/living-room/cabinets-sideboards/brown/15-year-guarantee-included/_/N-c52Z1z14184Z1yzvi2u",
      ),
    ).toBeNull();
  });

  it("rejects a SKU however it is prefixed", () => {
    expect(scoreUrl("https://example.com/returns/p112608885")).toBeNull();
    expect(scoreUrl("https://example.com/returns/sku9988776")).toBeNull();
  });

  it("rejects anything buried more than five segments deep", () => {
    expect(scoreUrl("https://example.com/a/b/c/d/e/refunds")).toBeNull();
  });

  it("rejects the bare root", () => {
    expect(scoreUrl("https://example.com/")).toBeNull();
  });

  it("rejects an unparseable url rather than throwing", () => {
    expect(scoreUrl("not a url")).toBeNull();
  });
});

describe("accepts the pages a claim is argued from", () => {
  const accepted: Array<[string, "refund" | "terms" | "other"]> = [
    ["https://www.currys.co.uk/returns-and-refunds", "refund"],
    ["https://www.currys.co.uk/terms-and-conditions", "terms"],
    ["https://www.johnlewis.com/customer-services/returns-policy", "refund"],
    ["https://www.argos.co.uk/help/terms-conditions/", "terms"],
    ["https://example.com/legal/cancellation-policy", "refund"],
    ["https://example.com/warranty", "refund"],
    ["https://example.com/complaints", "other"],
    // The pages that actually matter on John Lewis, alongside the facets above.
    ["https://www.johnlewis.com/customer-services/returns", "refund"],
    [
      "https://www.johnlewis.com/customer-services/guarantees-and-troubleshooting-guides",
      "refund",
    ],
    [
      "https://www.johnlewis.com/customer-services/shopping-with-us/terms-and-conditions",
      "terms",
    ],
  ];

  for (const [url, kind] of accepted) {
    it(`accepts ${new URL(url).pathname} as ${kind}`, () => {
      const scored = scoreUrl(url);
      expect(scored).not.toBeNull();
      expect(scored!.kind).toBe(kind);
      expect(scored!.score).toBeGreaterThan(0);
    });
  }
});

describe("ranks the more load-bearing page higher", () => {
  it("puts refunds above terms", () => {
    const refund = scoreUrl("https://example.com/refunds")!;
    const terms = scoreUrl("https://example.com/terms")!;
    expect(refund.score).toBeGreaterThan(terms.score);
  });

  it("penalises a buried help-centre article", () => {
    const shallow = scoreUrl("https://example.com/returns")!;
    const buried = scoreUrl("https://example.com/a/b/c/returns")!;
    expect(buried.score).toBeLessThan(shallow.score);
  });
});
