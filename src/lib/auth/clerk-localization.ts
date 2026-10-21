import { arSA } from "@clerk/localizations";

/** Clerk's sign-in and account screens follow the interface language (design §7); English is Clerk's own default. */
export const clerkLocalizationFor = (locale: string) => (locale === "ar" ? arSA : undefined);

