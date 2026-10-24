import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../lib/products/product-images.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { productImageMap, getProductImagePath, getProductImageSources } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("all 57 mapped images use exact existing filenames", () => {
  const files = readdirSync(new URL("../public/images/products/", import.meta.url));
  assert.equal(Object.keys(productImageMap).length, 57);
  for (const [slug, src] of Object.entries(productImageMap)) {
    assert.ok(files.includes(src.split("/").at(-1)), `${slug}: ${src}`);
    assert.equal(getProductImagePath("Admin-renamed product", slug), src);
  }
  assert.equal(getProductImagePath("Paracetamol 500mg Tablets"), null);
});

test("valid uploads precede the corresponding local photo, including admin previews", () => {
  const local = productImageMap["losartan-50mg-tablets"];
  const uploaded = "https://example.supabase.co/storage/v1/object/public/products/custom.png";
  assert.deepEqual(getProductImageSources("Losartan 50mg Tablets", uploaded), [uploaded, local]);
  assert.deepEqual(getProductImageSources("Preview", "blob:https://example.com/id"), ["blob:https://example.com/id"]);
});

test("invalid and missing image URLs use the matching photo without unrelated substitutions", () => {
  const local = productImageMap["pulse-oximeter"];
  for (const invalid of [null, "", "  ", "not-a-url", "javascript:alert(1)", "//example.com/photo.png"]) {
    assert.deepEqual(getProductImageSources("Pulse Oximeter", invalid), [local]);
  }
  assert.deepEqual(getProductImageSources("Paracetamol 500mg Tablets", null), []);
  assert.deepEqual(getProductImageSources("Pulse Oximeter", "/broken.png"), ["/broken.png", local]);
});
