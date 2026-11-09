/**
 * Sentimo advertising measurement: consent + Meta Pixel + attribution capture.
 *
 * - Nothing advertising-related loads or is stored until consent is granted.
 *   Opt-in regions (EEA, UK, CH) and unknown locations see a banner. Elsewhere,
 *   measurement is on unless the visitor opts out (or sends Global Privacy Control).
 *   Visitors can change their choice any time from the Privacy Policy page.
 * - Set META_PIXEL_ID below (same value as the server's META_PIXEL_ID env var).
 *   While it is empty this script does nothing.
 * - Google Analytics (existing gtag snippet) is unchanged and not controlled here.
 */
(function () {
  'use strict';

  var META_PIXEL_ID = '1316836297198762';

  var CONSENT_KEY = 'sentimo_consent';
  var ATTR_KEY = 'sentimo_attr';
  var OPT_IN_COUNTRIES = ('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE ' +
    'IS LI NO GB CH').split(' ');

  var consent = 'pending'; // 'pending' | 'granted' | 'denied'
  var queue = [];
  var pixelLoaded = false;

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* storage unavailable */ }
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function newEventId(prefix) {
    var rand = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);
    return (prefix || 'evt') + '_' + rand;
  }

  function cookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  // ---------- Meta Pixel ----------
  function loadPixel() {
    if (!META_PIXEL_ID || pixelLoaded) return;
    pixelLoaded = true;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    // No automatic button-click / microdata events: only the events defined here.
    window.fbq('set', 'autoConfig', false, META_PIXEL_ID);
    window.fbq('init', META_PIXEL_ID);
  }

  function send(name, data, eventId) {
    var options = eventId ? { eventID: eventId } : undefined;
    if (options) window.fbq('track', name, data || {}, options);
    else window.fbq('track', name, data || {});
  }

  function track(name, data, eventId) {
    if (!META_PIXEL_ID) return false;
    if (consent === 'pending') {
      queue.push([name, data, eventId]);
      return false;
    }
    if (consent !== 'granted') return false;
    loadPixel();
    send(name, data, eventId);
    return true;
  }

  // ---------- attribution (first-party, only with consent) ----------
  function captureAttribution() {
    var params = new URLSearchParams(window.location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var hasNew = false;
    var saved = {};
    try { saved = JSON.parse(read(ATTR_KEY) || '{}'); } catch (e) { saved = {}; }
    keys.forEach(function (key) {
      if (params.get(key)) { saved[key] = params.get(key); hasNew = true; }
    });
    if (params.get('ref')) { saved.ref = params.get('ref'); hasNew = true; }
    if (params.get('fbclid')) {
      saved.fbclid = params.get('fbclid');
      saved.fbclid_ts = Date.now();
      hasNew = true;
    }
    if (hasNew || !saved.landing) {
      if (hasNew) saved.landing = window.location.pathname;
      saved.landing = saved.landing || window.location.pathname;
      store(ATTR_KEY, JSON.stringify(saved));
    }
  }

  function attribution() {
    if (consent !== 'granted') return { consent: false };
    var saved = {};
    try { saved = JSON.parse(read(ATTR_KEY) || '{}'); } catch (e) { saved = {}; }
    var fbc = cookie('_fbc');
    if (!fbc && saved.fbclid) fbc = 'fb.1.' + saved.fbclid_ts + '.' + saved.fbclid;
    return {
      consent: true,
      fbp: cookie('_fbp') || undefined,
      fbc: fbc || undefined,
      utm_source: saved.utm_source, utm_medium: saved.utm_medium, utm_campaign: saved.utm_campaign,
      utm_content: saved.utm_content, utm_term: saved.utm_term,
      ref: saved.ref,
      landing: saved.landing,
      src: window.location.origin + window.location.pathname
    };
  }

  // ---------- consent ----------
  function grant() {
    consent = 'granted';
    captureAttribution();
    loadPixel();
    if (META_PIXEL_ID) send('PageView', {}, newEventId('pv'));
    var pending = queue; queue = [];
    pending.forEach(function (item) { track(item[0], item[1], item[2]); });
  }
  function deny() {
    consent = 'denied';
    queue = [];
    store(ATTR_KEY, null);
    if (pixelLoaded) {
      window.fbq('consent', 'revoke');
      // Stop further sending; clear Meta's first-party cookies on this domain.
      ['_fbp', '_fbc'].forEach(function (name) {
        document.cookie = name + '=; Max-Age=0; path=/';
      });
    }
  }

  function choose(value) {
    store(CONSENT_KEY, value);
    var wasGranted = consent === 'granted';
    if (value === 'granted') { if (!wasGranted) grant(); } else deny();
    removeBanner();
  }

  function removeBanner() {
    var el = document.getElementById('sentimo-consent');
    if (el) el.remove();
  }

  function showBanner(forPreferences) {
    if (document.getElementById('sentimo-consent')) return;
    var bar = document.createElement('div');
    bar.id = 'sentimo-consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Advertising measurement preferences');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;' +
      'margin:0 auto;background:#fff;color:#1F2937;border:1px solid #FFE8F0;border-radius:16px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.18);padding:16px 18px;font:14px/1.45 "DM Sans",system-ui,sans-serif;';
    var text = document.createElement('p');
    text.style.cssText = 'margin:0 0 12px';
    text.textContent = 'We use Meta advertising measurement to understand which of our ads lead to orders. ' +
      'It shares limited site activity and, after a purchase, order details with Meta. ';
    var link = document.createElement('a');
    link.href = '/privacy.html#advertising';
    link.textContent = 'Learn more';
    link.style.cssText = 'color:#F53F7B;text-decoration:underline';
    text.appendChild(link);
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
    function button(label, value, primary) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'cursor:pointer;border-radius:999px;padding:8px 18px;font:inherit;font-weight:600;' +
        (primary ? 'background:#F53F7B;color:#fff;border:1px solid #F53F7B' : 'background:#fff;color:#1F2937;border:1px solid #D1D5DB');
      b.addEventListener('click', function () { choose(value); });
      return b;
    }
    row.appendChild(button('Decline', 'denied', false));
    row.appendChild(button('Accept', 'granted', true));
    bar.appendChild(text);
    bar.appendChild(row);
    document.body.appendChild(bar);
    if (forPreferences) row.lastChild.focus();
  }

  function init() {
    if (!META_PIXEL_ID) return;
    var stored = read(CONSENT_KEY);
    if (stored === 'granted') return grant();
    if (stored === 'denied') { consent = 'denied'; return; }
    if (navigator.globalPrivacyControl === true) { consent = 'denied'; return; }

    fetch('/api/geo', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) { return data && data.country; })
      .catch(function () { return null; })
      .then(function (country) {
        if (country && OPT_IN_COUNTRIES.indexOf(country) === -1) {
          grant(); // opt-out region: on by default, changeable on the Privacy page
        } else {
          showBanner(false); // opt-in region or unknown location: wait for a choice
        }
      });
  }

  window.SentimoTrack = {
    track: track,
    newEventId: newEventId,
    attribution: attribution,
    consentState: function () { return consent; },
    openPreferences: function () { showBanner(true); },
    /** Navigate after a short pause so an in-flight pixel request can leave the page. */
    navigate: function (url) {
      if (consent === 'granted' && META_PIXEL_ID) setTimeout(function () { window.location.href = url; }, 200);
      else window.location.href = url;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
