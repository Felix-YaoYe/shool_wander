// Records the rendered canvas in real time. This is not a deterministic offline encoder.
export function createCanvasRecording(canvas, { fps = 30, bitrate = 8_000_000, Recorder = globalThis.MediaRecorder } = {}) {
  if (!Recorder || typeof canvas.captureStream !== 'function') throw new Error('当前浏览器不支持画布视频录制，请使用新版 Chrome 或 Edge。');
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'].find(type => Recorder.isTypeSupported(type));
  if (!mimeType) throw new Error('当前浏览器没有可用的视频编码器。');
  let stream;
  let recorder;
  try {
    stream = canvas.captureStream(fps);
    recorder = new Recorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    throw new Error(error.name === 'SecurityError' ? '画布无法录制，请检查模型和纹理资源的跨域配置。' : '无法启动视频编码，请降低画布分辨率或更换浏览器。');
  }
  const chunks = [];
  let settled = false, cancelled = false, hasStarted = false, resolveStart, rejectStart, resolveFinish, rejectFinish;
  const started = new Promise((resolve, reject) => { resolveStart = resolve; rejectStart = reject; });
  const finished = new Promise((resolve, reject) => { resolveFinish = resolve; rejectFinish = reject; });
  // The caller awaits started first, so hold early finished rejections until its handler attaches.
  finished.catch(() => {});
  function finish(error) {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    stream.getTracks().forEach(track => track.stop());
    if (!hasStarted) rejectStart(error || new Error('视频录制尚未启动。'));
    if (error) { rejectFinish(error); return; }
    if (cancelled) { chunks.length = 0; resolveFinish({ cancelled: true }); return; }
    if (!chunks.length) { rejectFinish(new Error('没有录到有效画面，请保持页面在前台并重试。')); return; }
    const actualType = recorder.mimeType || mimeType;
    resolveFinish({ cancelled: false, blob: new Blob(chunks, { type: actualType }), mimeType: actualType, extension: actualType.includes('mp4') ? 'mp4' : 'webm' });
    chunks.length = 0;
  }
  recorder.onstart = () => { hasStarted = true; clearTimeout(timeout); resolveStart(); };
  recorder.ondataavailable = event => { if (!settled && !cancelled && event.data?.size) chunks.push(event.data); };
  recorder.onstop = () => finish();
  recorder.onerror = () => { finish(new Error('视频编码中断，请降低分辨率或更换浏览器后重试。')); try { if (recorder.state !== 'inactive') recorder.stop(); } catch {} };
  const timeout = setTimeout(() => {
    finish(new Error('视频编码器启动超时，请重试。'));
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
  }, 10_000);
  function stop() { if (settled) return; try { if (recorder.state !== 'inactive') recorder.stop(); else finish(); } catch { finish(new Error('视频录制结束失败，请重试。')); } }
  function cancel() { cancelled = true; stop(); }
  try { recorder.start(1000); } catch { finish(new Error('无法启动视频录制，请检查浏览器支持。')); }
  return { started, finished, stop, cancel, mimeType };
}
