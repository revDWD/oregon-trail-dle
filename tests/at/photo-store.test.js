import test from "node:test";
import assert from "node:assert/strict";
import { trimRoll, loadPhotos, savePhotos, clearPhotos } from "../../assets/js/at/ui/photo-store.js";

const photo = (id, at) => ({ id, src: "data:image/jpeg;base64,AAAA", caption: id, at, species: null });

test("the camera roll keeps the newest photos, once each, up to its limit", () => {
  const roll = trimRoll([photo("a", 1), photo("c", 3), photo("b", 2), photo("c", 3), null, { id: "x" }], 2);
  assert.deepEqual(roll.map((p) => p.id), ["c", "b"]);
  assert.deepEqual(trimRoll(undefined, 12), []);
});

test("without IndexedDB the camera roll simply stays in memory", async () => {
  assert.deepEqual(await loadPhotos(12), []);
  assert.equal(await savePhotos([photo("a", 1)], 12), false);
  assert.equal(await clearPhotos(), false);
});