import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { getServiceImageSources, serviceImages, SERVICE_PLACEHOLDER } from "../lib/services/service-images.mjs";

test("all sixteen services map to exact existing filenames", () => {
  assert.equal(Object.keys(serviceImages).length, 16);
  for (const [slug, src] of Object.entries(serviceImages)) {
    const directory = src.slice(0, src.lastIndexOf("/") + 1);
    const files = readdirSync(new URL(`../public${directory}`, import.meta.url));
    assert.ok(files.includes(src.split("/").at(-1)), `${slug}: ${src}`);
    assert.deepEqual(getServiceImageSources(slug, null), [src, SERVICE_PLACEHOLDER]);
  }
});

test("uploaded images retain priority with local and placeholder fallbacks", () => {
  const upload = "https://example.supabase.co/storage/v1/object/public/service-images/upload.png";
  assert.deepEqual(getServiceImageSources("aesthetic-center", upload), [upload, serviceImages["aesthetic-center"], SERVICE_PLACEHOLDER]);
  assert.deepEqual(getServiceImageSources("new-service", upload), [upload, SERVICE_PLACEHOLDER]);
});

test("invalid URLs and existing placeholders do not displace local photos", () => {
  for (const value of [null, "", "  ", "not-a-url", "javascript:alert(1)", "//example.com/a.png", SERVICE_PLACEHOLDER, "/services/medical-placeholder.svg?cache=1"]) {
    assert.equal(getServiceImageSources("heart-institute", value)[0], serviceImages["heart-institute"]);
  }
  assert.deepEqual(getServiceImageSources("unknown", null), [SERVICE_PLACEHOLDER]);
});
