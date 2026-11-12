/** shellLayer.worker — 在 Worker 线程里算整层壳的几何（详细 / 简化） */
import { computeLayerGeometry } from './shellLayerCompute.js';
import { computeShellSimpleLayer } from './shellSimpleCompute.js';

self.onmessage = async (e) => {
  let layer;
  try {
    layer = e.data.model === 'simplified'
      ? await computeShellSimpleLayer(e.data.shData, e.data.orbit, e.data.scale)
      : await computeLayerGeometry(e.data.shData, e.data.orbit, e.data.scale);
  } catch (err) {
    self.postMessage({ error: (err && err.message) ? err.message : String(err) });
    return;
  }
  const buffers = new Set();
  const add = (value) => {
    if (ArrayBuffer.isView(value)) {
      buffers.add(value.buffer);
    } else if (Array.isArray(value)) {
      for (const item of value) add(item);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) add(item);
    }
  };
  add(layer);
  // 用 Set 去重: 同一个 ArrayBuffer 出现两次会让 postMessage 抛 DataCloneError
  self.postMessage({ layer }, [...buffers]);
};
