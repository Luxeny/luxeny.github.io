/* ══════════════════════════════════════════════════════════════
   LUXENY — Яндекс.Метрика
   ══════════════════════════════════════════════════════════════

   Номер счётчика берётся один раз: metrika.yandex.ru → «Добавить
   счётчик» → адрес сайта luxeny.github.io. Впишите его в COUNTER
   ниже. Пока там ноль, файл не делает ничего и в сеть не ходит,
   так что сайт можно спокойно публиковать и без счётчика.

   Домены Метрики уже прописаны в Content-Security-Policy в
   index.html — script-src / img-src / connect-src / frame-src.
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const COUNTER = 0;          /* ← номер счётчика, например 98765432 */

  /* Вебвизор пишет запись сеанса: движение курсора, прокрутку, клики.
     Не нужен — поставьте false, останутся цифры и карта кликов. */
  const WEBVISOR = true;

  if (!COUNTER) return;

  /* Заглушка ym(): вызовы копятся в очереди, пока грузится tag.js,
     поэтому цели можно вешать сразу, не дожидаясь загрузки. */
  window.ym = window.ym || function () {
    (window.ym.a = window.ym.a || []).push(arguments);
  };
  window.ym.l = 1 * new Date();

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.appendChild(tag);

  ym(COUNTER, 'init', {
    clickmap: true,             /* карта кликов: куда жмут на странице */
    trackLinks: true,           /* уходы по внешним ссылкам */
    accurateTrackBounce: true,  /* отказ — меньше 15 секунд, а не «одна страница» */
    webvisor: WEBVISOR
  });

  /* ── Цели ──────────────────────────────────────────────────────
     Каждая — отдельная строка в отчёте «Конверсии». Чтобы они там
     появились, те же идентификаторы надо один раз завести в
     Метрике: Настройка → Цели → JavaScript-событие. */
  const goal = (name) => {
    try { ym(COUNTER, 'reachGoal', name); } catch (_) { /* счётчик не поднялся */ }
  };

  const HITS = [
    ['a[href^="https://t.me/"]', 'telegram'],
    ['a[href^="mailto:"]',       'email'],
    ['.case__dl',                'download'],      /* установщик PNGTube */
    ['.case__link',              'project-site'],  /* переход на сайт проекта */
    ['#heroScroll',              'autoscroll'],    /* кнопка Scroll в герое */
    ['.combo img',               'lightbox'],      /* открыли картинку крупно */
    ['.nav__burger',             'menu']
  ];

  /* Один слушатель на документ вместо десятка на элементах: разметка
     главы меняется на ходу, а делегирование этого не замечает. */
  addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    for (const [sel, name] of HITS) {
      if (t.closest(sel)) { goal(name); return; }
    }
  }, { passive: true, capture: true });

  /* Дочитал до контактов — самый внятный сигнал интереса. */
  const contact = document.getElementById('contact');
  if (contact && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      goal('contacts-seen');
    }, { threshold: 0.4 });
    io.observe(contact);
  }
})();
