import assert from "node:assert/strict";
import test from "node:test";

import { filterServicesBySection } from "./service-section-filter.mjs";

test("clinical and facilities directory results never overlap", () => {
  const rows = [
    { id: "clinical-1", section: "clinical_departments" },
    { id: "facility-1", section: "services_facilities" },
    { id: "clinical-2", section: "clinical_departments" },
    { id: "facility-2", section: "services_facilities" },
  ];

  const clinical = filterServicesBySection(rows, "clinical_departments");
  const facilities = filterServicesBySection(rows, "services_facilities");
  const clinicalIds = new Set(clinical.map(({ id }) => id));
  const facilitiesIds = new Set(facilities.map(({ id }) => id));

  assert.deepEqual(clinical.map(({ id }) => id), ["clinical-1", "clinical-2"]);
  assert.deepEqual(facilities.map(({ id }) => id), ["facility-1", "facility-2"]);
  assert.equal([...clinicalIds].some((id) => facilitiesIds.has(id)), false);
});
