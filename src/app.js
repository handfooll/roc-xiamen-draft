(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var api = document.body.getAttribute('data-api');

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
    more.hidden = filtered;
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
      reset: function (dir) {
        form.reset(); form.hidden = false; $('.ok', box).hidden = true; status.hidden = true; started = Date.now();
        $$('.fld', form).forEach(function (f) { f.classList.remove('bad'); });
        var sel = form.direction;
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
      mform.reset(b.getAttribute('data-open'));
      if (typeof modal.showModal === 'function') {
        modal.showModal();
        document.body.classList.add('locked');
        $('input[name=name]', copy).focus();
      } else {
        location.hash = '#contact';
      }
    });
  });
})();
