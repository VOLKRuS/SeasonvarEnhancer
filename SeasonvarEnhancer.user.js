// ==UserScript==
// @name         Seasonvar enchancer
// @namespace    *://seasonvar.ru/*
// @version      1.2.1
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
    var BLOCK_AUTOPLAY   = true;  // не запускать видео само при загрузке страницы
    var NO_AUTOMUTE      = true;  // не давать плееру выключать звук при загрузке
    var MOBILE_CONTROLS_SCALE = 1.5; // увеличение панели управления на телефоне (1 — как есть)
    // ================================================

    // ================== БЕЗ АВТОПЛЕЯ И АВТОМУТА ==================
    // До первого касания/клика по плееру (или нажатия клавиши) видео не запускается само,
    // а звук не выключается. После первого действия пользователя всё работает как обычно,
    // в том числе автопереход на следующую серию.
    var pageStart = Date.now();
    var playerTouched = false;

    function inPlayer(t) {
        return !!(t && (t.tagName === 'VIDEO' || (t.closest && t.closest('pjsdiv'))));
    }

    function guardActive() {
        return !playerTouched && Date.now() - pageStart < 60000;
    }

    function unmute(v) {
        if (!NO_AUTOMUTE) return;
        try { if (v && v.muted) v.muted = false; } catch (e) {}
        try { if (window.player && player.api) player.api('unmute'); } catch (e) {}
    }

    function onFirstPlayerInput(e) {
        if (playerTouched) return;
        if (e.type !== 'keydown' && !inPlayer(e.target)) return;
        playerTouched = true;
        // жест пользователя — браузер разрешит включить звук
        var vids = document.getElementsByTagName('video');
        for (var i = 0; i < vids.length; i++) unmute(vids[i]);
    }
    ['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(function(t) {
        window.addEventListener(t, onFirstPlayerInput, { capture: true, passive: true });
    });

    // media-события не всплывают, но ловятся на document в фазе захвата
    document.addEventListener('play', function(e) {
        if (!BLOCK_AUTOPLAY || !guardActive() || e.target.tagName !== 'VIDEO') return;
        e.target.pause();
        try { if (window.player && player.api) player.api('pause'); } catch (err) {}
        unmute(e.target); // на паузе браузер позволяет включить звук
        console.log('[Seasonvar enchancer] Автоплей остановлен');
    }, true);

    document.addEventListener('volumechange', function(e) {
        if (!NO_AUTOMUTE || !guardActive() || e.target.tagName !== 'VIDEO') return;
        if (e.target.muted) unmute(e.target);
    }, true);

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

    // ================== ПЕРЕМОТКА ТАПАМИ (только касания пальцем) ==================
    // Первый тап проходит в плеер как обычно (показ панели и т.п.).
    // Второй и последующие тапы по краю видео перехватываются целиком —
    // плеер их не видит, поэтому не срабатывает его двойной тап → полноэкранный режим.
    // Мышь (ПК) не затрагивается: смотрим только pointerType === 'touch' и touch-события.
    var lastTapEnd = 0;       // когда закончился предыдущий обычный тап
    var lastTapSide = 0;
    var pausedBefore = null;  // состояние паузы до первого тапа
    var seekSide = 0;
    var seekUntil = 0;
    var seekAccum = 0;
    var gesture = null;       // { blocked, side, x, y, t }
    var blockUntil = 0;       // глушим хвостовые mouse/click события перехваченного тапа
    var indicator = null;
    var indicatorTimer = null;

    // -1 — левая часть, 1 — правая, 0 — центр, null — не по видео
    function zoneAt(target, x, y) {
        var t = target;
        if (!t || !(t.tagName === 'VIDEO' || (t.closest && t.closest('pjsdiv')))) return null;
        if (t.closest && t.closest('[data-sve]')) return null; // наши кнопки
        var v = getVideo();
        if (!v) return null;
        var r = v.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        // не трогаем верхнюю полосу и панель управления снизу
        if (x < r.left || x > r.right || y < r.top + 40 || y > r.bottom - (IS_MOBILE ? 60 * MOBILE_CONTROLS_SCALE : 60)) return null;
        var rel = (x - r.left) / r.width;
        if (rel < 0.35) return -1;
        if (rel > 0.65) return 1;
        return 0;
    }

    function block(e) {
        if (e.cancelable) e.preventDefault();
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

    function setPaused(v, paused) {
        if (paused) v.pause();
        else { var p = v.play(); if (p && p.catch) p.catch(function(){}); }
    }

    // Плеер мог поставить паузу на первый тап (сразу или с задержкой) — откатываем.
    function restorePauseState() {
        var v = getVideo();
        if (!v || pausedBefore === null) return;
        var want = pausedBefore;
        var until = Date.now() + 800;
        function fix() {
            if (Date.now() > until) {
                v.removeEventListener('pause', fix);
                v.removeEventListener('play', fix);
                return;
            }
            if (v.paused !== want) setPaused(v, want);
        }
        v.addEventListener('pause', fix);
        v.addEventListener('play', fix);
        setTimeout(fix, 0);
        setTimeout(function() {
            v.removeEventListener('pause', fix);
            v.removeEventListener('play', fix);
        }, 800);
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

    // Решаем в начале касания: обычный тап или перемотка
    function beginGesture(target, x, y) {
        var now = Date.now();
        var side = zoneAt(target, x, y);
        var blocked = false;
        if (side === -1 || side === 1) {
            if (now < seekUntil && side === seekSide) blocked = true;                 // уже мотаем
            else if (now - lastTapEnd < TAP_DELAY && side === lastTapSide) blocked = true; // второй тап
        }
        if (!blocked) {
            var v = getVideo();
            pausedBefore = v ? v.paused : null;
        }
        gesture = { blocked: blocked, side: side, x: x, y: y, t: now };
        if (blocked) blockUntil = now + 700;
    }

    function endGesture(x, y) {
        var g = gesture;
        gesture = null;
        if (!g) return;
        var now = Date.now();
        var moved = Math.abs(x - g.x) > 25 || Math.abs(y - g.y) > 25;
        if (g.blocked) {
            blockUntil = now + 700;
            if (moved) return;
            if (now < seekUntil && g.side === seekSide) {
                doSeek(g.side);
            } else {
                seekSide = g.side;
                seekAccum = 0;
                restorePauseState();
                doSeek(g.side);
            }
            lastTapEnd = 0;
        } else {
            if (!moved && now - g.t < 400 && (g.side === -1 || g.side === 1)) {
                lastTapEnd = now;
                lastTapSide = g.side;
            } else {
                lastTapEnd = 0;
            }
        }
    }

    var opt = { capture: true, passive: false };

    // pointer-события приходят раньше touch — решение принимаем на первом из них
    window.addEventListener('pointerdown', function(e) {
        if (e.pointerType !== 'touch' || !e.isPrimary) return;
        beginGesture(e.target, e.clientX, e.clientY);
        if (gesture.blocked) block(e);
    }, opt);

    window.addEventListener('touchstart', function(e) {
        if (e.touches.length > 1) { gesture = null; return; }
        var tc = e.changedTouches[0];
        if (!gesture || Date.now() - gesture.t > 300) beginGesture(e.target, tc.clientX, tc.clientY);
        if (gesture && gesture.blocked) block(e);
    }, opt);

    ['pointermove', 'touchmove'].forEach(function(type) {
        window.addEventListener(type, function(e) {
            if (type === 'pointermove' && e.pointerType !== 'touch') return;
            if (gesture && gesture.blocked) block(e);
        }, opt);
    });

    window.addEventListener('pointerup', function(e) {
        if (e.pointerType !== 'touch' || !e.isPrimary) return;
        if (gesture && gesture.blocked) block(e);
    }, opt);

    window.addEventListener('touchend', function(e) {
        var tc = e.changedTouches[0];
        var wasBlocked = gesture && gesture.blocked;
        endGesture(tc.clientX, tc.clientY);
        if (wasBlocked) block(e); // preventDefault здесь отменяет эмуляцию mouse/click
    }, opt);

    window.addEventListener('touchcancel', function() { gesture = null; }, opt);

    // хвосты перехваченного тапа (на случай, если браузер всё равно их пришлёт)
    ['pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach(function(type) {
        window.addEventListener(type, function(e) {
            if (type === 'pointercancel' && e.pointerType !== 'touch') return;
            // мышь на ПК сюда не попадает: blockUntil ставится только после касания пальцем
            if (Date.now() < blockUntil && zoneAt(e.target, e.clientX, e.clientY) !== null) block(e);
        }, opt);
    });

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

    // ================== КРУПНЫЕ КНОПКИ НА ТЕЛЕФОНЕ ==================
    // Кнопки плеера — блоки с точкой привязки (left/top) в центре иконки.
    // Левую группу увеличиваем от левого нижнего угла, правую — от правого,
    // поэтому кнопки растут, не наезжая друг на друга. Полоса перемотки
    // становится толще и поднимается над кнопками, по ширине не меняется.
    var IS_MOBILE = window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches;

    function setTf(el, tf, origin) {
        if (el.style.transform !== tf) el.style.transform = tf;
        if (origin && el.style.transformOrigin !== origin) el.style.transformOrigin = origin;
    }

    function scaleControls() {
        var S = MOBILE_CONTROLS_SCALE;
        if (!IS_MOBILE || S === 1) return;
        var v = getVideo();
        if (!v) return;
        var frame = v.parentElement && v.parentElement.parentElement; // #oframe...
        if (!frame || frame.tagName !== 'PJSDIV') return;
        var W = frame.offsetWidth, H = frame.offsetHeight;
        if (!W || !H) return;
        var zone = 70; // нижняя полоса, где живут кнопки и перемотка

        for (var i = 0; i < frame.children.length; i++) {
            var el = frame.children[i];
            if (el.tagName !== 'PJSDIV' || el.contains(v)) continue;
            var st = el.style;

            // фон панели (на всю ширину, прижат к низу)
            if (st.bottom === '0px' && st.width === '100%' && parseFloat(st.height) < 80) {
                setTf(el, 'scaleY(' + S + ')', 'center bottom');
                continue;
            }

            var ax = parseFloat(st.left), ay = parseFloat(st.top);
            if (isNaN(ax) || isNaN(ay) || ay < H - zone || ay > H) continue;
            var dy = (S - 1) * (ay - H);

            var first = el.firstElementChild;
            var isTimeline = first && parseFloat(first.style.width) > W * 0.5;

            if (isTimeline) {
                // поднимаем и утолщаем, ширину и положение по X не трогаем
                setTf(el, 'translate(0px,' + dy + 'px)', '0px 0px');
                for (var j = 0; j < el.children.length; j++) {
                    var c = el.children[j];
                    if (c.querySelector('svg')) setTf(c, 'scale(' + S + ')');          // бегунок
                    else if (c.style.bottom) setTf(c, 'scaleY(' + S + ')', 'center bottom'); // полоса
                    else if (c.style.opacity === '0' && c.style.pointerEvents === 'auto')
                        setTf(c, 'scaleY(' + S + ')');                                 // зона касания
                }
                continue;
            }

            var ox = ax < W / 2 ? 0 : W;
            var dx = (S - 1) * (ax - ox);
            setTf(el, 'translate(' + dx + 'px,' + dy + 'px) scale(' + S + ')', '0px 0px'); // от точки привязки
        }
    }
    setInterval(scaleControls, 300);

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
