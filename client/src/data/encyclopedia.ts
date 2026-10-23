export interface EncEntry { id: string; title: string; body: string; }

export const EQUIPMENT_ENCYCLOPEDIA: EncEntry[] = [
  { id: "litho_scanner", title: "KrF Litho Scanner (ASML)", body: "KrF 248nm 光刻機，用於 180–350nm 節點圖案轉移。原理：雷射光源經光罩投影至光阻，定義電路圖案。" },
  { id: "etch_reactor", title: "Dry Etch Reactor (Lam)", body: "電漿乾式刻蝕機，移除未被光阻保護的薄膜，形成電路結構。" },
  { id: "cvd_tool", title: "CVD Deposition (AMAT)", body: "化學氣相沉積，於晶圓表面沉積介電/金屬薄膜。" },
  { id: "cmp_tool", title: "CMP Polisher (AMAT)", body: "化學機械研磨，平坦化晶圓表面以利多層堆疊。" },
  { id: "implanter", title: "Ion Implanter (AMAT)", body: "離子植入機，將摻雜離子注入矽基板改變化學性質。" },
  { id: "furnace", title: "Thermal Furnace (TEL)", body: "高溫擴散爐，進行氧化與退火製程。" },
  { id: "clean_station", title: "Wet Clean Station (TEL)", body: "濕式清洗台，去除微粒與金屬污染。" },
  { id: "inspection", title: "Wafer Inspector (KLA)", body: "光學檢測機，發現晶圓表面缺陷。" },
  { id: "euv_scanner", title: "EUV Scanner NXE:3600D (ASML)", body: "極紫外光 13.5nm 微影機，支持 2–28nm 節點。" },
  { id: "high_na_euv", title: "High-NA EUV EXE:5000 (ASML)", body: "高數值孔徑 EUV，支持 1.6nm 以下節點。" },
  { id: "hybrid_bonder", title: "Hybrid Bonder (Besi)", body: "混合接合機，用於先進封裝。" },
  { id: "dicing_saw", title: "Dicing Saw (DISCO)", body: "晶圓切割機，將晶圓切割成單顆晶片。" },
];

export const NODE_ENCYCLOPEDIA: EncEntry[] = [
  { id: "350nm", title: "350 nm", body: "微處理器萌芽時代，經典成熟製程。" },
  { id: "180nm", title: "180 nm", body: "經典成熟製程，車用與類比晶片主流。" },
  { id: "90nm", title: "90 nm", body: "應變矽技術導入。" },
  { id: "28nm", title: "28 nm", body: "長壽命性價比節點，物聯網與車用。" },
  { id: "7nm", title: "7 nm", body: "FinFET 突破，手機旗艦 SoC。" },
  { id: "3nm", title: "3 nm", body: "EUV 普及，高效能運算。" },
  { id: "2nm", title: "2 nm", body: "GAA 環繞閘極技術。" },
  { id: "a16", title: "A16", body: "CFET 背面供電，AI 加速卡。" },
];

export const PROCESS_ENCYCLOPEDIA: EncEntry[] = [
  { id: "CLEAN", title: "清洗", body: "去除晶圓表面微粒與金屬污染；不良則造成良率下降。" },
  { id: "DEPOSITION", title: "薄膜沉積", body: "沉積介電/金屬薄膜；不良導致電性失效。" },
  { id: "LITHOGRAPHY", title: "光罩微影", body: "將電路圖案轉移至光阻；不良造成圖案變形。" },
  { id: "ETCHING", title: "電漿刻蝕", body: "移除未保護薄膜；不良造成短路或斷路。" },
  { id: "ION_IMPLANT", title: "離子植入", body: "摻雜改性；不良影響電晶體特性。" },
  { id: "CMP", title: "平坦化研磨", body: "平坦化表面；不良影響後續層對位。" },
  { id: "INSPECTION", title: "光學檢測", body: "發現缺陷；不良則缺陷流入後段。" },
];