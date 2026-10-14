// ==UserScript==
// @name         Seasonvar enchancer
// @namespace    *://seasonvar.ru/*
// @version      1.1.2
// @description  Enchancer for seasonvar.ru
// @author       VOLK_RuS
// @match        *://seasonvar.ru/*
// @updateURL	 https://github.com/VOLKRuS/SeasonvarEnhancer/raw/main/SeasonvarEnhancer.user.js
// @downloadURL  https://github.com/VOLKRuS/SeasonvarEnhancer/raw/main/SeasonvarEnhancer.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ================== НАСТРОЙКИ ==================
    var SEEK_STEP        = 5;     // секунд за один тап
    var TAP_DELAY        = 300;   // мс — окно для второго тапа
    var SEEK_MODE_MS     = 800;   // мс — после перемотки каждый следующий тап сразу мотает
    var DEFAULT_SPEED    = 5;     // 0=0.25, 1=0.5, 2=0.75, 3=1, 4=1.25, 5=1.5, 6=2
    var SAVE_TIME_IN_URL = true;  // писать #rewind=... в адрес при "Отметке на моменте"
    // ================================================

    // --- Фикс бесконечной паузы/плея ---
    // При открытии вкладки с #rewind=... плеер сам перематывает на тайминг,
    // а сайт одновременно предлагает свою автоотметку ("5 серия 05:12").
    // Они дерутся за видео → цикл пауза/плей. Раз позицию уже задаёт #rewind,
    // убираем сайтовую автоотметку (то же, что клик по ней).
    var hasRewind = /^#rewind=/.test(location.hash);
    if (hasRewind) {
        var rewindStart = Date.now();
        var rewindIv = setInterval(function() {
            if (Date.now() - rewindStart > 20000) { clearInterval(rewindIv); return; }
            try {
                if (window.markAuto && typeof window.markAuto.remove === 'function') {
                    window.markAuto.remove();
                    clearInterval(rewindIv);
                    console.log('[Seasonvar enchancer] Есть #rewind — сайтовая автоотметка убрана');
                }
            } catch (e) {}
        }, 300);
    }

    var vid;
    var button;
    var prevvid;
    var lastUserInput = 0;

    function getVideo() {
        var vids = document.getElementsByTagName('video');
        for (var i = 0; i < vids.length; i++) {
            if (vids[i].currentSrc && vids[i].currentSrc.includes('http')) return vids[i];
        }
        return vids[0] || null;
    }

    function getSeries() {
        try { return svfunc.player.getSeries(); } catch (e) { return ''; }
    }

    ['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(function(t) {
        window.addEventListener(t, function() { lastUserInput = Date.now(); }, true);
    });

    // Перемотка тапами работает только для касаний пальцем.
    // Клики мышью (ПК) проходят в плеер без изменений — в том числе на ноутбуках с сенсорным экраном.
    var lastTouch = 0;
    window.addEventListener('touchstart', function() { lastTouch = Date.now(); }, { capture: true, passive: true });
    function fromTouch() { return Date.now() - lastTouch < 1000; }

    // ================== ПЕРЕМОТКА ТАПАМИ ==================
    var pass = false;          // пропустить отложенный клик в плеер
    var tapTimer = null;
    var firstTapSide = 0;
    var pausedBefore = null;
    var seekSide = 0;
    var seekUntil = 0;
    var seekAccum = 0;
    var indicator = null;
    var indicatorTimer = null;

    // -1 — левая треть, 1 — правая треть, 0 — центр, null — не по видео
    function zoneOf(e) {
        var t = e.target;
        if (!t || !(t.tagName === 'VIDEO' || (t.closest && t.closest('pjsdiv')))) return null;
        if (t.closest && t.closest('[data-sve]')) return null; // наши кнопки
        var v = getVideo();
        if (!v) return null;
        var r = v.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        var x = e.clientX, y = e.clientY;
        // не трогаем верхнюю полосу и панель управления снизу
        if (x < r.left || x > r.right || y < r.top + 40 || y > r.bottom - 60) return null;
        var rel = (x - r.left) / r.width;
        if (rel < 0.35) return -1;
        if (rel > 0.65) return 1;
        return 0;
    }

    function block(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    function showIndicator(side, total) {
        var v = getVideo();
        if (!v) return;
        var host = document.fullscreenElement || document.webkitFullscreenElement || document.body;
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.style.cssText =
                'position:fixed;z-index:2147483647;pointer-events:none;' +
                'background:rgba(0,0,0,.55);color:#fff;font:bold 16px sans-serif;' +
                'padding:14px 18px;border-radius:40px;transform:translate(-50%,-50%);' +
                'transition:opacity .25s;white-space:nowrap;';
        }
        if (indicator.parentNode !== host) host.appendChild(indicator);
        var r = v.getBoundingClientRect();
        indicator.style.left = (r.left + r.width * (side < 0 ? 0.18 : 0.82)) + 'px';
        indicator.style.top = (r.top + r.height / 2) + 'px';
        indicator.textContent = side < 0 ? '◀◀ ' + total + ' сек' : total + ' сек ▶▶';
        indicator.style.opacity = '1';
        clearTimeout(indicatorTimer);
        indicatorTimer = setTimeout(function() { indicator.style.opacity = '0'; }, SEEK_MODE_MS);
    }

    function doSeek(side) {
        var v = getVideo();
        if (!v) return;
        var t = v.currentTime + side * SEEK_STEP;
        if (t < 0) t = 0;
        if (v.duration && t > v.duration - 1) t = v.duration - 1;
        v.currentTime = t;
        seekAccum += SEEK_STEP;
        seekUntil = Date.now() + SEEK_MODE_MS;
        showIndicator(side, seekAccum);
    }

    function startSeek(side) {
        var v = getVideo();
        // если плеер всё же успел среагировать на первый тап (пауза/плей) — откатываем
        if (v && pausedBefore !== null && v.paused !== pausedBefore) {
            if (pausedBefore) v.pause(); else { var p = v.play(); if (p && p.catch) p.catch(function(){}); }
        }
        seekSide = side;
        seekAccum = 0;
        doSeek(side);
    }

    window.addEventListener('click', function(e) {
        if (pass || !fromTouch()) return;
        var side = zoneOf(e);
        if (side === null || side === 0) return; // центр — как обычно

        // уже мотаем — каждый следующий тап сразу добавляет ещё 5 сек
        if (Date.now() < seekUntil && side === seekSide) {
            block(e);
            doSeek(side);
            return;
        }

        // второй тап в ту же сторону — начинаем перемотку
        if (tapTimer && firstTapSide === side) {
            clearTimeout(tapTimer);
            tapTimer = null;
            block(e);
            startSeek(side);
            return;
        }

        // первый тап — придерживаем; если второго не будет, отдаём клик плееру
        block(e);
        if (tapTimer) clearTimeout(tapTimer);
        var v = getVideo();
        pausedBefore = v ? v.paused : null;
        firstTapSide = side;
        var target = e.target;
        var init = {
            bubbles: true, cancelable: true, view: window,
            clientX: e.clientX, clientY: e.clientY,
            screenX: e.screenX, screenY: e.screenY
        };
        tapTimer = setTimeout(function() {
            tapTimer = null;
            firstTapSide = 0;
            pass = true;
            try { target.dispatchEvent(new MouseEvent('click', init)); }
            finally { pass = false; }
        }, TAP_DELAY);
    }, true);

    // плеер на двойной клик уходит в полноэкранный режим — по бокам это отключаем
    window.addEventListener('dblclick', function(e) {
        if (!fromTouch()) return;
        var side = zoneOf(e);
        if (side === -1 || side === 1) block(e);
    }, true);

    // ================== ЗАЩИТА ОТ ЦИКЛА ПАУЗА/ПЛЕЙ ==================
    // Если в первую минуту видео само дёргается пауза/плей без участия пользователя —
    // убираем сайтовое предложение продолжить с отметки (то же, что делает клик по нему).
    (function loopGuard() {
        var start = Date.now();
        var flips = [];
        var hooked = [];

        function onFlip() {
            var now = Date.now();
            if (now - start > 60000) return;
            if (now - lastUserInput < 1500) return;
            flips.push(now);
            flips = flips.filter(function(t) { return now - t < 5000; });
            if (flips.length >= 6) {
                flips = [];
                console.log('[Seasonvar enchancer] Обнаружен цикл пауза/плей, сбрасываю автоотметку');
                try {
                    if (window.markAuto && typeof window.markAuto.remove === 'function') window.markAuto.remove();
                } catch (e) {}
            }
        }

        var iv = setInterval(function() {
            if (Date.now() - start > 60000) { clearInterval(iv); return; }
            var v = getVideo();
            if (v && hooked.indexOf(v) === -1) {
                hooked.push(v);
                v.addEventListener('pause', onFlip);
                v.addEventListener('play', onFlip);
            }
        }, 300);
    })();

    // ================== ОСНОВНОЙ ЦИКЛ ==================
    var wasFullscreen = false;

    setInterval(function() {
        var v = getVideo();
        if (v && v.currentSrc && v.currentSrc.includes('http')) vid = v.currentSrc;

        if (prevvid != vid && button) {
            button.href = vid;
            button.innerHTML = 'Скачать ' + getSeries() + ' серию';
            prevvid = vid;
        }

        // поворот экрана — один раз при входе в полноэкранный режим
        var fs = false;
        try { fs = !!(window.player && player.api && player.api('isfullscreen')); } catch (e) {}
        if (fs && !wasFullscreen && screen.orientation && screen.orientation.lock) {
            try {
                var p = screen.orientation.lock('landscape');
                if (p && p.catch) p.catch(function(){});
            } catch (e) {}
        }
        wasFullscreen = fs;
    }, 500);

    // ================== ИНТЕРФЕЙС ==================
    function init() {
        setTimeout(function() {
            console.log('[Seasonvar enchancer] Trying to load script...');

            var ul = document.querySelector('ul.pgs-mark_line');
            if (!ul) return;

            var li = document.createElement('li');
            li.classList.add('pgs-mark_line-set');
            var span = document.createElement('span');
            li.appendChild(span);

            button = document.createElement('a');
            button.innerHTML = 'Скачать ' + getSeries() + ' серию';
            button.href = vid || '#';
            button.target = '_blank';
            button.style.color = 'white';
            button.style.textDecoration = 'none';
            span.appendChild(button);
            ul.appendChild(li);

            try { player.api('speed', DEFAULT_SPEED); } catch (e) {}

            try {
                svfunc.player.swichHDno = function() { svfunc.player.swichHD(); };
            } catch (e) {}

            var g = document.body.querySelectorAll('g[fill-rule="nonzero"]');
            if (g[1]) {
                var bar = g[1].parentElement.parentElement.parentElement;

                var pjs = document.createElement('pjsdiv');
                pjs.dataset.click = 'markSet';
                pjs.dataset.markset = 'settime';
                pjs.dataset.sve = '1';
                pjs.style.position = 'relative';
                pjs.style.cursor = 'pointer';
                pjs.style.pointerEvents = 'all';
                pjs.style.bottom = '7px';
                pjs.style.display = 'inline';
                pjs.style.width = '197px';
                pjs.style.paddingLeft = '27%';

                var ic = document.createElement('i');
                ic.classList.add('svico-mwatch');
                ic.innerText = 'Отметка на моменте';
                ic.style.fontStyle = 'unset';

                pjs.onclick = function() {
                    ic.innerHTML = 'Сохранено';
                    ic.style.color = 'rgb(72 243 41)';
                    setTimeout(function() {
                        ic.innerHTML = 'Отметка на моменте';
                        ic.style.color = '';
                    }, 1500);
                };

                pjs.appendChild(ic);
                bar.appendChild(pjs);
                bar.style.width = '400px';
            }

            // Переопределение отметки (поправлено округление секунд)
            svfunc.markSet = function(a) {
                var t = a.data('markset'), e = '', r = { id: svfunc.idSeason, minute: 0, second: 0 };

                if (!svfunc.userLogin && support.localStorage) {
                    var s = localStorage.getItem('curMC');
                    null == s ? s = 1 : s % 5 == 0 ? (svfunc.svmodal('/?mod=login&nologin5=1'), s = 1) : s++;
                    localStorage.setItem('curMC', s);
                }

                if (68 == mark.trans && ('setseria' == t || 'settime' == t)) t = 'wanttosee';

                if ('wanttosee' == t) { r.seria = -1; e = 'Сериал добавлен в список желаемых'; }
                else if ('watched' == t) { r.seria = -2; e = 'Сериал отмечен как просмотренный'; }
                else if ('notWatched' == t) { r.seria = -3; e = 'Сериал отмечен как не просматриваемый и занесен в черный список'; }
                else {
                    r.seria = svfunc.player.getSeries();
                    r.tran = '' == mark.trans ? 0 : mark.trans;
                    if ('settime' == t) {
                        var o = svfunc.player.getTime();
                        r.minute = Math.floor(o / 60);
                        r.second = Math.max(1, Math.floor(o - 60 * r.minute));
                        if (SAVE_TIME_IN_URL) {
                            // replaceState не вызывает hashchange, плеер не дёргается
                            history.replaceState(null, '', '#rewind=' + r.seria + '_seriya_na_' + r.minute + '_minute_' + r.second + '_sekunde');
                        }
                    }
                    t = 'pauseadd';
                    e = 'Отметка добавлена';
                }

                r[t] = !0;
                $.post('jsonMark.php', r, function(a) {
                    if ('success' == a.msg) {
                        svfunc.markShow(r.seria, r.minute, r.second);
                        svfunc.notify({ txt: e, type: 'msg' });
                        if (!0 !== a.id && void 0 !== a.id && 68 !== mark.trans &&
                            confirm('у вас есть отметка на последней серии предыдущего сезона, удалить ее?')) {
                            $.post('jsonMark.php', { delId: a.id }, function() {}, 'json');
                        }
                    }
                }, 'json');
                markAuto.remove();
            };
        }, 3500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
