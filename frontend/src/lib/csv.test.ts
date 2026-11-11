// Run: node --test src/lib/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./csv.ts";

test("reads a spreadsheet's CSV: quotes, commas inside them, CRLF, a BOM and blank lines", () => {
  const text = '﻿BeneficiaryId,Item,Quantity,Date,Location\r\nH-1,Water,2,2024-09-27,"Perry, FL"\r\n\r\nH-2,"Rice ""5kg""",1,2024-09-27,Shelter 3';
  assert.deepEqual(parseCsv(text), [
    { beneficiaryid: "H-1", item: "Water", quantity: "2", date: "2024-09-27", location: "Perry, FL" },
    { beneficiaryid: "H-2", item: 'Rice "5kg"', quantity: "1", date: "2024-09-27", location: "Shelter 3" },
  ]);
  assert.deepEqual(parseCsv(""), []);
});
