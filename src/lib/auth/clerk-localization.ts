import { arSA } from "@clerk/localizations";

/** Arabic month and day names with Latin digits (design §7), for Clerk's date templates. */
const AR = "ar-u-nu-latn";

/**
 * Clerk's Arabic, plus what it leaves in English where people sign in (final review): the field placeholders, the
 * wrong-password and wrong-code errors, the combined sign-in title, and dates formatted in en-US.
 */
const arabic = {
  ...arSA,
  formFieldInputPlaceholder__emailAddress: "أدخل بريدك الإلكتروني",
  formFieldInputPlaceholder__emailAddress_username: "أدخل البريد الإلكتروني أو اسم المستخدم",
  formFieldInputPlaceholder__password: "أدخل كلمة المرور",
  signIn: { ...arSA.signIn, start: { ...arSA.signIn?.start, titleCombined: "المتابعة إلى {{applicationName}}" } },
  unstable__errors: {
    ...arSA.unstable__errors,
    form_password_incorrect: "كلمة المرور غير صحيحة. حاول مرة أخرى.",
    form_code_incorrect: "الرمز غير صحيح. حاول مرة أخرى.",
    form_param_nil: "هذا الحقل مطلوب.",
    form_param_format_invalid: "القيمة المُدخلة غير صالحة.",
    form_password_length_too_short: "كلمة المرور قصيرة جدًا: يجب ألا تقل عن 8 أحرف.",
  },
  dates: {
    previous6Days: `آخر {{ date | weekday('${AR}','long') }} في {{ date | timeString('${AR}') }}`,
    lastDay: `أمس في {{ date | timeString('${AR}') }}`,
    sameDay: `اليوم في {{ date | timeString('${AR}') }}`,
    nextDay: `غدًا في {{ date | timeString('${AR}') }}`,
    next6Days: `{{ date | weekday('${AR}','long') }} في {{ date | timeString('${AR}') }}`,
    numeric: `{{ date | numeric('${AR}') }}`,
  },
};

/** Clerk's sign-in and account screens follow the interface language (design §7); English is Clerk's own default. */
export const clerkLocalizationFor = (locale: string) => (locale === "ar" ? arabic : undefined);
