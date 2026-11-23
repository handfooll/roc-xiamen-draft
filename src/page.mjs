const escRaw = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// keep short Russian words on the same line as the next word
const glue = s => String(s).replace(/(^|[\s(«])(в|во|и|с|со|к|ко|у|о|об|а|но|до|от|на|по|из|за|без|для|не|при|под|над|через|про)\s/gi, '$1$2\u00a0');
let esc = escRaw;

const skyline = `<svg class="line" viewBox="0 0 420 100" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<path class="draw" stroke="currentColor" stroke-width="1.8" d="M2 90H34V64C20 64 10 58 5 46C26 58 50 56 70 46C90 56 114 58 134 46C129 58 118 64 106 64V90H196V66H206V58H214V66H222V58H230V66H238V90H196M204 58V38H232V58M208 38V30H228V38M212 30L218 8L224 30M240 90H418"/>
<path class="draw accent" stroke-width="1.8" d="M2 96C80 100 150 96 218 96S350 100 418 94"/>
<path class="star" d="M218 -8l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>
</svg>`;

export function page(t, unis, { css, js, api }) {
  esc = t.lang === 'ru' ? s => escRaw(glue(s)) : escRaw;
  const cityName = Object.fromEntries(t.cities);
  const profName = Object.fromEntries(t.profiles);
  const count = k => k === 'all' ? unis.length : unis.filter(u => u.city.includes(k)).length;
  const pcount = k => k === 'all' ? unis.length : unis.filter(u => u.profile === k).length;
  const chip = (group, [k, label], n) =>
    `<button type="button" class="chip" data-${group}="${k}" aria-pressed="${k === 'all'}">${esc(label)} <span>${n}</span></button>`;
  const uniCard = u => {
    const place = u.place || u.city.map(c => cityName[c]).join(', ');
    const dir = t.uni_dir_prefix + (u.short ? `${u.short} (${u.ru})` : u.ru);
    return `<li class="uni" data-city="${u.city.join(' ')}" data-profile="${u.profile || ''}"${u.top ? ' data-top' : ''}>
<h3>${esc(u.ru)}</h3>
<p class="meta">${esc(place)}${u.profile ? ' · ' + esc(profName[u.profile]) : ''}</p>${u.note ? `\n<p class="meta">${esc(u.note)}</p>` : ''}
<button type="button" class="btn ghost sm" data-open="${escRaw(dir)}">${esc(t.uni_cta)}</button>
</li>`;
  };
  const dirOptions = t.programs.map(p => `<option>${escRaw(p.dir)}</option>`).join('');

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escRaw(t.title)}</title>
<meta name="description" content="${escRaw(t.description)}">
<meta name="theme-color" content="#0b2a5b">
<meta property="og:type" content="website">
<meta property="og:title" content="${escRaw(t.title)}">
<meta property="og:description" content="${escRaw(t.description)}">
<meta property="og:image" content="og.png">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${css}">
<script src="${js}" defer></script>
</head>
<body data-api="${esc(api)}">
<a class="skip" href="#main">${t.lang === 'ru' ? 'К содержанию' : '跳到内容'}</a>
<header class="bar">
<div class="wrap bar-in">
<a class="logo" href="#about" aria-label="俄罗斯教育中心 Russian Education Center"><b>俄罗斯教育中心</b><span>Russian Education Center</span></a>
<nav aria-label="${t.lang === 'ru' ? 'Разделы' : '导航'}">${t.nav.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join('')}</nav>
<button type="button" class="btn sm" data-open="">${esc(t.cta_header)}</button>
</div>
</header>

<main id="main">
<section class="hero" id="about">
<div class="wrap">
${skyline}
<h1>${esc(t.hero_h1)}</h1>
<p class="lead">${esc(t.hero_sub)}</p>
<button type="button" class="btn lg" data-open="">${esc(t.hero_cta)}</button>
<ul class="stats">${t.stats.map(([a, b]) => `<li><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join('')}</ul>
</div>
</section>

<section class="sec" id="programs" aria-labelledby="programs-h">
<div class="wrap">
<h2 id="programs-h">${esc(t.programs_h)}</h2>
<div class="programs">
${t.programs.map(p => `<article class="prog" id="p-${p.id}">
<h3>${esc(p.title)}</h3>
<ul>${p.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
<button type="button" class="btn" data-open="${escRaw(p.dir)}">${esc(p.cta)}</button>
</article>`).join('\n')}
</div>
</div>
</section>

<section class="why" id="why" aria-labelledby="why-h">
<div class="wrap">
<h2 id="why-h">${esc(t.why_h)}</h2>
<ul>${t.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
</div>
</section>

<section class="sec" id="universities" aria-labelledby="uni-h">
<div class="wrap">
<h2 id="uni-h">${esc(t.uni_h)}</h2>
<div class="filters">
<div class="chips" role="group" aria-label="${esc(t.city_label)}">${t.cities.map(c => chip('city', c, count(c[0]))).join('')}</div>
<div class="chips" role="group" aria-label="${esc(t.profile_label)}">${t.profiles.map(p => chip('profile', p, pcount(p[0]))).join('')}</div>
</div>
<ul class="unis" id="unis" aria-live="polite">
${unis.map(uniCard).join('\n')}
<li class="more-cell"><button type="button" class="btn ghost" id="uni-more" aria-controls="unis" aria-expanded="false" data-more="${escRaw(t.uni_more)}" data-less="${escRaw(t.uni_less)}">${esc(t.uni_more)}</button></li>
</ul>
<p class="empty" id="uni-empty" hidden>${esc(t.uni_empty)}</p>
</div>
</section>

<section class="sec steps" id="steps" aria-labelledby="steps-h">
<div class="wrap">
<h2 id="steps-h">${esc(t.steps_h)}</h2>
<ol>${t.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
</div>
</section>

<section class="sec contact" id="contact" aria-labelledby="form-h">
<div class="wrap">
<div class="formbox" id="formbox">
<h2 id="form-h">${esc(t.form_h)}</h2>
<p class="fsub">${esc(t.form_sub)}</p>
<form class="lead" novalidate data-err-required="${esc(t.f_required)}" data-err-consent="${esc(t.f_consent_err)}" data-fail="${esc(t.f_fail)}" data-preview="${esc(t.f_preview)}">
<div class="fld"><label for="f-name">${esc(t.f_name)} *</label><input id="f-name" name="name" type="text" autocomplete="name" maxlength="80" required><p class="err"></p></div>
<div class="fld"><label for="f-contact">${esc(t.f_contact)} *</label><input id="f-contact" name="contact" type="text" autocomplete="tel" maxlength="80" required><p class="err"></p></div>
<div class="fld"><label for="f-dir">${esc(t.f_dir)}</label><select id="f-dir" name="direction"><option value="">${esc(t.f_dir_any)}</option>${dirOptions}</select></div>
<div class="hp" aria-hidden="true"><label for="f-web">Website</label><input id="f-web" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<div class="fld"><label class="chk"><input name="consent" type="checkbox" required> <span>${esc(t.f_consent)}</span></label><p class="err"></p></div>
<p class="status" role="status" hidden></p>
<button type="submit" class="btn lg">${esc(t.f_submit)}</button>
</form>
<div class="ok" hidden tabindex="-1"><h3>${esc(t.f_ok_h)}</h3><p>${esc(t.f_ok_p)}</p></div>
</div>
</div>
</section>
</main>

<footer class="foot">
<div class="wrap">
<p class="logo"><b>俄罗斯教育中心</b><span>Russian Education Center</span></p>
<p>${esc(t.company)}</p>
<p>${esc(t.address)}</p>
<p>${esc(t.year)}</p>
</div>
</footer>

<div class="sticky"><button type="button" class="btn lg" data-open="">${esc(t.sticky)}</button></div>

<dialog class="modal" id="modal" aria-labelledby="modal-h">
<button type="button" class="x" id="modal-x" aria-label="${esc(t.close)}">×</button>
<div class="modal-body"></div>
</dialog>
</body>
</html>
`;
}
