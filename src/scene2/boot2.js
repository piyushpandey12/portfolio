const SEAM = 0.45;

export async function initUniverse() {
  const section = document.getElementById('universe');
  const film = document.getElementById('uniFilm');
  const veil = document.getElementById('uniVeil');
  if (!section || !film || !veil) return null;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { visible: false, raf: 0, entered: false };

  const play = () => {
    film.play().catch(() => {

      const retry = () => { film.play().catch(() => {}); };
      window.addEventListener('pointerdown', retry, { once: true });
      window.addEventListener('scroll', retry, { once: true });
    });
  };

  const watchSeam = () => {
    const tick = () => {
      if (!state.visible) return;
      const d = film.duration || 10;
      const t = film.currentTime;
      const toEnd = d - t;
      const dip = Math.min(1, Math.min(t, Math.max(toEnd, 0)) / SEAM);

      veil.style.opacity = state.entered ? String((1 - dip) * 0.92) : '1';
      state.raf = film.requestVideoFrameCallback
        ? film.requestVideoFrameCallback(tick)
        : requestAnimationFrame(tick);
    };
    state.raf = film.requestVideoFrameCallback
      ? film.requestVideoFrameCallback(tick)
      : requestAnimationFrame(tick);
  };

  new IntersectionObserver((entries) => {
    for (const e of entries) {
      state.visible = e.isIntersecting;
      if (e.isIntersecting) {
        if (!state.entered) {
          state.entered = true;
          section.classList.add('is-on');
          veil.style.opacity = '0';
        }
        if (reduced) {

          film.currentTime = Math.min(6.5, (film.duration || 10) * 0.6);
          film.pause();
          veil.style.opacity = '0';
        } else {
          play();
          watchSeam();
        }
      } else {
        film.pause();
      }
    }
  }, { threshold: 0.30 }).observe(section);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') film.pause();
    else if (state.visible && !reduced) play();
  });

  film.addEventListener('error', () => section.classList.add('is-fallback'),
    { once: true });

  window.addEventListener('load', () => {
    if (!state.entered && film.preload !== 'auto') {
      film.preload = 'auto';
      film.load();
    }
  }, { once: true });

  return { film, section };
}
