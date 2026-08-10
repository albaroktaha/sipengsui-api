export const GIS_MAP_CATEGORIES = [
  { value: 'PETA_POS_HIDROLOGI', label: 'Peta Pemantau Pos Hidrologi' },
  { value: 'PETA_WILAYAH_SUNGAI', label: 'Peta Pembagian Wilayah Sungai' },
  { value: 'PETA_DAERAH_ALIRAN_SUNGAI', label: 'Peta Daerah Aliran Sungai' },
  { value: 'PETA_SUNGAI', label: 'Peta Sungai' },
  { value: 'PETA_JARINGAN_IRIGASI', label: 'Peta Jaringan Irigasi' },
] as const;

export type GisMapCategory = (typeof GIS_MAP_CATEGORIES)[number]['value'];

export const GIS_MAP_CATEGORY_VALUES = GIS_MAP_CATEGORIES.map(
  (c) => c.value,
) as string[];
