import * as XLSX from "xlsx"
import type { OfferingType, OfferingStatus, PriceType } from "./offerings"

const VALID_TYPES: OfferingType[] = [
  "product", "service", "room", "menu_item", "course", "program",
  "property", "package", "membership", "event", "resource", "other",
]

const VALID_STATUSES: OfferingStatus[] = ["draft", "active", "inactive", "archived"]
const VALID_PRICE_TYPES: PriceType[] = ["fixed", "starting_from", "contact_for_price", "free"]

const REQUIRED_HEADERS = ["name", "type"]

const HEADER_MAP: Record<string, keyof ParsedOfferingRow> = {
  name: "name",
  type: "type",
  price: "price",
  price_type: "priceType",
  pricetype: "priceType",
  "price type": "priceType",
  currency: "currency",
  short_description: "shortDescription",
  "short description": "shortDescription",
  shortdescription: "shortDescription",
  description: "description",
  reference_code: "referenceCode",
  "reference code": "referenceCode",
  referencecode: "referenceCode",
  sku: "referenceCode",
  status: "status",
  category: "category",
}

export interface ParsedOfferingRow {
  name: string
  type: string
  price: string
  priceType: string
  currency: string
  shortDescription: string
  description: string
  referenceCode: string
  status: string
  category: string
  _rowIndex: number
  _errors: string[]
}

export interface ParseResult {
  rows: ParsedOfferingRow[]
  headers: string[]
  errors: string[]
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "_")
}

function mapHeader(raw: string): keyof ParsedOfferingRow | null {
  const normalized = normalizeHeader(raw)
  return HEADER_MAP[normalized] ?? HEADER_MAP[normalized.replace(/_/g, " ")] ?? null
}

function parsePrice(raw: string): string {
  const cleaned = raw.replace(/[^0-9.\-]/g, "")
  const num = parseFloat(cleaned)
  return isNaN(num) ? raw : String(num)
}

function validateRow(row: ParsedOfferingRow): string[] {
  const errors: string[] = []
  if (!row.name || row.name.trim().length < 1) {
    errors.push("Name is required")
  }
  if (!row.type || row.type.trim().length < 1) {
    errors.push("Type is required")
  } else if (!VALID_TYPES.includes(row.type.toLowerCase() as OfferingType)) {
    errors.push(`Invalid type "${row.type}". Must be one of: ${VALID_TYPES.join(", ")}`)
  }
  if (row.status && !VALID_STATUSES.includes(row.status.toLowerCase() as OfferingStatus)) {
    errors.push(`Invalid status "${row.status}". Must be one of: ${VALID_STATUSES.join(", ")}`)
  }
  if (row.priceType && !VALID_PRICE_TYPES.includes(row.priceType.toLowerCase() as PriceType)) {
    errors.push(`Invalid price type "${row.priceType}". Must be one of: ${VALID_PRICE_TYPES.join(", ")}`)
  }
  if (row.price && isNaN(parseFloat(row.price))) {
    errors.push(`Invalid price "${row.price}". Must be a number.`)
  }
  return errors
}

function rowsFromSheet(sheet: XLSX.WorkSheet): string[][] {
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" })
  return raw.filter((r) => r.some((c) => String(c).trim() !== ""))
}

function parseRows(data: string[][]): ParseResult {
  if (data.length < 2) {
    return { rows: [], headers: [], errors: ["File is empty or has no data rows"] }
  }

  const rawHeaders = data[0].map((h) => String(h).trim())
  const headerKeys = rawHeaders.map(mapHeader)

  const missingRequired = REQUIRED_HEADERS.filter(
    (rh) => !headerKeys.includes(rh as keyof ParsedOfferingRow)
  )
  if (missingRequired.length > 0) {
    return {
      rows: [],
      headers: rawHeaders,
      errors: [`Missing required columns: ${missingRequired.join(", ")}`],
    }
  }

  const rows: ParsedOfferingRow[] = []
  const globalErrors: string[] = []

  for (let i = 1; i < data.length; i++) {
    const cells = data[i]
    const row: ParsedOfferingRow = {
      name: "",
      type: "",
      price: "",
      priceType: "",
      currency: "",
      shortDescription: "",
      description: "",
      referenceCode: "",
      status: "draft",
      category: "",
      _rowIndex: i + 1,
      _errors: [],
    }

    for (let j = 0; j < headerKeys.length; j++) {
      const key = headerKeys[j]
      if (!key) continue
      const val = String(cells[j] ?? "").trim()
      switch (key) {
        case "name":
          row.name = val
          break
        case "type":
          row.type = val.toLowerCase()
          break
        case "price":
          row.price = parsePrice(val)
          break
        case "priceType":
          row.priceType = val.toLowerCase()
          break
        case "currency":
          row.currency = val.toUpperCase()
          break
        case "shortDescription":
          row.shortDescription = val
          break
        case "description":
          row.description = val
          break
        case "referenceCode":
          row.referenceCode = val
          break
        case "status":
          row.status = val.toLowerCase()
          break
        case "category":
          row.category = val
          break
      }
    }

    row._errors = validateRow(row)
    rows.push(row)
  }

  return { rows, headers: rawHeaders, errors: globalErrors }
}

export function parseOfferingFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array" })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const sheetData = rowsFromSheet(sheet)
        resolve(parseRows(sheetData))
      } catch {
        resolve({ rows: [], headers: [], errors: ["Failed to parse file. Please check the format."] })
      }
    }
    reader.onerror = () => {
      resolve({ rows: [], headers: [], errors: ["Failed to read file."] })
    }
    reader.readAsArrayBuffer(file)
  })
}

export function parseOfferingCsv(text: string): ParseResult {
  const workbook = XLSX.read(text, { type: "string" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const sheetData = rowsFromSheet(sheet)
  return parseRows(sheetData)
}
