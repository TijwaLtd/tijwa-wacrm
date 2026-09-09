import * as XLSX from "xlsx"
import type { OfferingType, PriceType, OfferingStatus } from "./offerings"

const TEMPLATE_HEADERS = [
  "name",
  "type",
  "price",
  "price_type",
  "currency",
  "short_description",
  "description",
  "reference_code",
  "status",
  "category",
]

const TYPE_OPTIONS: OfferingType[] = [
  "product", "service", "room", "menu_item", "course", "program",
  "property", "package", "membership", "event", "resource", "other",
]

const PRICE_TYPE_OPTIONS: PriceType[] = ["fixed", "starting_from", "contact_for_price", "free"]
const STATUS_OPTIONS: OfferingStatus[] = ["draft", "active", "inactive", "archived"]

const EXAMPLE_ROWS = [
  {
    name: "Premium T-Shirt",
    type: "product",
    price: "29.99",
    price_type: "fixed",
    currency: "USD",
    short_description: "Soft cotton t-shirt in premium quality",
    description: "Available in S, M, L, XL. 100% organic cotton.",
    reference_code: "TSHIRT-001",
    status: "active",
    category: "Apparel",
  },
  {
    name: "Room Consultation",
    type: "service",
    price: "",
    price_type: "contact_for_price",
    currency: "USD",
    short_description: "Free 15-minute consultation",
    description: "Discuss your needs with our expert team.",
    reference_code: "SVC-CONSULT",
    status: "active",
    category: "Services",
  },
]

export function generateTemplateCsv(): string {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ...EXAMPLE_ROWS.map((r) => TEMPLATE_HEADERS.map((h) => r[h as keyof typeof r] ?? "")),
  ])

  ws["!cols"] = [
    { wch: 25 }, // name
    { wch: 15 }, // type
    { wch: 10 }, // price
    { wch: 18 }, // price_type
    { wch: 10 }, // currency
    { wch: 35 }, // short_description
    { wch: 50 }, // description
    { wch: 18 }, // reference_code
    { wch: 10 }, // status
    { wch: 15 }, // category
  ]

  XLSX.utils.book_append_sheet(wb, ws, "Template")
  return XLSX.utils.sheet_to_csv(ws)
}

export function generateTemplateExcel(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ...EXAMPLE_ROWS.map((r) => TEMPLATE_HEADERS.map((h) => r[h as keyof typeof r] ?? "")),
  ])

  ws["!cols"] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 10 },
    { wch: 18 },
    { wch: 10 },
    { wch: 35 },
    { wch: 50 },
    { wch: 18 },
    { wch: 10 },
    { wch: 15 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, "Template")

  const validSheet = XLSX.utils.aoa_to_sheet([
    ["Valid Types", "Valid Price Types", "Valid Statuses"],
    ...Array.from({ length: Math.max(TYPE_OPTIONS.length, PRICE_TYPE_OPTIONS.length, STATUS_OPTIONS.length) }, (_, i) => [
      TYPE_OPTIONS[i] ?? "",
      PRICE_TYPE_OPTIONS[i] ?? "",
      STATUS_OPTIONS[i] ?? "",
    ]),
  ])
  validSheet["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, validSheet, "Reference")

  return XLSX.write(wb, { bookType: "xlsx", type: "array" })
}

export function downloadTemplate(format: "csv" | "xlsx") {
  if (format === "csv") {
    const csv = generateTemplateCsv()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "offerings_template.csv"
    a.click()
    URL.revokeObjectURL(url)
  } else {
    const data = generateTemplateExcel()
    const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "offerings_template.xlsx"
    a.click()
    URL.revokeObjectURL(url)
  }
}
