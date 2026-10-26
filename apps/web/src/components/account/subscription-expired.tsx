import Link from "next/link";
import { TrackedExternal } from "@/components/analytics/tracked-link";
import { whatsappUrl } from "@/lib/whatsapp";

export function SubscriptionExpired({ message, note, tv = false }: { message?: string; note?: string; tv?: boolean }) {
  return (
    <main className={tv ? "grid min-h-screen place-items-center bg-[#1c1f24] px-12 py-16 text-[#f4f7f2]" : "grid min-h-screen place-items-center bg-[#1c1f24] px-6 py-16 text-[#f4f7f2]"}>
      <section className={tv ? "w-full max-w-3xl" : "w-full max-w-lg"}>
        <p className={tv ? "text-lg font-semibold tracking-wide text-[#BEFF39]" : "text-sm font-semibold tracking-wide text-[#BEFF39]"}>Subscription</p>
        <h1 className={tv ? "mt-3 text-6xl font-semibold" : "mt-3 text-4xl font-semibold"}>Play is paused</h1>
        <p className={tv ? "mt-6 text-2xl leading-relaxed" : "mt-4 text-lg leading-relaxed"}>
          {message ?? "This subscription has expired. Your account and history stay in PlayFit Club. New play starts again after the PlayFit Club team renews it."}
        </p>
        <p className={tv ? "mt-4 text-xl leading-relaxed text-[#c9d4c4]" : "mt-3 text-sm leading-relaxed text-[#c9d4c4]"}>
          Renew opens WhatsApp. Sending that message does not mark the subscription paid or active.
        </p>
        {note ? <p className={tv ? "mt-4 text-xl leading-relaxed text-[#BEFF39]" : "mt-3 text-sm leading-relaxed text-[#BEFF39]"}>{note}</p> : null}
        <div className={tv ? "mt-10 flex flex-wrap gap-4" : "mt-8 flex flex-wrap gap-3"}>
          <TrackedExternal className={tv ? "rounded-full bg-[#BEFF39] px-8 py-4 text-xl font-semibold text-[#1c1f24]" : "rounded-full bg-[#BEFF39] px-5 py-3 text-sm font-semibold text-[#1c1f24]"} href={whatsappUrl("renewal")} events={[{ name: "whatsapp_enquiry_clicked", params: { audience: "player" } }]}>
            Renew
          </TrackedExternal>
          <Link className={tv ? "rounded-full border border-[#BEFF39] px-8 py-4 text-xl font-semibold text-[#BEFF39]" : "rounded-full border border-[#BEFF39] px-5 py-3 text-sm font-semibold text-[#BEFF39]"} href="/dashboard">
            View history
          </Link>
        </div>
      </section>
    </main>
  );
}
