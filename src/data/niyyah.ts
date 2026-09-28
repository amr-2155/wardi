export type NiyyahCategory = {
  id: string;
  titleAr: string;
  titleEn: string;
  exampleAr: string;
  exampleEn: string;
};

export const NIYYAH_CATEGORIES: NiyyahCategory[] = [
  {
    id: "quran",
    titleAr: "القرآن",
    titleEn: "Quran",
    exampleAr: "أختم القرآن تلاوةً مع تدبّر",
    exampleEn: "Complete a Quran khatma with reflection",
  },
  {
    id: "dhikr",
    titleAr: "الذكر",
    titleEn: "Dhikr",
    exampleAr: "أحافظ على أذكار الصباح والمساء",
    exampleEn: "Stay consistent with morning & evening adhkar",
  },
  {
    id: "prayer",
    titleAr: "الصلاة",
    titleEn: "Prayer",
    exampleAr: "أحافظ على صلاة الضحى وسنن الرواتب",
    exampleEn: "Keep up the Duha prayer and sunan",
  },
  {
    id: "knowledge",
    titleAr: "العلم",
    titleEn: "Knowledge",
    exampleAr: "أقرأ بابًا من العلم الشرعي هذا الأسبوع",
    exampleEn: "Read a chapter of Islamic knowledge this week",
  },
  {
    id: "work",
    titleAr: "العمل",
    titleEn: "Work",
    exampleAr: "أتقن عملي وأخلص فيه لله",
    exampleEn: "Do my work with excellence and sincerity",
  },
  {
    id: "family",
    titleAr: "الأسرة",
    titleEn: "Family",
    exampleAr: "أصل رحمي وأبرّ والديّ",
    exampleEn: "Keep ties with family and honor my parents",
  },
  {
    id: "charity",
    titleAr: "الصدقة",
    titleEn: "Charity",
    exampleAr: "أتصدق كل يوم ولو بشيء يسير",
    exampleEn: "Give charity daily, even a little",
  },
  {
    id: "self",
    titleAr: "تطوير النفس",
    titleEn: "Self Development",
    exampleAr: "أتخلى عن عادة سيئة واحدة",
    exampleEn: "Let go of one bad habit",
  },
  {
    id: "other",
    titleAr: "أخرى",
    titleEn: "Other",
    exampleAr: "",
    exampleEn: "",
  },
];