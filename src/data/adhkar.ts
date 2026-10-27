export type DhikrCategoryId =
  | "morning"
  | "evening"
  | "sleep"
  | "wakeup"
  | "after-prayer"
  | "home"
  | "mosque"
  | "food"
  | "travel"
  | "general";

export type DhikrType = "quran" | "hadith";

export type DhikrAuthenticity = "muttafaq" | "sahih" | "hasan";

export type DhikrTime = "morning" | "evening" | "both";

export type DhikrCategory = {
  id: DhikrCategoryId;
  titleAr: string;
  titleEn: string;
};

export type DhikrItem = {
  id: string;
  category: DhikrCategoryId;
  type: DhikrType;
  text: string;
  source: string;
  authenticity: DhikrAuthenticity;
  count?: number;
  times?: DhikrTime;
  note?: string;
  /** Display title for standalone surah cards (mushaf-style header). */
  title?: string;
};

export const DHIKR_CATEGORIES: DhikrCategory[] = [
  { id: "morning", titleAr: "أذكار الصباح", titleEn: "Morning Adhkar" },
  { id: "evening", titleAr: "أذكار المساء", titleEn: "Evening Adhkar" },
  { id: "sleep", titleAr: "أذكار النوم", titleEn: "Before Sleep" },
  { id: "wakeup", titleAr: "أذكار الاستيقاظ", titleEn: "After Waking Up" },
  { id: "after-prayer", titleAr: "بعد الصلاة", titleEn: "After Prayer" },
  { id: "home", titleAr: "دخول المنزل والخروج منه", titleEn: "Entering & Leaving Home" },
  { id: "mosque", titleAr: "دخول المسجد والخروج منه", titleEn: "Entering & Leaving the Mosque" },
  { id: "food", titleAr: "الطعام والشراب", titleEn: "Eating & Drinking" },
  { id: "travel", titleAr: "السفر", titleEn: "Travel" },
  { id: "general", titleAr: "أذكار عامة", titleEn: "General Adhkar" },
];

export const AYAT_AL_KURSI =
  "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ";

export const SURAH_IKHLAS =
  "قُلْ هُوَ اللَّهُ أَحَدٌ (1) اللَّهُ الصَّمَدُ (2) لَمْ يَلِدْ وَلَمْ يُولَدْ (3) وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ (4)";

export const SURAH_FALAQ =
  "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ (1) مِنْ شَرِّ مَا خَلَقَ (2) وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ (3) وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ (4) وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ (5)";

export const SURAH_NAS =
  "قُلْ أَعُوذُ بِرَبِّ النَّاسِ (1) مَلِكِ النَّاسِ (2) إِلَٰهِ النَّاسِ (3) مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ (4) الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ (5) مِنَ الْجِنَّةِ وَالنَّاسِ (6)";

export const DHIKR_ITEMS: DhikrItem[] = [
  /* ── Morning & Evening ── */
  {
    id: "day-ayatal-kursi",
    category: "morning",
    times: "both",
    type: "quran",
    text: AYAT_AL_KURSI,
    source: "القرآن الكريم — سورة البقرة (2:255)",
    authenticity: "sahih",
    note: "النبي ﷺ: «من قالها حين يصبح أُجير من الجن حتى يمسي، ومن قالها حين يمسي أُجير من الجن حتى يصبح» (رواه النسائي وحسنه الألباني).",
  },
  {
    id: "day-ikhlas",
    category: "morning",
    times: "both",
    type: "quran",
    title: "سورة الإخلاص",
    text: SURAH_IKHLAS,
    source: "القرآن الكريم — سورة الإخلاص (112)",
    authenticity: "sahih",
    count: 3,
    note: "تُقرأ ثلاثًا مع المعوذتين؛ تكفي من كل شيء (رواه أبو داود والترمذي وصححه الألباني).",
  },
  {
    id: "day-falaq",
    category: "morning",
    times: "both",
    type: "quran",
    title: "سورة الفلق",
    text: SURAH_FALAQ,
    source: "القرآن الكريم — سورة الفلق (113)",
    authenticity: "sahih",
    count: 3,
    note: "تُقرأ ثلاثًا مع أختيها صباحًا ومساءً.",
  },
  {
    id: "day-nas",
    category: "morning",
    times: "both",
    type: "quran",
    title: "سورة الناس",
    text: SURAH_NAS,
    source: "القرآن الكريم — سورة الناس (114)",
    authenticity: "sahih",
    count: 3,
    note: "تُقرأ ثلاثًا مع أختيها صباحًا ومساءً.",
  },
  {
    id: "day-asbahna",
    category: "morning",
    times: "morning",
    type: "hadith",
    text: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ.",
    source: "رواه مسلم",
    authenticity: "sahih",
  },
  {
    id: "day-amsayna",
    category: "evening",
    times: "evening",
    type: "hadith",
    text: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ.",
    source: "رواه مسلم",
    authenticity: "sahih",
  },
  {
    id: "day-bika-asbahna",
    category: "morning",
    times: "morning",
    type: "hadith",
    text: "اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ.",
    source: "رواه الترمذي",
    authenticity: "hasan",
  },
  {
    id: "day-bika-amsayna",
    category: "evening",
    times: "evening",
    type: "hadith",
    text: "اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ.",
    source: "رواه الترمذي",
    authenticity: "hasan",
  },
  {
    id: "day-sayyid-istighfar",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ.",
    source: "رواه البخاري",
    authenticity: "sahih",
    note: "«سيد الاستغفار» — قال ﷺ: من قالها موقنًا بها فمات من يومه دخل الجنة.",
  },
  {
    id: "day-allahumma-aafini",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَهَ إِلَّا أَنْتَ، اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْكُفْرِ وَالْفَقْرِ، اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عَذَابِ الْقَبْرِ، لَا إِلَهَ إِلَّا أَنْتَ.",
    source: "رواه أبو داود — حسنه الألباني",
    authenticity: "hasan",
    count: 3,
  },
  {
    id: "day-hasbiyallah",
    category: "morning",
    times: "both",
    type: "quran",
    text: "حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ، عَلَيْهِ تَوَكَّلْتُ، وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ.",
    source: "القرآن الكريم — سورة التوبة (9:129)",
    authenticity: "hasan",
    count: 7,
    note: "يُستحب سَبْعَ مرات؛ كما جاء أن من قالها حين يصبح وحين يمسي كفاه الله ما أهمّه (رواه أبو داود وحسّنه جمع من أهل العلم).",
  },
  {
    id: "day-lailaha-x10",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ.",
    source: "رواه أبو داود والنسائي — صححه الألباني",
    authenticity: "sahih",
    count: 10,
    note: "من قالها عشر مرات حين يصبح كتب الله له عشر حسنات ومحا عنه عشر سيئات ورفع له عشر درجات.",
  },
  {
    id: "day-ash-hiduka",
    category: "morning",
    times: "morning",
    type: "hadith",
    text: "اللَّهُمَّ إِنِّي أَصْبَحْتُ أُشْهِدُكَ، وَأُشْهِدُ حَمَلَةَ عَرْشِكَ، وَمَلَائِكَتَكَ، وَجَمِيعَ خَلْقِكَ: أَنَّكَ أَنْتَ اللَّهُ لَا إِلَهَ إِلَّا أَنْتَ وَحْدَكَ لَا شَرِيكَ لَكَ، وَأَنَّ مُحَمَّدًا عَبْدُكَ وَرَسُولُكَ.",
    source: "رواه أبو داود والترمذي — صححه الألباني",
    authenticity: "sahih",
    count: 4,
    note: "أربع مرات؛ من قالهن حين يصبح أعتق الله رقبته من النار.",
  },
  {
    id: "day-amsaytu-ashhiduka",
    category: "evening",
    times: "evening",
    type: "hadith",
    text: "اللَّهُمَّ إِنِّي أَمْسَيْتُ أُشْهِدُكَ، وَأُشْهِدُ حَمَلَةَ عَرْشِكَ، وَمَلَائِكَتَكَ، وَجَمِيعَ خَلْقِكَ: أَنَّكَ أَنْتَ اللَّهُ لَا إِلَهَ إِلَّا أَنْتَ وَحْدَكَ لَا شَرِيكَ لَكَ، وَأَنَّ مُحَمَّدًا عَبْدُكَ وَرَسُولُكَ.",
    source: "رواه أبو داود والترمذي — صححه الألباني",
    authenticity: "sahih",
    count: 4,
    note: "أربع مرات؛ من قالهن حين يمسي أعتق الله رقبته من النار.",
  },
  {
    id: "day-awdhu-kalimat",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ.",
    source: "رواه مسلم",
    authenticity: "sahih",
    note: "قال ﷺ: «من قالها حين يمسي لم تضرّه ليلته عقرب». تُقال في الصباح أيضًا.",
  },
  {
    id: "day-ma-asbaha",
    category: "morning",
    times: "morning",
    type: "hadith",
    text: "اللَّهُمَّ مَا أَصْبَحَ بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ.",
    source: "رواه أبو داود والنسائي — صححه الألباني",
    authenticity: "sahih",
    note: "من قالها حين يصبح فقد أدّى شكر يومه.",
  },
  {
    id: "day-ma-amsa",
    category: "evening",
    times: "evening",
    type: "hadith",
    text: "اللَّهُمَّ مَا أَمْسَى بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ.",
    source: "رواه أبو داود والنسائي — صححه الألباني",
    authenticity: "sahih",
    note: "من قالها حين يمسي فقد أدّى شكر ليلته.",
  },  {
    id: "day-afwa-afiya",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ، اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي، اللَّهُمَّ اسْتُرْ عَوْرَاتِي وَآمِنْ رَوْعَاتِي، اللَّهُمَّ احْفَظْنِي مِنْ بَيْنِ يَدَيَّ وَمِنْ خَلْفِي وَعَنْ يَمِينِي وَعَنْ شِمَالِي وَمِنْ فَوْقِي، وَأَعُوذُ بِعَظَمَتِكَ أَنْ أُغْتَالَ مِنْ تَحْتِي.",
    source: "رواه أبو داود وابن ماجه — صححه الألباني",
    authenticity: "sahih",
  },
  {
    id: "day-bismillah-amn",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ.",
    source: "رواه أبو داود والترمذي وابن ماجه — صححه الألباني",
    authenticity: "sahih",
    count: 3,
    note: "ثلاث مرات؛ من قالها لم تضرّه فجأة بلاء حتى يصبح.",
  },
  {
    id: "day-subhanallah100",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ.",
    source: "رواه مسلم",
    authenticity: "sahih",
    count: 100,
    note: "من قالها حين يصبح وحين يمسي مئة مرة لم يأتِ أحدٌ يوم القيامة بأفضلَ مما جاء به إلا من قال مثلها أو زاد.",
  },
  {
    id: "day-subhan-adad",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، وَمِدَادَ كَلِمَاتِهِ.",
    source: "رواه مسلم",
    authenticity: "sahih",
    count: 3,
    note: "ثلاث مرات إذا أصبح وإذا أمسى.",
  },

  {
    id: "day-raditu",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا.",
    source: "رواه أبو داود والترمذي — صححه الألباني",
    authenticity: "sahih",
    count: 3,
    note: "ثلاث مرات؛ من قالها حين يصبح وحين يمسي كان حقًا على الله أن يرضيه.",
  },
  {
    /* Duplicate of `day-innaka-hayyu` that used to sit further down this list
       with the same wording. One entry survives, at the stronger of the two
       gradings, and it keeps the note the weaker copy carried. */
    id: "day-ya-hayyu",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ.",
    source: "رواه الحاكم وصححه الألباني",
    authenticity: "sahih",
    note: "وصية النبي ﷺ لفاطمة رضي الله عنها أن تقولها حين تصبح وحين تمسي.",
  },
  {
    id: "day-fitrah-asbahna",
    category: "morning",
    times: "morning",
    type: "hadith",
    text: "أَصْبَحْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَعَلَى كَلِمَةِ الْإِخْلَاصِ، وَعَلَى دِينِ نَبِيِّنَا مُحَمَّدٍ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ، وَعَلَى مِلَّةِ أَبِينَا إِبْرَاهِيمَ حَنِيفًا مُسْلِمًا وَمَا كَانَ مِنَ الْمُشْرِكِينَ.",
    source: "رواه أحمد — صححه الألباني",
    authenticity: "sahih",
  },
  {
    id: "day-fitrah-amsayna",
    category: "evening",
    times: "evening",
    type: "hadith",
    text: "أَمْسَيْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَعَلَى كَلِمَةِ الْإِخْلَاصِ، وَعَلَى دِينِ نَبِيِّنَا مُحَمَّدٍ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ، وَعَلَى مِلَّةِ أَبِينَا إِبْرَاهِيمَ حَنِيفًا مُسْلِمًا وَمَا كَانَ مِنَ الْمُشْرِكِينَ.",
    source: "رواه أحمد — صححه الألباني",
    authenticity: "sahih",
  },
  {
    id: "day-fatir",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "اللَّهُمَّ فَاطِرَ السَّمَاوَاتِ وَالْأَرْضِ، عَالِمَ الْغَيْبِ وَالشَّهَادَةِ، رَبَّ كُلِّ شَيْءٍ وَمَلِيكَهُ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا أَنْتَ، أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ الشَّيْطَانِ وَشِرْكِهِ، وَأَنْ أَقْتَرِفَ عَلَى نَفْسِي سُوءًا أَوْ أَجُرَّهُ إِلَى مُسْلِمٍ.",
    source: "رواه أبو داود والترمذي — صححه الألباني",
    authenticity: "sahih",
    note: "علّمه النبي ﷺ أبا بكر رضي الله عنه يقوله إذا أصبح وإذا أمسى وإذا أخذ مضجعه.",
  },
  {
    id: "day-ilman-nafian",
    category: "morning",
    times: "morning",
    type: "hadith",
    text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا.",
    source: "رواه ابن ماجه — صححه الألباني",
    authenticity: "sahih",
    note: "كان ﷺ يقولها إذا صلى الصبح حين يسلّم.",
  },
  {
    id: "day-astaghfiru-100",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ.",
    source: "رواه البخاري ومسلم",
    authenticity: "muttafaq",
    count: 100,
    note: "كان ﷺ يستغفر في اليوم مئة مرة.",
  },
  {
    /* Duplicate of `day-sallim-ala-muhammad`, which graded the same words as
       sahih on the strength of a virtue narration (رواه مسلم) rather than a
       isnad for this wording. Kept here at the grade its own wording carries —
       الطبراني, حسنه الألباني — so the card never claims more than the source. */
    id: "day-salli-10",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ.",
    source: "رواه الطبراني — حسنه الألباني",
    authenticity: "hasan",
    count: 10,
    note: "عشر مرات حين يصبح وعشرًا حين يمسي؛ من صلى عليّ مرة صلى الله عليه بها عشرًا (رواه مسلم).",
  },

  /* ── Sleep ── */
  {
    id: "sleep-bismika",
    category: "sleep",
    type: "hadith",
    text: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا.",
    source: "رواه البخاري",
    authenticity: "sahih",
  },
  {
    id: "sleep-ayatal-kursi",
    category: "sleep",
    type: "quran",
    text: AYAT_AL_KURSI,
    source: "القرآن الكريم — سورة البقرة (2:255)",
    authenticity: "sahih",
    note: "من قرأها عند النوم لم يزل عليه من الله حافظ ولا يقربه شيطان حتى يصبح (رواه البخاري).",
  },
  {
    id: "sleep-ikhlas",
    category: "sleep",
    type: "quran",
    title: "سورة الإخلاص",
    text: SURAH_IKHLAS,
    source: "القرآن الكريم — سورة الإخلاص (112)",
    authenticity: "muttafaq",
    count: 3,
    note: "كان ﷺ إذا أوى إلى فراشه نفث في كفيه بالمعوذات ومسح بهما جسده.",
  },
  {
    id: "sleep-falaq",
    category: "sleep",
    type: "quran",
    title: "سورة الفلق",
    text: SURAH_FALAQ,
    source: "القرآن الكريم — سورة الفلق (113)",
    authenticity: "muttafaq",
    count: 3,
    note: "كان ﷺ إذا أوى إلى فراشه نفث في كفيه بالمعوذات ومسح بهما جسده.",
  },
  {
    id: "sleep-nas",
    category: "sleep",
    type: "quran",
    title: "سورة الناس",
    text: SURAH_NAS,
    source: "القرآن الكريم — سورة الناس (114)",
    authenticity: "muttafaq",
    count: 3,
    note: "كان ﷺ إذا أوى إلى فراشه نفث في كفيه بالمعوذات ومسح بهما جسده.",
  },
  {
    id: "sleep-aslamtu",
    category: "sleep",
    type: "hadith",
    text: "اللَّهُمَّ أَسْلَمْتُ نَفْسِي إِلَيْكَ، وَوَجَّهْتُ وَجْهِي إِلَيْكَ، وَفَوَّضْتُ أَمْرِي إِلَيْكَ، وَأَلْجَأْتُ ظَهْرِي إِلَيْكَ، رَغْبَةً وَرَهْبَةً إِلَيْكَ، لَا مَلْجَأَ وَلَا مَنْجَا مِنْكَ إِلَّا إِلَيْكَ، آمَنْتُ بِكِتَابِكَ الَّذِي أَنْزَلْتَ، وَبِنَبِيِّكَ الَّذِي أَرْسَلْتَ.",
    source: "رواه البخاري ومسلم",
    authenticity: "muttafaq",
  },

  /* ── Waking up ── */
  {
    id: "wake-hamdulillah",
    category: "wakeup",
    type: "hadith",
    text: "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ.",
    source: "رواه البخاري",
    authenticity: "sahih",
  },
  {
    id: "wake-rada",
    category: "wakeup",
    type: "hadith",
    text: "الْحَمْدُ لِلَّهِ الَّذِي رَدَّ عَلَيَّ رُوحِي، وَعَافَانِي فِي جَسَدِي، وَأَذِنَ لِي بِذِكْرِهِ.",
    source: "رواه الترمذي — حسنه",
    authenticity: "hasan",
  },

  /* ── After Prayer ── */
  {
    id: "prayer-istighfar",
    category: "after-prayer",
    type: "hadith",
    text: "أَسْتَغْفِرُ اللَّهَ، أَسْتَغْفِرُ اللَّهَ، أَسْتَغْفِرُ اللَّهَ، اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ.",
    source: "رواه مسلم",
    authenticity: "sahih",
    note: "ثلاث مرات بعد كل صلاة مفروضة.",
  },
  {
    id: "prayer-ayatal-kursi",
    category: "after-prayer",
    type: "quran",
    text: AYAT_AL_KURSI,
    source: "القرآن الكريم — سورة البقرة (2:255)",
    authenticity: "sahih",
    note: "من قرأها دبر كل صلاة مكتوبة لم يمنعه من دخول الجنة إلا أن يموت (رواه النسائي وصححه الألباني).",
  },
  {
    id: "prayer-tasbih",
    category: "after-prayer",
    type: "hadith",
    text: "سُبْحَانَ اللَّهِ (33)، الْحَمْدُ لِلَّهِ (33)، اللَّهُ أَكْبَرُ (34)، ثُمَّ يُتِمُّ الْمِائَةَ: لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ.",
    source: "رواه مسلم",
    authenticity: "sahih",
    note: "دبر كل صلاة؛ وهي الذكر المفضل عند الله قولًا بعد الصلاة.",
  },

  /* The two entries below used to be joined by four near-identical copies of
     dhikr already listed above (firotah asbahna/amsayna, raditu, ya hayyu,
     salli 'ala Muhammad, astaghfiru, raditu again) — every one of them
     appearing twice in the same list, with two grades fighting over the same
     wording. The copies are gone; each dhikr is listed once, at the stronger of
     its two gradings. scripts/test-adhkar.mjs now fails if a category can ever
     show the same text twice again. */
  {
    id: "day-huda-tuqa-afaf",
    category: "morning",
    times: "both",
    type: "hadith",
    text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى، وَالْعَفَافَ وَالْغِنَى.",
    source: "رواه مسلم",
    authenticity: "sahih",
  },
  {
    id: "day-innaka-asafat",
    category: "evening",
    times: "both",
    type: "hadith",
    text: "اللَّهُمَّ إِنَّا نَسْأَلُكَ الْجَنَّةَ وَنَعُوذُ بِكَ مِنَ النَّارِ.",
    source: "رواه أبو داود — صححه الألباني",
    authenticity: "sahih",
  },

  /* ── Entering & Leaving Home ── */
  {
    id: "home-enter",
    category: "home",
    type: "hadith",
    text: "بِسْمِ اللَّهِ وَلَجْنَا، وَبِسْمِ اللَّهِ خَرَجْنَا، وَعَلَى اللَّهِ رَبِّنَا تَوَكَّلْنَا.",
    source: "رواه أبو داود والترمذي — حسنه الألباني",
    authenticity: "hasan",
  },
  {
    id: "home-exit",
    category: "home",
    type: "hadith",
    text: "بِسْمِ اللَّهِ، تَوَكَّلْتُ عَلَى اللَّهِ، وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ.",
    source: "رواه أبو داود والترمذي — صححه الألباني",
    authenticity: "sahih",
    note: "من قالها عند خروجه من بيته قيل له: كفيت ووقيت.",
  },

  /* ── Entering & Leaving the Mosque ── */
  {
    id: "mosque-enter",
    category: "mosque",
    type: "hadith",
    text: "بِسْمِ اللَّهِ، اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ.",
    source: "رواه مسلم",
    authenticity: "sahih",
  },
  {
    id: "mosque-enter-istiaadha",
    category: "mosque",
    type: "hadith",
    text: "أَعُوذُ بِاللَّهِ الْعَظِيمِ، وَبِوَجْهِهِ الْكَرِيمِ، وَسُلْطَانِهِ الْقَدِيمِ، مِنَ الشَّيْطَانِ الرَّجِيمِ.",
    source: "رواه أبو داود — حسنه الألباني",
    authenticity: "hasan",
    note: "قال ﷺ: إذا قالها أحدكم حين يدخل المسجد قال الشيطان: حفظ مني سائر اليوم.",
  },
  {
    id: "mosque-exit",
    category: "mosque",
    type: "hadith",
    text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ.",
    source: "رواه مسلم",
    authenticity: "sahih",
  },

  /* ── Eating & Drinking ── */
  {
    id: "food-bismillah",
    category: "food",
    type: "hadith",
    text: "بِسْمِ اللَّهِ.",
    source: "رواه أبو داود والترمذي — صححه الألباني",
    authenticity: "sahih",
    note: "قال ﷺ: «إذا أكل أحدكم فليذكر اسم الله تعالى، فإن نسي أن يذكر اسم الله في أوله فليقل: بسم الله أوله وآخره».",
  },
  {
    id: "food-after-hamd",
    category: "food",
    type: "hadith",
    text: "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلَا قُوَّةٍ.",
    source: "رواه أبو داود والترمذي وابن ماجه — حسنه الترمذي",
    authenticity: "hasan",
    note: "من قاله غُفر له ما تقدم من ذنبه.",
  },
  {
    id: "food-milk",
    category: "food",
    type: "hadith",
    text: "اللَّهُمَّ بَارِكْ لَنَا فِيهِ وَزِدْنَا مِنْهُ.",
    source: "رواه الترمذي وأبو داود — حسنه الألباني",
    authenticity: "hasan",
    note: "قاله النبي ﷺ عند شرب اللبن.",
  },

  /* ── Travel ── */
  {
    id: "travel-dua",
    category: "travel",
    type: "hadith",
    text: "اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ، اللَّهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَذَا الْبِرَّ وَالتَّقْوَى، وَمِنَ الْعَمَلِ مَا تَرْضَى، اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا وَاطْوِ عَنَّا بُعْدَهُ، اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ وَالْخَلِيفَةُ فِي الْأَهْلِ، اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ وَعْثَاءِ السَّفَرِ، وَكَآبَةِ الْمَنْظَرِ، وَسُوءِ الْمُنْقَلَبِ فِي الْمَالِ وَالْأَهْلِ.",
    source: "رواه مسلم",
    authenticity: "sahih",
    note: "يقال عند استواء الدابة أو السيارة وركوب وسيلة السفر.",
  },
  {
    id: "travel-return",
    category: "travel",
    type: "hadith",
    text: "آيِبُونَ تَائِبُونَ عَابِدُونَ لِرَبِّنَا حَامِدُونَ.",
    source: "رواه البخاري ومسلم",
    authenticity: "muttafaq",
    note: "يقال عند العودة من السفر.",
  },

  /* ── General ── */
  {
    id: "general-subhanallah100",
    category: "general",
    type: "hadith",
    text: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ.",
    source: "رواه البخاري ومسلم",
    authenticity: "muttafaq",
    count: 100,
    note: "من قالها مائة مرة حُطَّت خطاياه وإن كانت مثل زبد البحر.",
  },
  {
    id: "general-hasbunallah",
    category: "general",
    type: "quran",
    text: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ.",
    source: "القرآن الكريم — سورة آل عمران (3:173)",
    authenticity: "sahih",
  },
  {
    id: "general-lahawla",
    category: "general",
    type: "hadith",
    text: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ.",
    source: "رواه البخاري ومسلم",
    authenticity: "muttafaq",
    note: "كنز من كنوز الجنة.",
  },
  {
    id: "general-istighfar100",
    category: "general",
    type: "hadith",
    text: "رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ.",
    source: "رواه أبو داود والترمذي وابن ماجه — حسنه",
    authenticity: "hasan",
    count: 100,
    note: "من قالها مائة مرة غفر الله له ولو كانت ذنوبه مثل زبد البحر.",
  },
];

export function getCategoryDhikr(categoryId: DhikrCategoryId): DhikrItem[] {
  return DHIKR_ITEMS.filter((item) => {
    // Shared ("both") adhkar belong to both views regardless of which side
    // they were authored under — otherwise the evening view looks empty.
    if (categoryId === "morning")
      return (
        (item.category === "morning" && (item.times === "morning" || item.times === "both")) ||
        (item.category === "evening" && item.times === "both")
      );
    if (categoryId === "evening")
      return (
        (item.category === "evening" && (item.times === "evening" || item.times === "both")) ||
        (item.category === "morning" && item.times === "both")
      );
    if (item.category !== categoryId) return false;
    return true;
  });
}

export function countAuthenticDhikrs(categoryId: DhikrCategoryId): number {
  return getCategoryDhikr(categoryId).length;
}