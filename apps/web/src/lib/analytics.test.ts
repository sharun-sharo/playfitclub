import { describe, expect, it } from "vitest";
import {
  analyticsPath,
  buildEvent,
  commandsForNavigation,
  conversionRate,
  gaMeasurementId,
  readAudienceCounts,
  readVisitCount,
  reportingFlags,
} from "./analytics";

describe("analytics events", () => {
  it("keeps personal details out of event payloads", () => {
    const event = buildEvent("whatsapp_enquiry_clicked", {
      audience: "player",
      phone: "919566551345",
      email: "ada@example.com",
      name: "Ada",
      token: "session-token",
      code: "AB12CD",
      message: "Please call me",
      landmarks: "[]",
    });
    expect(event).toEqual({ name: "whatsapp_enquiry_clicked", params: { audience: "player" } });
    const encoded = JSON.stringify(event);
    expect(encoded).not.toContain("919566551345");
    expect(encoded).not.toContain("ada@example.com");
    expect(encoded).not.toContain("session-token");
    expect(encoded).not.toContain("AB12CD");
    expect(encoded).not.toContain("Please call");

    const page = commandsForNavigation("G-ABC123", "/join/AB12CD?token=sek&email=ada@example.com&phone=919566551345", null);
    expect(page.pageViews[0]?.params.page_path).toBe("/join");
    expect(JSON.stringify(page.pageViews)).not.toContain("AB12CD");
    expect(JSON.stringify(page.pageViews)).not.toContain("sek");
    expect(JSON.stringify(page.pageViews)).not.toContain("ada@example.com");
  });

  it("uses the public measurement ID when the env var is unset", () => {
    expect(gaMeasurementId({})).toBe("G-736X842XQL");
    expect(gaMeasurementId({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "" })).toBe("G-736X842XQL");
    expect(gaMeasurementId({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "  " })).toBe("G-736X842XQL");
    expect(gaMeasurementId({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "UA-123" })).toBeNull();
    expect(gaMeasurementId({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-CUSTOM1" })).toBe("G-CUSTOM1");
    const planned = commandsForNavigation(null, "/pricing", null);
    expect(planned.bootstrap).toBeNull();
    expect(planned.pageViews).toEqual([]);
  });

  it("emits one GA page view per navigation", () => {
    const first = commandsForNavigation("G-ABC123", "/pricing?token=secret", null);
    expect(first.bootstrap).toEqual({ measurementId: "G-ABC123", sendPageView: false });
    expect(first.pageViews).toEqual([{ name: "page_view", params: { page_path: "/pricing", page_location: "/pricing" } }]);
    const duplicate = commandsForNavigation("G-ABC123", "/pricing", first.nextKey);
    expect(duplicate.pageViews).toEqual([]);
    expect(duplicate.bootstrap?.sendPageView).toBe(false);
  });

  it("distinguishes player and gym enquiries without a phone number", () => {
    const player = buildEvent("whatsapp_enquiry_clicked", { audience: "player", phone: "919566551345" });
    const gym = buildEvent("whatsapp_enquiry_clicked", { audience: "gym", phone: "919566551345", email: "gym@example.com" });
    expect(player?.params).toEqual({ audience: "player" });
    expect(gym?.params).toEqual({ audience: "gym" });
    expect(player?.params).not.toHaveProperty("phone");
    expect(gym?.params).not.toHaveProperty("phone");
    expect(JSON.stringify(player)).not.toContain("919");
    expect(JSON.stringify(gym)).not.toContain("919");
    expect(analyticsPath("/login?next=/join/AB12CD&code=AB12CD")).toBe("/login");
    expect(analyticsPath("/login?next=/dashboard")).toContain("next=");
  });

  it("does not turn a missing reporting response into zero", () => {
    expect(readVisitCount(null)).toBeNull();
    expect(readVisitCount({})).toBeNull();
    expect(readAudienceCounts(null)).toBeNull();
    expect(readAudienceCounts({ data: [{ eventData: "player", count: 4 }, { eventData: "gym", count: 2 }] })).toEqual({ player: 4, gym: 2 });
    expect(conversionRate(null, 10)).toBeNull();
    expect(reportingFlags({})).toEqual({ vercel: false, ga4: false });
    const flags = reportingFlags({ VERCEL_ANALYTICS_ACCESS_TOKEN: "secret-token", VERCEL_ANALYTICS_PROJECT_ID: "prj_123" });
    expect(flags.vercel).toBe(true);
    expect(JSON.stringify(flags)).not.toContain("secret-token");
  });
});
