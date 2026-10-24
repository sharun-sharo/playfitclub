import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WHATSAPP_MESSAGES, WHATSAPP_NUMBER_DEFAULT, whatsappUrl } from "./whatsapp";

describe("WhatsApp enquiries", () => {
  it("uses the PlayFit Club number and the default pricing message", () => {
    const previous = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    expect(whatsappUrl("pricing")).toBe(`https://wa.me/${WHATSAPP_NUMBER_DEFAULT}?text=${encodeURIComponent(WHATSAPP_MESSAGES.pricing)}`);
    expect(WHATSAPP_MESSAGES.general).toBe("Hi! I'm interested in PlayFit Club. Could you please share the pricing details and how to get started?");
    expect(whatsappUrl("individual")).toContain("individual");
    expect(whatsappUrl("gym")).not.toBe(whatsappUrl("upgrade"));
    expect(whatsappUrl("renewal")).toContain(encodeURIComponent("renew"));
    if (previous === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    else process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = previous;
  });

  it("keeps login as a real sign-in route", () => {
    const page = readFileSync("apps/web/src/app/login/page.tsx", "utf8");
    const route = readFileSync("apps/web/src/app/api/auth/login/route.ts", "utf8");
    expect(page).toContain("/api/auth/login");
    expect(page).not.toContain("wa.me");
    expect(page).not.toContain("whatsapp");
    expect(route).toContain("allowRequest");
    expect(route).not.toContain("wa.me");
    expect(route).not.toContain("whatsapp");
  });
});
