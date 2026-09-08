/**
 * Sample villas.
 *
 * DV-2685 is transcribed from the real listing in the spec, section 13, and is
 * the yardstick: if the villa detail page can render this one completely, it
 * can render any of them. The other nine are variations built around it to
 * give search, filters and the dashboard something to work with.
 *
 * Every image here is a placeholder and is flagged isSynthetic, so nothing in
 * this file can be mistaken for a photograph of a house that exists.
 */

const B = (baht: number) => Math.round(baht * 100);

export interface SeedVilla {
  code: string;
  slug: string;
  status: 'published' | 'draft' | 'hidden';
  name: { th: string; en: string; zh: string };
  description?: { th: string; en: string; zh: string };
  location: {
    province: string;
    district?: string;
    zone: string;
    landmark?: string;
    distanceToBeachKm: number;
    latitude?: number;
    longitude?: number;
  };
  capacity: {
    bedrooms: number;
    bathrooms: number;
    baseGuests: number;
    maxExtraGuests: number;
    extraGuestFee: number;
    freeChildUnder10Quota: number;
  };
  basePricing: { sunThu: number; fri: number; sat: number; holiday: number };
  minNights: number;
  damageDeposit: number;
  pool: {
    isPrivate: boolean;
    system: 'chlorine' | 'saltwater';
    widthM: number;
    lengthM: number;
    depthM: number;
    hasSlider: boolean;
    sliderHeightM?: number;
    hasKidPool: boolean;
  };
  amenities: string[];
  bedroomDetails: {
    index: number;
    beds: { sizeFt: number; count: number; type: 'single' | 'double' | 'bunk' | 'extra' }[];
    sleeps: number;
    hasEnsuite: boolean;
  }[];
  extraMattressSleeps: number;
  kitchen: { available: string[]; unavailable: string[] };
  rules: {
    checkInFrom: string;
    checkOutBefore: string;
    petAllowed: boolean;
    loudMusicAllowed: boolean;
    smokingPolicy: 'not_allowed' | 'outdoor_only' | 'allowed';
    partyPolicy: 'not_allowed' | 'allowed' | 'on_request';
  };
  parking: { inHouse: number; garage: number };
  extraCharges: { key: string; label: { th: string; en: string; zh: string }; price: number; unit: string }[];
  additionalNotes?: { th: string; en: string; zh: string };
  nearbyAttractions: { name: { th: string; en: string; zh: string }; distanceKm: number; category: string }[];
  imageCount: number;
}

const KITCHEN_STANDARD = [
  'pan',
  'plates',
  'spoons',
  'glasses',
  'chopping_board',
  'knives',
  'mortar',
  'microwave',
  'ice_bucket',
  'shabu_pot',
  'rice_cooker',
  'pot',
  'electric_stove',
  'gas_stove',
];

/** DV-2685, from the spec. Every number here comes from the real listing. */
const DV_2685: SeedVilla = {
  code: 'DV-2685',
  slug: 'dv-2685-mabprachan-pool-villa',
  status: 'published',
  name: {
    th: 'พูลวิลล่า 5 ห้องนอน อ่างเก็บน้ำมาบประชัน',
    en: 'Mabprachan 5-Bedroom Pool Villa',
    zh: '玛布拉赞五卧泳池别墅',
  },
  description: {
    th: 'บ้านพัก 5 ห้องนอน สระส่วนตัวพร้อมสไลเดอร์ คาราโอเกะ โต๊ะสนุ๊ก เปิดเพลงเสียงดังได้ทั้งคืน',
    en: 'Five bedrooms, a private pool with a slide, karaoke, a snooker table, and no curfew on music.',
    zh: '五间卧室，带滑梯的私人泳池、卡拉OK、桌球台，音乐可通宵。',
  },
  location: {
    province: 'ชลบุรี',
    district: 'บางละมุง',
    zone: 'พัทยา',
    landmark: 'อ่างเก็บน้ำมาบประชัน',
    distanceToBeachKm: 10.5,
    latitude: 12.9236,
    longitude: 100.9412,
  },
  capacity: {
    bedrooms: 5,
    bathrooms: 4,
    baseGuests: 14,
    maxExtraGuests: 15,
    extraGuestFee: B(200),
    freeChildUnder10Quota: 5,
  },
  basePricing: { sunThu: B(9000), fri: B(11000), sat: B(13000), holiday: B(15000) },
  minNights: 1,
  damageDeposit: B(3000),
  pool: {
    isPrivate: true,
    system: 'chlorine',
    widthM: 4,
    lengthM: 10,
    depthM: 1.5,
    hasSlider: true,
    sliderHeightM: 2,
    hasKidPool: false,
  },
  amenities: [
    'karaoke',
    'snooker',
    'pool_floats',
    'disco_light',
    'extra_mattress',
    'pool_slide',
    'bbq_grill',
    'wifi',
    'water_heater',
    'life_jacket_kids',
  ],
  bedroomDetails: [
    { index: 1, beds: [{ sizeFt: 6, count: 1, type: 'double' }], sleeps: 2, hasEnsuite: false },
    { index: 2, beds: [{ sizeFt: 6, count: 2, type: 'double' }], sleeps: 4, hasEnsuite: false },
    {
      index: 3,
      beds: [
        { sizeFt: 5, count: 1, type: 'bunk' },
        { sizeFt: 4, count: 1, type: 'bunk' },
      ],
      sleeps: 3,
      hasEnsuite: false,
    },
    {
      index: 4,
      beds: [
        { sizeFt: 6, count: 1, type: 'double' },
        { sizeFt: 3, count: 1, type: 'extra' },
      ],
      sleeps: 3,
      hasEnsuite: true,
    },
    { index: 5, beds: [{ sizeFt: 6, count: 1, type: 'double' }], sleeps: 2, hasEnsuite: true },
  ],
  extraMattressSleeps: 6,
  kitchen: {
    available: KITCHEN_STANDARD,
    unavailable: ['toaster', 'steamer', 'blender'],
  },
  rules: {
    checkInFrom: '14:00',
    checkOutBefore: '12:00',
    petAllowed: false,
    loudMusicAllowed: true,
    smokingPolicy: 'outdoor_only',
    partyPolicy: 'allowed',
  },
  parking: { inHouse: 4, garage: 10 },
  extraCharges: [
    {
      key: 'ice',
      label: { th: 'น้ำแข็ง 8-10 กก.', en: 'Ice, 8-10 kg', zh: '冰块 8-10 公斤' },
      price: B(50),
      unit: 'ถุง',
    },
    {
      key: 'charcoal',
      label: { th: 'ถ่าน', en: 'Charcoal', zh: '木炭' },
      price: B(20),
      unit: 'ถุง',
    },
  ],
  additionalNotes: {
    th: 'เด็กต่ำกว่า 10 ขวบ พักฟรีได้ 5 ท่าน นอนกับผู้ปกครอง มีผ้าเช็ดตัว สบู่เหลว ยาสระผม เครื่องทำน้ำอุ่น และชูชีพเด็ก 3 ตัว',
    en: 'Up to five children under ten stay free with a guardian. Towels, soap, shampoo, water heaters and three child life jackets provided.',
    zh: '五名十岁以下儿童与家长同住免费。提供毛巾、沐浴露、洗发水、热水器及三件儿童救生衣。',
  },
  nearbyAttractions: [
    {
      name: { th: 'อ่างเก็บน้ำมาบประชัน', en: 'Mabprachan Reservoir', zh: '玛布拉赞水库' },
      distanceKm: 1.2,
      category: 'nature',
    },
    {
      name: { th: 'สวนนงนุช', en: 'Nong Nooch Garden', zh: '东芭乐园' },
      distanceKm: 14,
      category: 'attraction',
    },
    {
      name: { th: 'หาดจอมเทียน', en: 'Jomtien Beach', zh: '中天海滩' },
      distanceKm: 10.5,
      category: 'beach',
    },
  ],
  imageCount: 12,
};

interface Variant {
  code: string;
  slug: string;
  nameTh: string;
  nameEn: string;
  nameZh: string;
  zone: string;
  province: string;
  bedrooms: number;
  baseGuests: number;
  beach: number;
  rate: number;
  slider: boolean;
  pet: boolean;
  loud: boolean;
  saltwater?: boolean;
  kidPool?: boolean;
  status?: 'published' | 'draft';
}

const VARIANTS: Variant[] = [
  { code: 'DV-2701', slug: 'dv-2701-jomtien-beachfront', nameTh: 'พูลวิลล่าติดหาดจอมเทียน', nameEn: 'Jomtien Beachfront Pool Villa', nameZh: '中天海滨泳池别墅', zone: 'จอมเทียน', province: 'ชลบุรี', bedrooms: 4, baseGuests: 12, beach: 0.2, rate: 12000, slider: false, pet: true, loud: false, saltwater: true },
  { code: 'DV-2712', slug: 'dv-2712-bangsaray-garden', nameTh: 'พูลวิลล่าสวนบางเสร่', nameEn: 'Bang Saray Garden Pool Villa', nameZh: '邦萨雷花园泳池别墅', zone: 'บางเสร่', province: 'ชลบุรี', bedrooms: 3, baseGuests: 8, beach: 2.5, rate: 6500, slider: false, pet: true, loud: false, kidPool: true },
  { code: 'DV-2733', slug: 'dv-2733-pattaya-hilltop', nameTh: 'พูลวิลล่าบนเนินพัทยา', nameEn: 'Pattaya Hilltop Pool Villa', nameZh: '芭堤雅山顶泳池别墅', zone: 'พัทยา', province: 'ชลบุรี', bedrooms: 6, baseGuests: 18, beach: 6.8, rate: 16000, slider: true, pet: false, loud: true },
  { code: 'DV-2748', slug: 'dv-2748-najomtien-family', nameTh: 'พูลวิลล่านาจอมเทียนสำหรับครอบครัว', nameEn: 'Na Jomtien Family Pool Villa', nameZh: '那中天家庭泳池别墅', zone: 'นาจอมเทียน', province: 'ชลบุรี', bedrooms: 4, baseGuests: 10, beach: 1.1, rate: 8500, slider: true, pet: true, loud: false, kidPool: true },
  { code: 'HH-3101', slug: 'hh-3101-huahin-seaview', nameTh: 'พูลวิลล่าหัวหินวิวทะเล', nameEn: 'Hua Hin Sea View Pool Villa', nameZh: '华欣海景泳池别墅', zone: 'หัวหิน', province: 'ประจวบคีรีขันธ์', bedrooms: 5, baseGuests: 14, beach: 0.6, rate: 14000, slider: false, pet: false, loud: false, saltwater: true },
  { code: 'HH-3117', slug: 'hh-3117-huahin-town', nameTh: 'พูลวิลล่ากลางเมืองหัวหิน', nameEn: 'Hua Hin Town Pool Villa', nameZh: '华欣市区泳池别墅', zone: 'หัวหิน', province: 'ประจวบคีรีขันธ์', bedrooms: 3, baseGuests: 8, beach: 1.8, rate: 7000, slider: false, pet: false, loud: false },
  { code: 'KY-4402', slug: 'ky-4402-khaoyai-mountain', nameTh: 'พูลวิลล่าเขาใหญ่วิวภูเขา', nameEn: 'Khao Yai Mountain Pool Villa', nameZh: '考艾山景泳池别墅', zone: 'เขาใหญ่', province: 'นครราชสีมา', bedrooms: 4, baseGuests: 12, beach: 999, rate: 11000, slider: false, pet: true, loud: true },
  { code: 'KY-4418', slug: 'ky-4418-khaoyai-farm', nameTh: 'พูลวิลล่าเขาใหญ่ติดฟาร์ม', nameEn: 'Khao Yai Farmside Pool Villa', nameZh: '考艾农场泳池别墅', zone: 'เขาใหญ่', province: 'นครราชสีมา', bedrooms: 6, baseGuests: 16, beach: 999, rate: 15000, slider: true, pet: true, loud: true },
  { code: 'PK-5203', slug: 'pk-5203-phuket-rawai', nameTh: 'พูลวิลล่าราไวย์ ภูเก็ต', nameEn: 'Rawai Pool Villa, Phuket', nameZh: '普吉拉威泳池别墅', zone: 'ภูเก็ต', province: 'ภูเก็ต', bedrooms: 5, baseGuests: 12, beach: 0.9, rate: 17000, slider: false, pet: false, loud: false, saltwater: true, status: 'draft' },
];

function fromVariant(v: Variant): SeedVilla {
  const bedroomDetails = Array.from({ length: v.bedrooms }, (_, i) => ({
    index: i + 1,
    beds: [{ sizeFt: 6, count: i === 1 ? 2 : 1, type: 'double' as const }],
    sleeps: i === 1 ? 4 : 2,
    hasEnsuite: i >= v.bedrooms - 2,
  }));

  return {
    code: v.code,
    slug: v.slug,
    status: v.status ?? 'published',
    name: { th: v.nameTh, en: v.nameEn, zh: v.nameZh },
    location: {
      province: v.province,
      zone: v.zone,
      // 999 is the sentinel for inland villas; the seeder drops it below.
      distanceToBeachKm: v.beach,
    },
    capacity: {
      bedrooms: v.bedrooms,
      bathrooms: Math.max(2, v.bedrooms - 1),
      baseGuests: v.baseGuests,
      maxExtraGuests: Math.round(v.baseGuests * 0.75),
      extraGuestFee: B(v.beach < 1 ? 300 : 200),
      freeChildUnder10Quota: 4,
    },
    basePricing: {
      sunThu: B(v.rate),
      fri: B(Math.round(v.rate * 1.22)),
      sat: B(Math.round(v.rate * 1.44)),
      holiday: B(Math.round(v.rate * 1.67)),
    },
    minNights: v.rate >= 14000 ? 2 : 1,
    damageDeposit: B(v.rate >= 14000 ? 5000 : 3000),
    pool: {
      isPrivate: true,
      system: v.saltwater ? 'saltwater' : 'chlorine',
      widthM: 4,
      lengthM: v.bedrooms >= 5 ? 12 : 8,
      depthM: 1.4,
      hasSlider: v.slider,
      ...(v.slider ? { sliderHeightM: 2 } : {}),
      hasKidPool: v.kidPool ?? false,
    },
    amenities: [
      'wifi',
      'bbq_grill',
      'water_heater',
      'pool_floats',
      ...(v.slider ? ['pool_slide'] : []),
      ...(v.loud ? ['karaoke', 'disco_light'] : []),
      ...(v.bedrooms >= 5 ? ['snooker'] : []),
      ...(v.kidPool ? ['kids_pool', 'life_jacket_kids'] : []),
    ],
    bedroomDetails,
    extraMattressSleeps: 4,
    kitchen: { available: KITCHEN_STANDARD, unavailable: ['toaster', 'blender'] },
    rules: {
      checkInFrom: '14:00',
      checkOutBefore: '12:00',
      petAllowed: v.pet,
      loudMusicAllowed: v.loud,
      smokingPolicy: 'outdoor_only',
      partyPolicy: v.loud ? 'allowed' : 'on_request',
    },
    parking: { inHouse: 3, garage: v.bedrooms },
    extraCharges: [
      { key: 'ice', label: { th: 'น้ำแข็ง', en: 'Ice', zh: '冰块' }, price: B(50), unit: 'ถุง' },
      { key: 'charcoal', label: { th: 'ถ่าน', en: 'Charcoal', zh: '木炭' }, price: B(20), unit: 'ถุง' },
    ],
    nearbyAttractions: [],
    imageCount: 8,
  };
}

export const SEED_VILLAS: SeedVilla[] = [DV_2685, ...VARIANTS.map(fromVariant)];

export interface SeedAgent {
  agentCode: string;
  name: string;
  phone: string;
  lineId: string;
  commissionRate: number;
  /** Baht added per night, by day type. Different for each agent on purpose. */
  markup: { sunThu: number; fri: number; sat: number; holiday: number };
  canBlockDates: boolean;
}

/**
 * Three agents with deliberately different markups on the same houses.
 *
 * This is the case the whole system exists to handle, so the seed has to make
 * it visible: open the same villa through /a/123 and /a/125 and the price is
 * different, while the calendar is identical.
 */
export const SEED_AGENTS: SeedAgent[] = [
  {
    agentCode: '123',
    name: 'สมชาย รุ่งเรือง',
    phone: '081-234-5678',
    lineId: 'somchai.villa',
    commissionRate: 0,
    markup: { sunThu: 1000, fri: 1500, sat: 2000, holiday: 3000 },
    canBlockDates: true,
  },
  {
    agentCode: '124',
    name: 'ปรียา วงศ์สว่าง',
    phone: '082-345-6789',
    lineId: 'preeya.pool',
    commissionRate: 0,
    markup: { sunThu: 500, fri: 800, sat: 1200, holiday: 2000 },
    canBlockDates: false,
  },
  {
    agentCode: '125',
    name: 'ธนกร ศรีสุข',
    phone: '083-456-7890',
    lineId: 'thanakorn.stay',
    commissionRate: 0,
    markup: { sunThu: 1500, fri: 2200, sat: 3000, holiday: 4500 },
    canBlockDates: false,
  },
];
