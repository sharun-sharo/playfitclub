export const WHATSAPP_NUMBER_DEFAULT = "919566551345";

export const WHATSAPP_MESSAGES = {
  general: "Hi! I'm interested in PlayFit Club. Could you please share the pricing details and how to get started?",
  pricing: "Hi! I'm interested in PlayFit Club. Could you please share the pricing details and how to get started?",
  individual: "Hi! I'm interested in an individual PlayFit Club subscription. Could you please share the Individual Pro details and how to get started?",
  gym: "Hi! I'm interested in a gym PlayFit Club subscription for member seats. Could you please share the gym plans and how to get started?",
  upgrade: "Hi! I'd like to upgrade my PlayFit Club subscription. Could you please share the upgrade options?",
  renewal: "Hi! I'd like to renew my PlayFit Club subscription. Could you please help me renew?",
} as const;

export type WhatsAppIntent = keyof typeof WHATSAPP_MESSAGES;

export function whatsappNumber() {
  const digits = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? WHATSAPP_NUMBER_DEFAULT).replace(/\D/g, "");
  return digits || WHATSAPP_NUMBER_DEFAULT;
}

export function whatsappUrl(intent: WhatsAppIntent = "general") {
  return `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(WHATSAPP_MESSAGES[intent])}`;
}
