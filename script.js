/* ══════════════════════════════════════════════════════════════
   LUXENY — scroll-scrubbed hero
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

  const hero    = document.querySelector('[data-scrub]');
  const video   = $('heroVideo');
  const veil    = $('heroVeil');
  const content = $('heroContent');
  const hint    = $('heroHint');
  const loader  = $('heroLoader');
  const title   = $('heroTitle');
  const quote   = $('heroQuote');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* всегда начинаем с первого кадра */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  /* ── 1. Заголовок по буквам ───────────────────────────────── */
  if (title) {
    const word = title.textContent.trim();
    title.textContent = '';
    [...word].forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.style.setProperty('--i', i);
      s.textContent = c;
      title.appendChild(s);
    });
    title.setAttribute('aria-label', word);
  }

  /* ── 2. Цитата по словам ──────────────────────────────────── */
  const words = [];
  if (quote) {
    const text = quote.textContent.trim().split(/\s+/);
    quote.textContent = '';
    text.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = w;
      quote.appendChild(span);
      if (i < text.length - 1) quote.appendChild(document.createTextNode(' '));
      words.push(span);
    });
  }

  /* ── 3. Загрузка видео ────────────────────────────────────── */
  /* Три варианта ролика. Отдельный вертикальный нужен телефону: широкий
     кадр в узком окне object-fit: cover растягивал впятеро и превращал
     в мыло — от исходника оставалась полоска в 220px по ширине.
     У вертикального обрезка сделана заранее, по высоте кадра. */
  const portrait = matchMedia('(max-width: 900px) and (max-aspect-ratio: 3/4)').matches;
  const source = portrait
    ? 'assets/hero-portrait.mp4'
    : matchMedia('(max-width: 820px)').matches
      ? 'assets/hero-1100.mp4'
      : 'assets/hero-1920.mp4';

  /* постер под тот же кадр; в разметке его нет, иначе телефон тянул бы
     обе картинки — нужную и широкую */
  video.poster = portrait ? 'assets/poster-portrait.jpg' : 'assets/poster.jpg';
  if (portrait) video.classList.add('hero__video--portrait');

  let duration = 0;
  let ready    = false;

  const markReady = () => {
    if (ready) return;
    ready = true;
    if (loader) loader.querySelector('i').style.width = '100%';
    document.body.classList.add('is-ready');
  };

  const trackBuffer = () => {
    if (!loader || ready || !video.duration) return;
    const b = video.buffered;
    if (!b.length) return;
    const pct = clamp(b.end(b.length - 1) / video.duration) * 100;
    loader.querySelector('i').style.width = pct.toFixed(1) + '%';
  };

  video.addEventListener('loadedmetadata', () => {
    duration = video.duration || 0;
    /* «разбудить» декодер: iOS/Safari не даёт seek до первого play() */
    const p = video.play();
    if (p && p.then) p.then(() => video.pause()).catch(() => {});
    else video.pause();
  }, { once: true });

  video.addEventListener('progress', trackBuffer);
  video.addEventListener('loadeddata', trackBuffer);
  video.addEventListener('canplaythrough', markReady);
  video.addEventListener('error', markReady);       /* не блокируем сайт */
  setTimeout(markReady, 4500);                       /* страховка */

  video.src = source;
  video.load();

  /* дополнительная разблокировка по первому касанию (iOS) */
  const unlock = () => {
    const p = video.play();
    if (p && p.then) p.then(() => video.pause()).catch(() => {});
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('touchstart', unlock, { once: true, passive: true });
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });

  /* ── 4. Скраб по скроллу ──────────────────────────────────── */
  const nav = $('nav');
  let scrim = false;

  const TEXT_OUT  = 0.055;  /* LUXENY исчезает почти сразу */
  const HINT_OUT  = 0.035;
  const VEIL_IN   = 0.94;   /* подстраховка стыка с чёрной секцией */

  const Q_IN      = 0.13;   /* первое слово цитаты */
  const Q_SPAN    = 0.38;   /* за сколько прокрутки выкладываются все слова */
  const Q_RAMP    = 0.06;   /* длительность проявления одного слова */
  const Q_OUT     = 0.74;   /* начало растворения */
  const Q_GONE    = 0.88;   /* цитата растворилась полностью */

  /* Телефоны и слабые машины: blur() по кадру — самая дорогая часть скраба.
     Фильтр пересчитывается и для заголовка, и для каждого слова цитаты,
     то есть под два десятка раз за кадр. Там, где это дорого, оставляем
     только прозрачность и сдвиг: их считает видеоядро, а не процессор. */
  const LOWFX =
    matchMedia('(max-width: 900px), (pointer: coarse)').matches ||
    (navigator.hardwareConcurrency || 8) <= 4;
  if (LOWFX) document.documentElement.classList.add('lowfx');

  let cur = 0, tgt = 0, lastSet = -1, lastP = -1, lastActive = 0;

  /* Пишем в style только то, что действительно изменилось: повторная запись
     того же значения всё равно стоит браузеру пересчёта стилей, а таких
     записей здесь по несколько десятков на кадр. */
  const wrote = new WeakMap();
  const put = (el, prop, val) => {
    let m = wrote.get(el);
    if (!m) { m = Object.create(null); wrote.set(el, m); }
    if (m[prop] === val) return;
    m[prop] = val;
    if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, val);
    else el.style[prop] = val;
  };

  /* в ролике 24 кадра в секунду — искать время точнее одного кадра незачем,
     декодер всё равно покажет тот же самый кадр */
  const VFRAME = 1 / 24;
  let seekAt = 0;
  const seek = (t) => {
    const q = Math.round(t / VFRAME) * VFRAME;
    if (q === lastSet) return;
    /* Предыдущая перемотка ещё идёт: запрос поверх неё декодер отрабатывает
       рывком, и на телефоне это главный источник дёрганья. Пропускаем кадр —
       следующий возьмёт уже более свежее значение, движение не отстанет.
       Четверть секунды — потолок ожидания: если декодер почему-то завис на
       seeking, лучше отправить новый запрос, чем встать намертво. */
    if (video.seeking && performance.now() - seekAt < 260) return;
    lastSet = q;
    seekAt = performance.now();
    try {
      if (typeof video.fastSeek === 'function') video.fastSeek(q);
      else video.currentTime = q;
    } catch (_) { /* seek до готовности — игнорируем */ }
  };

  const frame = () => {
    /* --- читаем --- */
    const rect = hero.getBoundingClientRect();
    const vh   = window.innerHeight;
    let busy = false;                    /* кому-то ещё нужны кадры */

    /* затемнение под шапкой считаем здесь же: прямоугольник героя уже
       прочитан, отдельный слушатель scroll читал бы его второй раз */
    if (nav) {
      const past = rect.bottom < vh * 0.5;
      if (past !== scrim) { scrim = past; nav.classList.toggle('nav--scrim', past); }
    }

    /* пока герой далеко от экрана — не трогаем ни видео, ни стили */
    if (rect.bottom > -vh && rect.top < vh) {
      busy = true;
      const range = hero.offsetHeight - vh;
      const p     = range > 0 ? clamp(-rect.top / range) : 0;

      const fade  = clamp(p / TEXT_OUT);
      const hFade = clamp(p / HINT_OUT);
      const vIn   = clamp((p - VEIL_IN) / (1 - VEIL_IN));

      /* --- пишем --- */
      put(content, 'opacity', String(1 - fade));
      put(content, 'transform', `translate3d(0,${(-fade * 46).toFixed(2)}px,0)`);
      if (!LOWFX) {
        put(content, 'filter', fade > 0.002 ? `blur(${(fade * 14).toFixed(2)}px)` : 'none');
      }
      if (hint) put(hint, 'opacity', String(1 - hFade));
      put(veil, 'opacity', String(vIn));

      /* цитата: слова выкладываются одно за другим, затем блок растворяется */
      if (words.length && Math.abs(p - lastP) > 0.0004) {
        lastP = p;
        const out = 1 - clamp((p - Q_OUT) / (Q_GONE - Q_OUT));
        put(quote, 'opacity', String(out));
        if (!LOWFX) {
          put(quote, 'filter', out < 0.999 ? `blur(${((1 - out) * 9).toFixed(2)}px)` : 'none');
        }
        if (out > 0) {
          /* черта прочерчивается чуть раньше первого слова */
          put(quote, '--ql', clamp((p - Q_IN + 0.035) / Q_RAMP).toFixed(3));
          const step = Q_SPAN / words.length;
          for (let i = 0; i < words.length; i++) {
            const a = clamp((p - (Q_IN + i * step)) / Q_RAMP);
            const w = words[i];
            put(w, 'opacity', String(a));
            put(w, 'transform', `translateY(${((1 - a) * 0.4).toFixed(3)}em)`);
            if (!LOWFX) {
              put(w, 'filter', a > 0.995 ? 'none' : `blur(${((1 - a) * 7).toFixed(2)}px)`);
            }
          }
        }
      }

      if (duration > 0) {
        tgt = p * (duration - 0.033);
        const d = tgt - cur;
        /* мягко на колесе, быстро на прыжках (якоря, End, драг скроллбара) */
        cur += d * (Math.abs(d) > 0.6 ? 0.45 : 0.18);
        if (Math.abs(tgt - cur) < 0.004) cur = tgt;
        seek(cur);
      }
    }

    /* трейлер: карточка выезжает из темноты справа, в фокусе — по центру,
       ушедшая вверх растворяется. Активный пункт слева — ближайшая к центру. */
    if (reelItems.length && !reduced) {
      const box = reelCards.getBoundingClientRect();
      if (box.bottom < -vh || box.top > vh * 1.6) {   /* трейлер далеко — не считаем */
        return schedule(busy);
      }
      busy = true;
      const shift = Math.min(200, window.innerWidth * 0.26);
      const ease  = (t) => t * t * (3 - 2 * t);       /* мягкий разгон и торможение */
      let best = 0, bestD = Infinity, lastEx = 0;

      for (let i = 0; i < reelItems.length; i++) {
        const el = reelItems[i];
        const r  = el.getBoundingClientRect();
        const c  = (r.top + r.height / 2) / vh;      /* 0 — верх экрана, 1 — низ */

        const d = Math.abs(c - 0.5);
        if (d < bestD) { bestD = d; best = i; }

        const en = ease(clamp((1.08 - c) / 0.5));     /* приход: 1.08 → 0.58 */
        const ex = ease(clamp((0.42 - c) / 0.32));    /* уход:   0.42 → 0.10 */

        /* дуга: выходит снизу справа, встаёт по центру, уходит вправо и вверх */
        const x = (1 - en) * shift + ex * shift;
        const y = (1 - en) * 28 - ex * 95;
        const rot = (1 - en) * 2.2 - ex * 2.2;

        put(el, 'opacity', ((0.1 + en * 0.9) * (1 - ex)).toFixed(3));
        put(el, 'transform',
          `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg)`);
        /* свет разгорается к центру и гаснет по краям */
        put(el, '--glow', clamp(1 - Math.abs(c - 0.5) * 2.4).toFixed(3));
        if (i === reelItems.length - 1) lastEx = ex;
      }

      /* колонка слева уходит влево вместе с последней карточкой */
      if (reelAside) {
        put(reelAside, 'opacity', (1 - lastEx).toFixed(3));
        put(reelAside, 'transform',
          `translateY(-50%) translateX(${(-lastEx * 110).toFixed(1)}px)`);
        put(reelAside, 'pointerEvents', lastEx > 0.6 ? 'none' : 'auto');
      }

      if (best !== lastActive) {
        lastActive = best;
        for (let i = 0; i < reelTitles.length; i++) {
          reelTitles[i].classList.toggle('on', i === best);
        }
      }
    }

    return schedule(busy);
  };

  /* ── 5. Цикл не крутится вхолостую ─────────────────────────
     Раньше он до конца сеанса дважды за кадр дёргал
     getBoundingClientRect — на телефоне это отнимало кадры даже внизу
     страницы, где ни героя, ни трейлера давно нет. Теперь, когда считать
     нечего, цикл засыпает и просыпается от скролла. */
  let running = false;
  const schedule = (busy) => {
    if (busy) requestAnimationFrame(frame);
    else running = false;
  };
  const kick = () => {
    if (running || reduced) return;
    running = true;
    requestAnimationFrame(frame);
  };

  if (!reduced) {
    kick();
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', kick);
    addEventListener('orientationchange', kick);
  } else {
    /* режим «меньше движения»: скраба нет, но затемнение под шапкой
       всё равно нужно — считаем его по скроллу, как раньше */
    veil.style.opacity = '0';
    if (nav) {
      const syncScrim = () => {
        const past = hero.getBoundingClientRect().bottom < window.innerHeight * 0.5;
        if (past === scrim) return;
        scrim = past;
        nav.classList.toggle('nav--scrim', past);
      };
      addEventListener('scroll', syncScrim, { passive: true });
      addEventListener('resize', syncScrim);
      syncScrim();
    }
  }

  /* ── 6. Логотип возвращает наверх ─────────────────────────── */
  const logo = $('navLogo');
  if (logo) {
    logo.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      } catch (_) {
        window.scrollTo(0, 0);
      }
    });
  }

  /* ── 7. Мобильное меню ────────────────────────────────────── */
  const burger = $('burger');
  const menu   = $('mobileMenu');
  if (burger && menu) {
    const setOpen = (open) => {
      burger.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
      document.documentElement.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', () =>
      setOpen(burger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') setOpen(false);
    });
  }

  /* ── 8. Трейлер: подсветка заголовков и счётчики ───────────── */
  const reelList  = $('reelList');
  const reelCards = $('reelCards');
  const reelTitles = reelList ? [...reelList.children] : [];
  const reelItems  = reelCards ? [...reelCards.children] : [];
  const reelAside  = document.querySelector('.reel__aside');
  if (reelTitles.length) reelTitles[0].classList.add('on');

  /* клик по пункту слева выводит его карточку в центр экрана.
     Считаем через offsetTop: getBoundingClientRect учёл бы сдвиг от анимации. */
  const docTop = (el) => { let y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; };
  reelTitles.forEach((li, i) => {
    const btn  = li.querySelector('button');
    const card = reelItems[i];
    if (!btn || !card) return;
    btn.addEventListener('click', () => {
      const top = Math.round(docTop(card) - (window.innerHeight - card.offsetHeight) / 2);
      try {
        window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
      } catch (_) {
        window.scrollTo(0, top);
      }
    });
  });

  /* счётчики — один раз, при первом появлении */
  const nums = document.querySelectorAll('[data-num]');
  const fmt = (v, dec) => dec
    ? v.toFixed(dec).replace('.', ',')
    : Math.round(v).toLocaleString('ru-RU');

  const runNum = (el) => {
    const target = parseFloat(el.dataset.num);
    const dec    = parseInt(el.dataset.dec || '0', 10);
    if (reduced || !Number.isFinite(target)) { el.textContent = fmt(target, dec); return; }
    const t0 = performance.now(), dur = 900;
    const step = (now) => {
      const p = clamp((now - t0) / dur);
      el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)), dec);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = fmt(target, dec);
    };
    requestAnimationFrame(step);
  };

  if ('IntersectionObserver' in window) {
    const numIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        runNum(e.target);
        numIO.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    nums.forEach((el) => numIO.observe(el));
  } else {
    nums.forEach(runNum);
  }

  /* ── 10. Необязательные картинки: нет файла — остаётся заглушка ─ */
  document.querySelectorAll('img[data-optional]').forEach((img) => {
    img.addEventListener('error', () => img.remove(), { once: true });
    if (img.complete && img.naturalWidth === 0) img.remove();
  });

  /* ── 11. Колода карточек ───────────────────────────────────── */
  document.querySelectorAll('[data-deck]').forEach((deck) => {
    const cards = [...deck.children];
    const wrap  = deck.parentElement;
    const caps  = [...wrap.querySelectorAll('.deck__caps span')];
    const dots  = [...wrap.querySelectorAll('.deck__dots button')];
    const n = cards.length;
    if (n < 2) return;

    let active = 0, timer = 0, paused = false, seen = true;

    const layout = () => {
      for (let i = 0; i < n; i++) {
        const d = (i - active + n) % n;           /* 0 — сверху колоды */
        const c = cards[i];
        c.style.setProperty('--d', Math.min(d, 3));
        c.style.opacity = d === 0 ? '1' : d === 1 ? '.9' : d === 2 ? '.66' : '0';
        c.style.zIndex  = String(60 - d);
        c.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
      }
      caps.forEach((c, k) => c.classList.toggle('on', k === active));
      dots.forEach((b, k) => b.classList.toggle('on', k === active));
    };

    const fly = (el, cls) => {
      if (reduced) return;
      /* снимаем следы прошлого шага: если анимация не успела доиграть,
         классы иначе копятся и карточки залипают в промежуточном виде */
      cards.forEach((c) => c.classList.remove('is-out', 'is-in'));
      void el.offsetWidth;                       /* перезапуск анимации */
      el.classList.add(cls);
      el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
    };

    const go = (next) => {
      if (next === active) return;
      const forward = (next - active + n) % n <= (active - next + n) % n;
      const out = cards[active];
      const inc = cards[next];
      active = next;
      layout();
      /* вперёд — верхняя падает вниз; назад — следующая поднимается снизу */
      fly(forward ? out : inc, forward ? 'is-out' : 'is-in');
    };

    const step = () => go((active + 1) % n);

    /* сама себя перелистывает по кругу, пока видна и на неё не навели */
    const tick = () => { if (!paused && seen) step(); };
    const start = () => { clearInterval(timer); timer = setInterval(tick, 4600); };
    if (!reduced) start();

    layout();
    deck.addEventListener('click', () => { step(); start(); });
    dots.forEach((b, k) => b.addEventListener('click', () => { go(k); start(); }));

    /* стрелки рядом с точками — та же навигация, просто крупнее цель */
    const back = wrap.querySelector('.deck__arrow--prev');
    const fwd  = wrap.querySelector('.deck__arrow--next');
    if (back) back.addEventListener('click', () => { go((active - 1 + n) % n); start(); });
    if (fwd)  fwd.addEventListener('click',  () => { go((active + 1) % n); start(); });

    wrap.addEventListener('pointerenter', () => { paused = true; });
    wrap.addEventListener('pointerleave', () => { paused = false; });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.2 }).observe(deck);
    }

    /* свайп по колоде */
    let x0 = null;
    deck.addEventListener('pointerdown', (e) => { x0 = e.clientX; }, { passive: true });
    deck.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) < 40) return;
      go(dx < 0 ? (active + 1) % n : (active - 1 + n) % n);
      start();
    });
  });

  /* ── 11-alt. Стопка кадров: уходит вбок ────────────────────── */
  document.querySelectorAll('[data-slide]').forEach((box) => {
    const cards = [...box.children];
    const n = cards.length;
    if (n < 2) return;

    let active = 0, timer = 0, paused = false, seen = true;

    const layout = () => {
      for (let i = 0; i < n; i++) {
        const d = (i - active + n) % n;          /* 0 — верхний кадр */
        const c = cards[i];
        c.style.setProperty('--d', d);
        c.style.opacity = d === 0 ? '1' : d === 1 ? '.55' : '.3';
        c.style.zIndex  = String(60 - d);
        c.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
      }
    };

    const fly = (el, cls) => {
      if (reduced) return;
      cards.forEach((c) => c.classList.remove('is-out', 'is-in'));
      void el.offsetWidth;                       /* перезапуск анимации */
      el.classList.add(cls);
      el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
    };

    const go = (next) => {
      if (next === active) return;
      const forward = (next - active + n) % n <= (active - next + n) % n;
      const out = cards[active];
      const inc = cards[next];
      active = next;
      layout();
      fly(forward ? out : inc, forward ? 'is-out' : 'is-in');
    };
    const step = () => go((active + 1) % n);

    /* своя ступень может быть спрятана — тогда крутить нечего */
    const shown = () => {
      const stage = box.closest('.stage');
      return !stage || stage.classList.contains('is-on');
    };
    const tick  = () => { if (!paused && seen && shown()) step(); };
    const start = () => { clearInterval(timer); timer = setInterval(tick, 4400); };
    if (!reduced) start();

    layout();
    box.addEventListener('click', () => { step(); start(); });
    box.addEventListener('pointerenter', () => { paused = true; });
    box.addEventListener('pointerleave', () => { paused = false; });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.2 }).observe(box);
    }

    let x0 = null;
    box.addEventListener('pointerdown', (e) => { x0 = e.clientX; }, { passive: true });
    box.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) < 40) return;
      go(dx > 0 ? (active + 1) % n : (active - 1 + n) % n);
      start();
    });
  });

  /* ── 11-alt-2. Ступени подачи внутри одной главы ────────────── */
  document.querySelectorAll('[data-stages]').forEach((box) => {
    const stages = [...box.children];
    const wrap   = box.parentElement;
    const caps   = [...wrap.querySelectorAll('.deck__caps span')];
    const dots   = [...wrap.querySelectorAll('.deck__dots button')];
    const n = stages.length;
    if (n < 2) return;

    let active = 0, timer = 0, paused = false, seen = true;

    const layout = () => {
      stages.forEach((st, k) => {
        st.classList.toggle('is-on', k === active);
        st.setAttribute('aria-hidden', k === active ? 'false' : 'true');
      });
      caps.forEach((c, k) => c.classList.toggle('on', k === active));
      dots.forEach((b, k) => b.classList.toggle('on', k === active));
    };

    const go = (next) => { if (next !== active) { active = next; layout(); } };

    /* ступени держатся дольше кадров внутри них: иначе подача сменится
       раньше, чем зритель успеет разглядеть хотя бы пару кадров */
    const tick  = () => { if (!paused && seen) go((active + 1) % n); };
    const start = () => { clearInterval(timer); timer = setInterval(tick, 11000); };
    if (!reduced) start();

    layout();
    dots.forEach((b, k) => b.addEventListener('click', () => { go(k); start(); }));

    /* стрелки рядом с точками — та же навигация, просто крупнее цель */
    const back = wrap.querySelector('.deck__arrow--prev');
    const fwd  = wrap.querySelector('.deck__arrow--next');
    if (back) back.addEventListener('click', () => { go((active - 1 + n) % n); start(); });
    if (fwd)  fwd.addEventListener('click',  () => { go((active + 1) % n); start(); });

    wrap.addEventListener('pointerenter', () => { paused = true; });
    wrap.addEventListener('pointerleave', () => { paused = false; });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.2 }).observe(box);
    }
  });

  /* ── 11-bis. Веер постов ───────────────────────────────────── */
  document.querySelectorAll('[data-fan]').forEach((fan) => {
    const cards = [...fan.children];
    const wrap  = fan.parentElement;
    const caps  = [...wrap.querySelectorAll('.deck__caps span')];
    const dots  = [...wrap.querySelectorAll('.deck__dots button')];
    const size  = 3;                              /* по три карточки в развороте */
    /* шаг окна: по умолчанию развороты не пересекаются (тройка сменяет тройку),
       с шагом 1 веер прокручивается по одной карточке — тогда каждая успевает
       побывать в центре, даже если всего их три */
    const stride = Math.max(1, Math.min(size, +(fan.dataset.fanStep || size)));
    const len  = cards.length;
    const n = Math.ceil(len / stride);
    if (!len) return;

    /* первая карточка тройки встаёт по центру — крупнее и выше остальных,
       вторая и третья уходят влево и вправо */
    /* чем шире карточка, тем теснее разворот: иначе тройка вылезает за колонку.
       Отсюда своя тройка чисел на каждый вид — сдвиг, наклон и масштаб боковых */
    const set = fan.classList.contains('fan--wide')   ? { off: 28, rot: 6,   side: .86 }
              : fan.classList.contains('fan--square') ? { off: 40, rot: 7.5, side: .88 }
              :                                         { off: 46, rot: 7.5, side: .92 };
    const pose = [
      { x: '0%',              y: '-4%', r: '0deg',            s: '1.06',      z: 3 },
      { x: -set.off + '%',    y: '4%',  r: -set.rot + 'deg',  s: '' + set.side, z: 2 },
      { x:  set.off + '%',    y: '4%',  r:  set.rot + 'deg',  s: '' + set.side, z: 2 },
    ];

    let active = 0, timer = 0, paused = false, seen = true;

    const layout = () => {
      cards.forEach((c, i) => {
        /* какое место в развороте занимает карточка при текущем сдвиге окна */
        const k  = (i - active * stride + len * size) % len;
        const on = k < size;
        const p  = pose[k] || pose[0];
        /* чужая тройка складывается в стопку по центру и растворяется */
        c.style.setProperty('--fx', on ? p.x : '0%');
        c.style.setProperty('--fy', on ? p.y : '0%');
        c.style.setProperty('--fr', on ? p.r : '0deg');
        c.style.setProperty('--fs', on ? p.s : '.86');
        c.style.setProperty('--fo', on ? '1' : '0');
        /* приходящие раскрываются от центра к краям, уходящие складываются наоборот */
        c.style.setProperty('--fd', (on ? k * 90 : (size - 1) * 55) + 'ms');
        c.style.zIndex = String(on ? p.z : 1);
        c.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      caps.forEach((c, k) => c.classList.toggle('on', k === active));
      dots.forEach((b, k) => b.classList.toggle('on', k === active));
    };

    const go = (next) => { if (next !== active) { active = next; layout(); } };
    const step = () => go((active + 1) % n);

    const tick  = () => { if (!paused && seen) step(); };
    const start = () => { clearInterval(timer); timer = setInterval(tick, stride < size ? 4200 : 5200); };
    if (!reduced && n > 1) start();

    layout();
    if (n > 1) {
      fan.addEventListener('click', () => { step(); start(); });
      dots.forEach((b, k) => b.addEventListener('click', () => { go(k); start(); }));

    /* стрелки рядом с точками — та же навигация, просто крупнее цель */
    const back = wrap.querySelector('.deck__arrow--prev');
    const fwd  = wrap.querySelector('.deck__arrow--next');
    if (back) back.addEventListener('click', () => { go((active - 1 + n) % n); start(); });
    if (fwd)  fwd.addEventListener('click',  () => { go((active + 1) % n); start(); });

      wrap.addEventListener('pointerenter', () => { paused = true; });
      wrap.addEventListener('pointerleave', () => { paused = false; });

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.2 }).observe(fan);
      }

      /* свайп по вееру */
      let x0 = null;
      fan.addEventListener('pointerdown', (e) => { x0 = e.clientX; }, { passive: true });
      fan.addEventListener('pointerup', (e) => {
        if (x0 === null) return;
        const dx = e.clientX - x0; x0 = null;
        if (Math.abs(dx) < 40) return;
        go(dx < 0 ? (active + 1) % n : (active - 1 + n) % n);
        start();
      });
    }
  });

  /* ── 11-bis-2. Параллакс обложки ───────────────────────────── */
  const parallax = [...document.querySelectorAll('[data-parallax]')];
  if (parallax.length && !reduced) {
    const items = parallax.map((box) => ({ box, img: box.querySelector('img'), on: false }));

    const ZOOM = 0.22;                       /* насколько картинка вырастает за проход */

    const place = (it) => {
      const r = it.box.getBoundingClientRect();
      /* насколько центр полосы разошёлся с центром экрана */
      const mid = r.top + r.height / 2 - innerHeight / 2;
      /* доля прохода: 0 — полоса только выходит снизу, 1 — уже ушла вверх */
      const p = clamp(0.5 - mid / (innerHeight + r.height));
      const scale = 1 + p * ZOOM;
      /* ход ограничен запасом высоты картинки, иначе оголятся края;
         увеличение этот запас только добавляет, поэтому считаем по масштабу */
      const max = r.height * (1.28 * scale - 1) / 2 - 2;
      const y = clamp(mid * 0.1, -max, max);
      it.img.style.setProperty('--py', y.toFixed(1) + 'px');
      it.img.style.setProperty('--ps', scale.toFixed(4));
    };

    let queued = false;
    const draw = () => {
      queued = false;
      items.forEach((it) => { if (it.on) place(it); });
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const it = items.find((x) => x.box === e.target);
          if (it) { it.on = e.isIntersecting; if (it.on) place(it); }
        });
      }, { rootMargin: '20% 0px' });
      items.forEach((it) => io.observe(it.box));
    } else {
      items.forEach((it) => { it.on = true; });
    }

    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    items.forEach(place);
  }

  /* ── 11-ter. Демо-видео проекта ────────────────────────────── */
  document.querySelectorAll('[data-demo]').forEach((box) => {
    const video = box.querySelector('video');
    if (!video) return;
    /* на узком экране версия полегче — как у героя */
    const src = matchMedia('(max-width: 820px)').matches
      ? box.dataset.srcSm || box.dataset.src
      : box.dataset.src;
    if (!src) return;

    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      video.src = src;
      video.load();
    };
    const play = () => { const p = video.play(); if (p && p.catch) p.catch(() => {}); };

    /* качаем и крутим только пока блок на экране: несколько мегабайт
       не должны уходить тем, кто до этой главы не доскроллил */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) { video.pause(); return; }
        load();
        if (!reduced && !box.classList.contains('is-held')) play();
      }, { threshold: 0.25 }).observe(box);
    } else {
      load();
    }

    /* клик — пауза и обратно; is-held держит затемнение, пока стоит на паузе */
    box.addEventListener('click', () => {
      load();
      if (video.paused) {
        box.classList.remove('is-held');
        play();
      } else {
        video.pause();
        box.classList.add('is-held');
      }
    });
  });

  /* ── 12. Листалка проектов внутри главы ────────────────────── */
  document.querySelectorAll('[data-pager]').forEach((pager) => {
    const slides = [...pager.querySelector('.pager__track').children];
    const box    = pager.closest('.case') || pager.parentElement;
    const prev   = box.querySelector('.case__arrow--prev');
    const next   = box.querySelector('.case__arrow--next');
    const n = slides.length;

    if (n < 2) {                                /* один проект — стрелки не нужны */
      if (prev) prev.remove();
      if (next) next.remove();
      return;
    }

    let index = 0;

    const render = () => {
      slides.forEach((sl, i) => {
        /* кратчайший путь: каждый проект стоит слева, по центру или справа */
        let rel = i - index;
        if (rel >  n / 2) rel -= n;
        if (rel < -n / 2) rel += n;
        const here = rel === 0;
        sl.style.setProperty('--x',  here ? '0' : (rel < 0 ? '-58%' : '58%'));
        sl.style.setProperty('--s',  here ? '1' : '.94');
        sl.style.setProperty('--o',  here ? '1' : '0');
        sl.style.setProperty('--b',  here ? '0px' : '7px');
        sl.style.setProperty('--pe', here ? 'auto' : 'none');
        sl.setAttribute('aria-hidden', here ? 'false' : 'true');
      });
    };
    render();

    /* по кругу в обе стороны */
    const move = (dir) => { index = (index + dir + n) % n; render(); };
    if (prev) prev.addEventListener('click', () => move(-1));
    if (next) next.addEventListener('click', () => move(1));

    /* перетаскивание вбок */
    let x0 = null;
    pager.addEventListener('pointerdown', (e) => { x0 = e.clientX; }, { passive: true });
    pager.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1);
    });
  });

  /* ── 12-bis. Лайтбокс: картинка главы во весь экран ────────── */
  const lb = $('lightbox');
  if (lb) {
    const lbImg   = lb.querySelector('.lb__img');
    const lbCap   = lb.querySelector('.lb__cap');
    const lbPrev  = lb.querySelector('.lb__nav--prev');
    const lbNext  = lb.querySelector('.lb__nav--next');
    const lbClose = lb.querySelector('.lb__close');

    let group = [], at = 0, back = null;

    const show = (i) => {
      at = (i + group.length) % group.length;
      const src = group[at];
      lbImg.src = src.currentSrc || src.src;
      lbImg.alt = src.alt || '';
      lbCap.textContent = src.alt || '';
      /* одна картинка в подборке — листать нечего */
      const many = group.length > 1;
      lbPrev.hidden = !many;
      lbNext.hidden = !many;
    };

    /* страница под лайтбоксом стоит на месте; --sbw возвращает на место
       ширину полосы прокрутки, чтобы вёрстка не дёргалась вбок */
    const lock = (on) => {
      const root = document.documentElement;
      const gap = on ? innerWidth - root.clientWidth : 0;
      root.style.setProperty('--sbw', (gap > 0 ? gap : 0) + 'px');
      root.classList.toggle('is-locked', on);
    };

    const open = (img) => {
      /* листаем внутри того же коллажа */
      const box = img.closest('.combo');
      group = box ? [...box.querySelectorAll('img')] : [img];
      back = document.activeElement;
      show(Math.max(0, group.indexOf(img)));
      lb.hidden = false;
      lock(true);
      void lb.offsetWidth;                       /* запуск перехода из display:none */
      lb.classList.add('is-on');
      lbClose.focus();
    };

    const close = () => {
      if (lb.hidden) return;
      lb.classList.remove('is-on');
      lock(false);
      const done = () => { lb.hidden = true; lbImg.removeAttribute('src'); };
      if (reduced) done(); else setTimeout(done, 340);
      if (back && back.focus) back.focus();
    };

    lbClose.addEventListener('click', close);
    lbPrev.addEventListener('click', () => show(at - 1));
    lbNext.addEventListener('click', () => show(at + 1));
    /* мимо кнопок и самой картинки — значит по подложке: закрываем */
    lb.addEventListener('click', (e) => {
      if (e.target !== lbImg && !e.target.closest('.lb__btn')) close();
    });
    addEventListener('keydown', (e) => {
      if (lb.hidden) return;
      if (e.key === 'Escape')     { close(); }
      if (e.key === 'ArrowLeft')  { show(at - 1); }
      if (e.key === 'ArrowRight') { show(at + 1); }
    });

    /* отзывы читаются мелким шрифтом — их и раскрываем по клику */
    document.querySelectorAll('#work .combo--reviews img').forEach((img) => {
      img.dataset.zoom = '';
      let x0 = 0, y0 = 0;
      img.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; }, { passive: true });
      img.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        /* не после протяжки: это была прокрутка страницы, а не клик */
        if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) return;
        open(img);
      });
    });
  }

  /* ── 12-ter. Стена программ: свет за курсором ─────────────── */
  const soft = document.querySelector('[data-soft]');
  if (soft && !reduced && matchMedia('(hover:hover)').matches) {
    const pills = [...soft.querySelectorAll('.pill')];
    const R = 210;                       /* радиус пятна света */

    /* геометрию плашек держим в кэше: он пересобирается после загрузки
       шрифтов и на ресайзе, иначе свет уезжает от курсора */
    let boxes = [];
    const measure = () => {
      const base = soft.getBoundingClientRect();
      boxes = pills.map((p) => {
        const r = p.getBoundingClientRect();
        return [r.left - base.left, r.top - base.top, r.width, r.height];
      });
    };
    measure();
    addEventListener('resize', measure, { passive: true });
    addEventListener('load', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

    let px = 0, py = 0, queued = false;

    /* яркость каждой плашки считаем по расстоянию до курсора: соседние
       ряды и другие категории гарантированно остаются тёмными */
    const draw = () => {
      queued = false;
      for (let i = 0; i < pills.length; i++) {
        const b = boxes[i];
        if (!b) continue;
        const dx = px - (b[0] + b[2] / 2);
        const dy = py - (b[1] + b[3] / 2);
        const lit = 1 - Math.sqrt(dx * dx + dy * dy) / R;
        const p = pills[i];
        if (lit <= 0) {
          if (p.style.getPropertyValue('--lit') !== '0') p.style.setProperty('--lit', '0');
          continue;
        }
        p.style.setProperty('--lit', lit.toFixed(3));
        p.style.setProperty('--mx', (px - b[0]).toFixed(1) + 'px');
        p.style.setProperty('--my', (py - b[1]).toFixed(1) + 'px');
      }
    };

    /* читаем геометрию в обработчике, пишем стили в кадре — иначе
       каждое движение мыши заставляло бы браузер пересчитывать вёрстку */
    soft.addEventListener('pointermove', (e) => {
      const base = soft.getBoundingClientRect();
      px = e.clientX - base.left;
      py = e.clientY - base.top;
      if (!queued) { queued = true; requestAnimationFrame(draw); }
    }, { passive: true });

    soft.addEventListener('pointerenter', () => soft.classList.add('is-live'));
    soft.addEventListener('pointerleave', () => {
      soft.classList.remove('is-live');
      pills.forEach((p) => p.style.setProperty('--lit', '0'));
    });
  }

  /* ── 13. Появление блоков ──────────────────────────────────── */
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (!e.isIntersecting) return;
        e.target.style.transitionDelay = (i * 80) + 'ms';
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -14% 0px' });
    items.forEach((el) => io.observe(el));

    /* у самого низа страницы «мёртвой зоны» быть не должно */
    const flush = () => {
      if (innerHeight + window.scrollY < document.body.scrollHeight - 4) return;
      items.forEach((el) => { io.unobserve(el); el.classList.add('in'); });
      window.removeEventListener('scroll', flush);
    };
    window.addEventListener('scroll', flush, { passive: true });
  } else {
    items.forEach((el) => el.classList.add('in'));
  }
})();
