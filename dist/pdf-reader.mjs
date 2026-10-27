/** Canvas PDF reader. PDF bytes remain on this device. */
export function openPDF(book, { onProgress = () => {}, onClose = () => {} } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'pdf-overlay';
  dialog.setAttribute('aria-label', `阅读 ${book.name}`);
  dialog.innerHTML = `<div class="pdf-toolbar"><button type="button" class="pdf-back" aria-label="关闭阅读器">← 书架</button><strong class="pdf-title"></strong><a class="pdf-download" download>保存原文件</a></div><div class="pdf-controls"><button type="button" class="pdf-prev" aria-label="上一页">←</button><label class="pdf-page-label"><input class="pdf-page" type="number" min="1" inputmode="numeric" aria-label="跳转页码" value="1"><span class="pdf-total"> / —</span></label><button type="button" class="pdf-next" aria-label="下一页">→</button><span class="pdf-zoom-controls"><button type="button" class="pdf-minus" aria-label="缩小">−</button><span class="pdf-zoom">100%</span><button type="button" class="pdf-plus" aria-label="放大">＋</button></span></div><p class="pdf-status" role="status" aria-live="polite">正在打开电子书…</p><div class="pdf-content"><canvas class="pdf-canvas" aria-label="电子书页面"></canvas></div>`;
  const el = name => dialog.querySelector(`.pdf-${name}`);
  el('title').textContent = book.name;
  const url = URL.createObjectURL(book.blob);
  el('download').href = url;
  el('download').download = book.name;
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.append(dialog);
  dialog.showModal();
  let pdf, loadingTask, rendering, renderId = 0, closed = false, passwordRequired = false, zoom = 1, resizeTimer;
  let pageNumber = Math.max(1, Number(book.page) || 1);
  const signalController = new AbortController();
  const event = (element, name, fn) => element.addEventListener(name, fn, { signal: signalController.signal });
  const status = message => { if (!closed) el('status').textContent = message; };
  const setBusy = () => {
    el('prev').disabled = !pdf || pageNumber <= 1;
    el('next').disabled = !pdf || pageNumber >= pdf.numPages;
    el('page').disabled = !pdf;
    el('minus').disabled = !pdf || zoom <= 0.5;
    el('plus').disabled = !pdf || zoom >= 2.5;
  };

  function close() {
    if (closed) return;
    closed = true;
    renderId++;
    clearTimeout(resizeTimer);
    signalController.abort();
    rendering?.cancel();
    loadingTask?.destroy().catch(() => {});
    URL.revokeObjectURL(url);
    dialog.close();
    dialog.remove();
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus?.();
    onClose();
  }

  async function renderPage() {
    if (!pdf || closed) return;
    const ticket = ++renderId;
    const old = rendering;
    old?.cancel();
    if (old) await old.promise.catch(() => {});
    if (ticket !== renderId || closed) return;
    status('正在载入页面…');
    try {
      const page = await pdf.getPage(pageNumber);
      if (ticket !== renderId || closed) return;
      const base = page.getViewport({ scale: 1 });
      const available = Math.max(240, el('content').clientWidth - 32);
      const scale = Math.min(available / base.width, 1.8) * zoom;
      const viewport = page.getViewport({ scale });
      const pixels = viewport.width * viewport.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12000000 / pixels));
      const canvas = el('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      rendering = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await rendering.promise;
      if (ticket !== renderId || closed) return;
      rendering = undefined;
      el('page').value = String(pageNumber);
      el('page').max = String(pdf.numPages);
      el('total').textContent = ` / ${pdf.numPages}`;
      el('zoom').textContent = `${Math.round(zoom * 100)}%`;
      el('content').scrollTo({ top: 0, left: 0 });
      setBusy();
      status('阅读进度自动保存在本机 · 可缩放和跳页');
      try { await onProgress({ page: pageNumber, totalPages: pdf.numPages }); }
      catch { status('电子书已打开，阅读进度暂未保存，请检查本机存储空间'); }
    } catch (error) {
      if (error?.name === 'RenderingCancelledException' || closed || ticket !== renderId) return;
      status('这一页无法显示，可尝试下一页，或保存原文件后使用系统阅读器打开');
      setBusy();
    }
  }

  function go(page) {
    if (!pdf) return;
    const next = Math.trunc(Number(page));
    if (!Number.isFinite(next) || next < 1 || next > pdf.numPages) {
      el('page').value = String(pageNumber);
      status(`请输入 1 到 ${pdf.numPages} 之间的页码`);
      return;
    }
    pageNumber = next;
    setBusy();
    renderPage();
  }
  event(el('back'), 'click', close);
  event(dialog, 'cancel', e => { e.preventDefault(); close(); });
  event(el('prev'), 'click', () => go(pageNumber - 1));
  event(el('next'), 'click', () => go(pageNumber + 1));
  event(el('page'), 'change', e => go(e.target.value));
  event(el('page'), 'keydown', e => { if (e.key === 'Enter') go(e.target.value); });
  event(el('minus'), 'click', () => { zoom = Math.max(0.5, Math.round((zoom - 0.25) * 100) / 100); renderPage(); });
  event(el('plus'), 'click', () => { zoom = Math.min(2.5, Math.round((zoom + 0.25) * 100) / 100); renderPage(); });
  event(dialog, 'keydown', e => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowLeft' && pageNumber > 1) { e.preventDefault(); go(pageNumber - 1); }
    if (e.key === 'ArrowRight' && pdf && pageNumber < pdf.numPages) { e.preventDefault(); go(pageNumber + 1); }
  });
  event(window, 'resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderPage, 180); });
  setBusy();
  (async () => {
    try {
      const pdfjs = await import('./vendor/pdf.mjs');
      if (closed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', import.meta.url).href;
      const bytes = new Uint8Array(await book.blob.arrayBuffer());
      if (closed) return;
      loadingTask = pdfjs.getDocument({ data: bytes, cMapUrl: new URL('./vendor/cmaps/', import.meta.url).href, cMapPacked: true, standardFontDataUrl: new URL('./vendor/standard_fonts/', import.meta.url).href, wasmUrl: new URL('./vendor/wasm/', import.meta.url).href, isEvalSupported: false });
      loadingTask.onPassword = () => {
        passwordRequired = true;
        status('这本 PDF 需要密码。请先用系统阅读器解密，再重新导入；也可以保存原文件后打开。');
        loadingTask.destroy().catch(() => {});
      };
      pdf = await loadingTask.promise;
      if (closed) return;
      pageNumber = Math.min(pageNumber, pdf.numPages);
      await renderPage();
    } catch (error) {
      if (closed) return;
      if (passwordRequired || error?.name === 'PasswordException' || /password/i.test(error?.message ?? '')) status('这本 PDF 需要密码。请先解密后重新导入，或保存原文件用系统阅读器打开。');
      else if (error?.name === 'InvalidPDFException') status('这份 PDF 已损坏或内容无效。请使用原始电子书重新导入。');
      else status('暂时无法打开电子书。首次使用请联网载入阅读组件，也可保存原文件用系统阅读器打开。');
      setBusy();
    }
  })();
  return close;
}
