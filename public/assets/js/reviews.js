/**
 * /reviews page: star rating, character counters, photo picker (downsized in the browser
 * before upload), submit to /api/submit-review, then reveal the thank-you code.
 * Prefill from review-request email links: /reviews?name=Sarah&email=...&order=00042
 */
(function () {
  'use strict';

  var MAX_PHOTOS = 5;
  // Each photo is re-encoded at these [longest edge px, JPEG quality] steps until it is
  // under TARGET_BYTES, so 5 photos stay well under Vercel's 4.5 MB request limit.
  var ENCODE_STEPS = [[1600, 0.82], [1280, 0.72], [1024, 0.65], [800, 0.6]];
  var TARGET_BYTES = 450000;
  var LABELS = ['', 'Not for me', 'It was okay', 'Pretty good', 'Really like it', 'Love it!'];
  var STAR_PATH = 'M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95L12 2.5z';

  var form = document.getElementById('review-form');
  var starsEl = document.getElementById('stars');
  var ratingLabel = document.getElementById('rating-label');
  var titleEl = document.getElementById('review-title');
  var bodyEl = document.getElementById('review-body');
  var nameEl = document.getElementById('review-name');
  var emailEl = document.getElementById('review-email');
  var orderEl = document.getElementById('review-order');
  var photoInput = document.getElementById('photo-input');
  var dropzone = document.getElementById('dropzone');
  var photoList = document.getElementById('photo-list');
  var photoError = document.getElementById('photo-error');
  var photoSection = document.getElementById('photo-section');
  var nudge = document.getElementById('photo-nudge');
  var formError = document.getElementById('form-error');
  var submitBtn = document.getElementById('submit-btn');

  var rating = 0;
  var photos = []; // { id, blob, url }
  var processing = 0;
  var nudged = false;
  var nextId = 1;

  // ---------- Prefill from the email link ----------
  try {
    var params = new URLSearchParams(location.search);
    if (params.get('name')) nameEl.value = params.get('name').slice(0, 60);
    if (params.get('email')) emailEl.value = params.get('email').slice(0, 254);
    if (params.get('order')) orderEl.value = params.get('order').slice(0, 40);
    var r = parseInt(params.get('rating'), 10);
    if (r >= 1 && r <= 5) rating = r;
  } catch (e) { /* ignore */ }

  // ---------- Stars ----------
  var starButtons = [];
  for (var i = 1; i <= 5; i++) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star-btn p-1';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', i + (i === 1 ? ' star' : ' stars'));
    btn.dataset.value = String(i);
    btn.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH +
      '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    starsEl.appendChild(btn);
    starButtons.push(btn);
  }

  function paintStars(value) {
    starButtons.forEach(function (b, idx) {
      var path = b.querySelector('path');
      var on = idx < value;
      path.setAttribute('fill', on ? '#F53F7B' : 'none');
      path.setAttribute('stroke', on ? '#F53F7B' : '#D1D5DB');
    });
  }

  function setRating(value) {
    rating = value;
    starButtons.forEach(function (b, idx) {
      b.setAttribute('aria-checked', String(idx + 1 === value));
      b.tabIndex = (value ? idx + 1 === value : idx === 0) ? 0 : -1;
    });
    paintStars(value);
    ratingLabel.textContent = LABELS[value] || '';
    ratingLabel.className = 'text-sm font-medium ' + (value ? 'text-primary' : 'text-text-muted-light');
  }

  starsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.star-btn');
    if (b) { setRating(Number(b.dataset.value)); clearFormError(); }
  });
  starsEl.addEventListener('mouseover', function (e) {
    var b = e.target.closest('.star-btn');
    if (b) { paintStars(Number(b.dataset.value)); ratingLabel.textContent = LABELS[b.dataset.value]; }
  });
  starsEl.addEventListener('mouseleave', function () { setRating(rating); });
  starsEl.addEventListener('keydown', function (e) {
    var delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    var v = Math.min(5, Math.max(1, (rating || 0) + delta));
    setRating(v);
    starButtons[v - 1].focus();
  });
  setRating(rating);

  // ---------- Character counters ----------
  function wireCounter(input, counterId) {
    var counter = document.getElementById(counterId);
    var max = Number(input.getAttribute('maxlength'));
    function update() {
      var n = input.value.length;
      counter.textContent = n + ' / ' + max;
      counter.className = 'text-xs tabular-nums ' + (n >= max ? 'text-red-600 font-semibold' : n > max * 0.9 ? 'text-amber-600' : 'text-text-muted-light');
    }
    input.addEventListener('input', update);
    update();
  }
  wireCounter(titleEl, 'title-count');
  wireCounter(bodyEl, 'body-count');

  // ---------- Photos ----------
  function showPhotoError(msg) {
    photoError.textContent = msg;
    photoError.classList.toggle('hidden', !msg);
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  function toJpeg(img, maxDim, quality) {
    var scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // flatten transparent PNGs
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
  }

  // Resizes to a JPEG (this also strips location metadata from phone photos).
  function prepare(file) {
    return loadImage(file).then(function (loaded) {
      function attempt(step) {
        return toJpeg(loaded.img, ENCODE_STEPS[step][0], ENCODE_STEPS[step][1]).then(function (blob) {
          if (blob && blob.size > TARGET_BYTES && step < ENCODE_STEPS.length - 1) return attempt(step + 1);
          return blob;
        });
      }
      return attempt(0).then(function (blob) {
        URL.revokeObjectURL(loaded.url);
        if (!blob) throw new Error('encode');
        return blob;
      });
    });
  }

  function renderPhotos() {
    photoList.innerHTML = '';
    photos.forEach(function (p, idx) {
      var li = document.createElement('li');
      li.className = 'relative aspect-square rounded-lg overflow-hidden bg-gray-100 shadow-card';
      var img = document.createElement('img');
      img.src = p.url;
      img.alt = 'Photo ' + (idx + 1);
      img.className = 'w-full h-full object-cover';
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white text-lg leading-none flex items-center justify-center';
      rm.setAttribute('aria-label', 'Remove photo ' + (idx + 1));
      rm.innerHTML = '&times;';
      rm.addEventListener('click', function () { removePhoto(p.id); });
      li.appendChild(img);
      li.appendChild(rm);
      photoList.appendChild(li);
    });
    for (var n = 0; n < processing; n++) {
      var ph = document.createElement('li');
      ph.className = 'aspect-square rounded-lg bg-white/70 border border-primary/10 flex items-center justify-center text-xs text-text-muted-light animate-pulse';
      ph.textContent = 'Adding…';
      photoList.appendChild(ph);
    }
    var full = photos.length + processing >= MAX_PHOTOS;
    dropzone.classList.toggle('hidden', full);
    if (photos.length) nudge.classList.add('hidden');
  }

  function removePhoto(id) {
    photos = photos.filter(function (p) {
      if (p.id === id) { URL.revokeObjectURL(p.url); return false; }
      return true;
    });
    showPhotoError('');
    renderPhotos();
  }

  function addFiles(fileList) {
    var files = Array.prototype.filter.call(fileList, function (f) { return /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name); });
    if (!files.length) { if (fileList.length) showPhotoError('Please choose image files.'); return; }
    var room = MAX_PHOTOS - photos.length - processing;
    if (files.length > room) showPhotoError('You can add up to ' + MAX_PHOTOS + ' photos, so we kept the first ' + Math.max(room, 0) + '.');
    else showPhotoError('');
    files.slice(0, Math.max(room, 0)).forEach(function (file) {
      processing++;
      prepare(file).then(function (blob) {
        photos.push({ id: nextId++, blob: blob, url: URL.createObjectURL(blob) });
      }).catch(function () {
        showPhotoError('We couldn\'t read "' + file.name + '". Try a JPEG or PNG version of it.');
      }).then(function () {
        processing--;
        renderPhotos();
      });
    });
    renderPhotos();
  }

  photoInput.addEventListener('change', function () { addFiles(photoInput.files); photoInput.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) {
    dropzone.addEventListener(t, function (e) { e.preventDefault(); dropzone.classList.add('is-dragging'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    dropzone.addEventListener(t, function (e) { e.preventDefault(); dropzone.classList.remove('is-dragging'); });
  });
  dropzone.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });

  // ---------- Submit ----------
  function showFormError(msg, focusEl) {
    formError.textContent = msg;
    formError.classList.remove('hidden');
    if (focusEl) {
      focusEl.focus();
      focusEl.classList.remove('shake');
      void focusEl.offsetWidth;
      focusEl.classList.add('shake');
    }
  }
  function clearFormError() { formError.classList.add('hidden'); formError.textContent = ''; }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function validate() {
    if (!rating) { showFormError('Please choose a star rating.', starsEl); return false; }
    if (!titleEl.value.trim()) { showFormError('Please add a title for your review.', titleEl); return false; }
    if (!bodyEl.value.trim()) { showFormError('Please tell us a little about your experience.', bodyEl); return false; }
    if (!nameEl.value.trim()) { showFormError('Please add the name to show with your review.', nameEl); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) { showFormError('Please enter a valid email address.', emailEl); return false; }
    if (processing) { showFormError('Hang on, your photos are still being added.'); return false; }
    return true;
  }

  function submit() {
    clearFormError();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    Promise.all(photos.map(function (p) { return blobToBase64(p.blob); }))
      .then(function (encoded) {
        return fetch('/api/submit-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating: rating,
            title: titleEl.value.trim(),
            body: bodyEl.value.trim(),
            name: nameEl.value.trim(),
            email: emailEl.value.trim(),
            order_number: orderEl.value.trim(),
            website: document.getElementById('review-website').value,
            photos: encoded.map(function (data) { return { type: 'image/jpeg', data: data }; }),
          }),
        });
      })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || (res.status === 413 ? 'Your photos are too large together. Try removing one.' : 'Something went wrong. Please try again.'));
          return data;
        });
      })
      .then(function (data) {
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'review_submitted', { rating: rating, photo_count: photos.length });
        }
        showThanks(data.promo);
      })
      .catch(function (err) {
        var msg = err && err.message && !/fetch|network/i.test(err.message) ? err.message : 'We couldn\'t reach our server. Check your connection and try again.';
        showFormError(msg);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit review';
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearFormError();
    if (!validate()) return;
    if (!photos.length && !nudged) {
      nudged = true;
      nudge.classList.remove('hidden');
      nudge.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    submit();
  });
  document.getElementById('nudge-add').addEventListener('click', function () {
    nudge.classList.add('hidden');
    photoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    photoInput.click();
  });
  document.getElementById('nudge-skip').addEventListener('click', function () {
    nudge.classList.add('hidden');
    submit();
  });

  // ---------- Thank-you view ----------
  function showThanks(promo) {
    document.getElementById('review-form-view').classList.add('hidden');
    var view = document.getElementById('review-thanks-view');
    var codeEl = document.getElementById('promo-code');
    if (promo && promo.code) {
      codeEl.textContent = promo.code;
      document.getElementById('promo-percent').textContent = promo.percent_off;
      document.getElementById('promo-expiry').textContent = promo.expires_label;
    } else {
      // Should not happen; the API always returns the code for a saved review.
      codeEl.parentElement.parentElement.innerHTML = '<p class="text-text-muted-light">Your review was received. Email <a class="text-primary hover:underline" href="mailto:support@sentimonotes.com">support@sentimonotes.com</a> for your thank-you code.</p>';
    }
    view.classList.remove('hidden');
    window.scrollTo(0, 0);
    view.focus();
  }

  document.getElementById('copy-code').addEventListener('click', function () {
    var code = document.getElementById('promo-code').textContent;
    var label = document.getElementById('copy-label');
    function done() { label.textContent = 'Copied!'; setTimeout(function () { label.textContent = 'Copy code'; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, function () { selectCode(); });
    } else {
      selectCode();
    }
  });
  function selectCode() {
    var range = document.createRange();
    range.selectNodeContents(document.getElementById('promo-code'));
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
})();
