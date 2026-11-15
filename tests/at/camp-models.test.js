import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CAMP_MODELS, CAMP_PROPS, MODEL_BUDGET, MODEL_MATERIALS, QUALITY } from "../../assets/js/at/engine/camp-world.js";
import { BUILDERS, MODEL_DIR, toGlb } from "../../scripts/camp-models.mjs";

const file = (m) => join(MODEL_DIR, m.file);

function readGlb(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(dv.getUint32(0, true), 0x46546c67, "glTF magic");
  assert.equal(dv.getUint32(4, true), 2, "glTF version 2");
  assert.equal(dv.getUint32(8, true), bytes.byteLength, "declared length");
  const jsonLength = dv.getUint32(12, true);
  assert.equal(dv.getUint32(16, true), 0x4e4f534a, "JSON chunk first");
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
}

test("hero models stay within budget, use the camp palette and fit their prop", () => {
  let total = 0;
  for (const m of CAMP_MODELS) {
    const bytes = readFileSync(file(m));
    total += bytes.byteLength;
    assert.ok(bytes.byteLength <= MODEL_BUDGET.bytes, `${m.file} is ${bytes.byteLength} bytes`);
    const json = readGlb(bytes);
    assert.ok(!json.images && !json.textures, `${m.file} carries no textures`);
    assert.deepEqual(json.extensionsRequired || [], [], `${m.file} needs no decoder extensions`);
    const primitives = json.meshes.flatMap((x) => x.primitives);
    assert.ok(primitives.length <= MODEL_BUDGET.drawCalls, `${m.file} draws in ${primitives.length} calls`);
    const triangles = primitives.reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);
    assert.ok(triangles <= MODEL_BUDGET.triangles, `${m.file} has ${triangles} triangles`);
    json.materials.forEach((mt) => assert.ok(MODEL_MATERIALS.includes(mt.name), `${m.file} material "${mt.name}"`));
    const names = json.nodes.map((n) => n.name);
    m.hooks.forEach((hook) => assert.ok(names.includes(hook), `${m.file} has a ${hook} node`));
    // Bounds: base on the ground and inside the prop's footprint.
    const prop = CAMP_PROPS.find((p) => p.id === m.prop);
    assert.ok(prop, `${m.id} replaces a real prop`);
    const min = [0, 1, 2].map((k) => Math.min(...primitives.map((p) => json.accessors[p.attributes.POSITION].min[k])));
    const max = [0, 1, 2].map((k) => Math.max(...primitives.map((p) => json.accessors[p.attributes.POSITION].max[k])));
    assert.ok(Math.abs(min[1]) < 0.01, `${m.file} sits on the ground (min y ${min[1]})`);
    [min[0], max[0], min[2], max[2]].forEach((v) => assert.ok(Math.abs(v) <= prop.radius + 0.1, `${m.file} fits radius ${prop.radius}`));
    assert.ok(m.credit && m.licence, `${m.id} is credited`);
  }
  assert.ok(total <= MODEL_BUDGET.totalBytes, `hero models total ${total} bytes`);
  assert.equal(QUALITY.low.models, false, "Low keeps the procedural props");
});

test("every committed hero model is exactly what scripts/camp-models.mjs builds", () => {
  assert.deepEqual(Object.keys(BUILDERS).sort(), CAMP_MODELS.map((m) => m.id).sort());
  for (const m of CAMP_MODELS) {
    const built = toGlb(BUILDERS[m.id]());
    assert.ok(Buffer.from(built).equals(readFileSync(file(m))), `${m.file} is stale: run node scripts/camp-models.mjs`);
    assert.ok(statSync(file(m)).size > 0);
  }
});

test("hero models load with the vendored GLTFLoader", async () => {
  const { GLTFLoader } = await import("../../assets/vendor/three/GLTFLoader.js");
  for (const m of CAMP_MODELS) {
    const bytes = readFileSync(file(m));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const meshes = [];
    gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    assert.ok(meshes.length > 0);
    meshes.forEach((mesh) => assert.ok(MODEL_MATERIALS.includes(mesh.material.name)));
    m.hooks.forEach((hook) => assert.ok(gltf.scene.getObjectByName(hook), `${hook} survives loading`));
  }
});
