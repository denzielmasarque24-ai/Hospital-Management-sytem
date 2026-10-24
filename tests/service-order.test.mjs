import test from "node:test";
import assert from "node:assert/strict";
import { healthcareServiceSlugs, orderHealthcareServices } from "../lib/services/service-order.mjs";

test("database rows use one fixed order without mutating or inventing records", () => {
  const rows = healthcareServiceSlugs.map((slug, id) => ({ slug, id, name: `Updated name ${id}`, image_url: `upload-${id}` })).reverse();
  const original = [...rows];
  const result = orderHealthcareServices([...rows, { slug: "aesthetic-center", id: 100 }]);
  assert.deepEqual(result.map((row) => row.slug), healthcareServiceSlugs);
  assert.deepEqual(rows, original);
  assert.equal(result[0], rows.at(-1));
});

test("missing or repeated rows never produce placeholder or duplicate services", () => {
  const row = { slug: "cardiology", name: "Latest cardiology name" };
  assert.deepEqual(orderHealthcareServices([row, row]), [row]);
  assert.deepEqual(orderHealthcareServices([]), []);
});
