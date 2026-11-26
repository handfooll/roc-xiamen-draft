(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var api = document.body.getAttribute('data-api');
  if (/MicroMessenger/i.test(navigator.userAgent)) document.documentElement.classList.add('wx');
  var touch = matchMedia('(pointer: coarse)').matches;

  /* university filters */
  var list = $('#unis'), more = $('#uni-more'), empty = $('#uni-empty');
  var state = { city: 'all', profile: 'all' };
  function applyFilter() {
    var filtered = state.city !== 'all' || state.profile !== 'all';
    var shown = 0;
    $$('.uni', list).forEach(function (li) {
      var ok = (state.city === 'all' || li.getAttribute('data-city').split(' ').indexOf(state.city) >= 0) &&
               (state.profile === 'all' || li.getAttribute('data-profile') === state.profile);
      li.classList.toggle('off', !ok);
      if (ok) shown++;
    });
    if (filtered) list.classList.add('all');
    else list.classList.toggle('all', more.getAttribute('aria-expanded') === 'true');
    more.parentNode.hidden = filtered;
    list.classList.remove('swap'); void list.offsetWidth; list.classList.add('swap');
    empty.hidden = shown > 0;
  }
  ['city', 'profile'].forEach(function (group) {
    $$('[data-' + group + ']').forEach(function (b) {
      if (b.classList.contains('uni')) return;
      b.addEventListener('click', function () {
        state[group] = b.getAttribute('data-' + group);
        $$('.chip[data-' + group + ']').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        applyFilter();
      });
    });
  });
  more.addEventListener('click', function () {
    var open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', String(open));
    more.textContent = more.getAttribute(open ? 'data-less' : 'data-more');
    applyFilter();
    if (!open) $('#universities').scrollIntoView();
  });

  /* "Как поступить" / "Как мы работаем" tabs; without script both lists simply show */
  var tabs = $$('[role=tab]');
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab, panel = document.getElementById(t.getAttribute('aria-controls'));
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
      if (on) $$('.pre', panel).forEach(function (el) { el.classList.remove('pre'); });
    });
    if (focus) tab.focus();
  }
  if (tabs.length) {
    $('.tabs').hidden = false;
    document.documentElement.classList.add('has-tabs');
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { selectTab(t); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, n = tabs.length, j = k === 'ArrowRight' ? (i + 1) % n : k === 'ArrowLeft' ? (i + n - 1) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
        if (j < 0) return;
        e.preventDefault();
        selectTab(tabs[j], true);
      });
    });
    selectTab(tabs[0]);
    // the menu item "Как поступить" always opens the first tab
    $$('a[href="#admission"]').forEach(function (a) { a.addEventListener('click', function () { selectTab(tabs[0]); }); });
  }

  /* entrance for blocks below the first screen; content stays visible without script or observer */
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.remove('pre');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.sec h2, .why h2, .prog, .why li, .filters, .steps li, .formbox').forEach(function (el) {
      if (el.closest('.modal') || el.getBoundingClientRect().top < innerHeight) return;
      var sib = el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
      el.style.setProperty('--i', Math.min(sib, 5));
      el.classList.add('pre', 'rise');
      io.observe(el);
    });
  }

  /* lead forms */
  function bind(box) {
    var form = $('form', box), status = $('.status', form), btn = $('[type=submit]', form);
    var started = Date.now();
    function check() {
      var first = null;
      $$('.fld', form).forEach(function (f) {
        var i = $('input[required]', f);
        if (!i) return;
        var bad = i.type === 'checkbox' ? !i.checked : !i.value.trim();
        f.classList.toggle('bad', bad);
        $('.err', f).textContent = bad ? form.getAttribute(i.type === 'checkbox' ? 'data-err-consent' : 'data-err-required') : '';
        if (bad) { i.setAttribute('aria-invalid', 'true'); first = first || i; } else i.removeAttribute('aria-invalid');
      });
      if (first) first.focus();
      return !first;
    }
    $$('input,select', form).forEach(function (i) {
      i.addEventListener('input', function () { var f = i.closest('.fld'); if (f) f.classList.remove('bad'); i.removeAttribute('aria-invalid'); });
    });
    function done() {
      form.hidden = true;
      var ok = $('.ok', box); ok.hidden = false; ok.focus();
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.hidden = true;
      if (!check()) return;
      if (!api) { status.textContent = form.getAttribute('data-preview'); status.hidden = false; return; }
      btn.disabled = true;
      var data = {
        name: form.name.value.trim(), contact: form.contact.value.trim(),
        direction: form.direction.value, consent: form.consent.checked,
        website: form.website.value, elapsed: Date.now() - started, page: document.documentElement.lang
      };
      fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); done(); })
        .catch(function () { status.textContent = form.getAttribute('data-fail'); status.hidden = false; })
        .then(function () { btn.disabled = false; });
    });
    return {
      reset: function (dir, label) {
        form.reset(); form.hidden = false; $('.ok', box).hidden = true; status.hidden = true; started = Date.now();
        $$('.fld', form).forEach(function (f) { f.classList.remove('bad'); });
        var sel = form.direction, picked = $('.picked', box);
        if (picked) picked.textContent = dir ? (dir.indexOf(':') > 0 && dir.indexOf(':') < 6 ? dir : form.getAttribute('data-picked') + dir) : '';
        sel.closest('.fld').hidden = !!dir; // the chip above already shows the choice
        var lab = $('label[data-default]', form);
        lab.textContent = (label || lab.getAttribute('data-default')) + ' *';
        form.contact.setAttribute('autocomplete', label ? 'email' : 'tel');
        if (dir) {
          var has = $$('option', sel).some(function (o) { return o.value === dir || o.text === dir; });
          if (!has) { var o = document.createElement('option'); o.text = dir; o.setAttribute('data-added', ''); sel.add(o); }
          sel.value = dir;
        }
      }
    };
  }
  bind($('#formbox'));

  /* modal: a copy of the page form with its own ids */
  var modal = $('#modal'), body = $('.modal-body', modal);
  var copy = $('#formbox').cloneNode(true);
  copy.removeAttribute('id');
  [copy].concat($$('.pre', copy)).forEach(function (el) { el.classList.remove('pre', 'rise'); });
  $$('[id]', copy).forEach(function (el) { el.id = 'm-' + el.id; });
  $$('[for]', copy).forEach(function (el) { el.htmlFor = 'm-' + el.htmlFor; });
  $('h2', copy).id = 'modal-h';
  body.appendChild(copy);
  var mform = bind(copy);
  var opener = null;
  function close() { if (modal.open) modal.close(); }
  modal.addEventListener('close', function () {
    document.body.classList.remove('locked');
    $$('option[data-added]', copy).forEach(function (o) { o.remove(); });
    if (opener) opener.focus();
  });
  $('#modal-x').addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  $$('[data-open]').forEach(function (b) {
    b.addEventListener('click', function () {
      opener = b;
      mform.reset(b.getAttribute('data-open'), b.getAttribute('data-label'));
      if (typeof modal.showModal === 'function') {
        modal.showModal();
        document.body.classList.add('locked');
        // on phones don't pop the keyboard up straight away
        if (!touch) $('input[name=name]', copy).focus();
      } else {
        location.hash = '#contact';
      }
    });
  });
})();
