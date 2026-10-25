import * as THREE from './vendor/three.module.js';

export function validateRoute(data, sceneId, {allowPartial = false} = {}) {
  if (!data || data.version !== 1 || !Array.isArray(data.keyframes)) throw new Error('不是有效的 Campus Atlas 路线文件。');
  if (data.sceneId !== sceneId) throw new Error('路线所属场景与当前模型不同，请先加载对应模型。');
  if (data.keyframes.length < (allowPartial ? 0 : 2) || data.keyframes.length > 500) throw new Error('路线需要 2～500 个相机关键帧。');
  if (!Number.isFinite(data.duration) || data.duration < 10 || data.duration > 300) throw new Error('导览时长应为 10～300 秒。');
  const vec = (a, n) => Array.isArray(a) && a.length === n && a.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e9);
  const keyframes = data.keyframes.map((k, i) => {
    if (!vec(k.position, 3) || !vec(k.quaternion, 4) || Math.hypot(...k.quaternion) < 1e-6 || !Number.isFinite(k.fov) || k.fov < 15 || k.fov > 110) throw new Error(`第 ${i + 1} 个镜头参数无效。`);
    return { name: String(k.name || `镜头 ${i + 1}`).slice(0, 60), position: [...k.position], quaternion: new THREE.Quaternion(...k.quaternion).normalize().toArray(), fov: k.fov };
  });
  return { version: 1, sceneId, duration: data.duration, keyframes };
}

export function buildRoute(keyframes) {
  if (keyframes.length < 2) return null;
  const points = keyframes.map(k => new THREE.Vector3(...k.position));
  // Repeated positions are valid (e.g. a stationary pan); tiny offsets avoid a degenerate arc-length map.
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  curve.arcLengthDivisions = Math.max(600, keyframes.length * 80);
  const lengths = curve.getLengths();
  const total = lengths.at(-1);
  const fractions = keyframes.map((_, i) => total > 1e-8 ? lengths[Math.round(i / (keyframes.length - 1) * (lengths.length - 1))] / total : i / (keyframes.length - 1));
  return { curve, total, fractions, keyframes };
}

export function sampleRoute(route, progress) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const { keyframes, fractions, curve, total } = route;
  let i = 0;
  while (i < keyframes.length - 2 && t >= fractions[i + 1]) i++;
  const a = keyframes[i], b = keyframes[i + 1];
  const range = fractions[i + 1] - fractions[i];
  const u = THREE.MathUtils.clamp(range > 1e-8 ? (t - fractions[i]) / range : 1, 0, 1);
  const ease = u * u * (3 - 2 * u);
  const position = total > 1e-8 ? curve.getPointAt(t) : new THREE.Vector3(...a.position).lerp(new THREE.Vector3(...b.position), ease);
  const quaternion = new THREE.Quaternion(...a.quaternion).slerp(new THREE.Quaternion(...b.quaternion), ease).normalize();
  return { position, quaternion, fov: THREE.MathUtils.lerp(a.fov, b.fov, ease) };
}
