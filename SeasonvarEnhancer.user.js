// ==UserScript==
// @name         Seasonvar enchancer
// @namespace    *://seasonvar.ru/*
// @version      1.0.7
// @description  Enchancer for seasonvar.ru
// @author       VOLK_RuS
// @match        *://seasonvar.ru/*
// @updateURL	 https://github.com/VOLKRuS/SeasonvarEnhancer/raw/main/SeasonvarEnhancer.user.js
// @downloadURL  https://github.com/VOLKRuS/SeasonvarEnhancer/raw/main/SeasonvarEnhancer.user.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    var vid;
    var button;
    var prevvid;

    var HD = false;

    setInterval(function(){

        var vids = document.getElementsByTagName("video")

        for( var i = 0; i < vids.length; i++ ){
            if(vids.item(i).currentSrc.includes("http"))
            {
                vid = vids.item(i).currentSrc;
            }
        }
        if(prevvid != vid && button)//Детектить была ли кнопка создана заранее
        {
            button.href = vid;
            button.innerHTML = 'Скачать ' + svfunc.player.getSeries() + ' серию';
            prevvid = vid;
        }

        if(player.api("isfullscreen"))
        {
            screen.orientation.lock('landscape');
        }

    }, 500);

    setTimeout(function(){

        var ul = document.querySelector("ul.pgs-mark_line");

        if(ul)
        {

            var li = document.createElement('li');
            li.classList.add("pgs-mark_line-set");

            var span = document.createElement('span');
            li.appendChild(span)

            button = document.createElement('a');
            button.innerHTML = 'Скачать ' + svfunc.player.getSeries() + ' серию';
            button.href = vid;
            button.target = "_blank";
            button.style.color = "white";
            button.style.textDecoration = "none";
            span.appendChild(button);

            ul.appendChild(li);

            //0 = 0.25, 1 = 0.5, 2 = 0.75, 3 = 1, 4 = 1.25, 5 = 1.5, 6 = 2
            player.api("speed", 5);// Дефолтная скорость 1.5

            //Свитч HD (Закомменчено, потому что HD не работает)
            /*svfunc.player.swichHDno = function(){
                svfunc.player.swichHD();
            }*/

            var g = document.body.querySelectorAll('g[fill-rule="nonzero"]');
            var pjs = document.createElement('pjsdiv');

            pjs.dataset.click = "markSet";
            pjs.dataset.markset = "settime";
            pjs.style.position = "relative";
            pjs.style.cursor = "pointer";
            pjs.style.pointerEvents = "all";
            pjs.style.bottom = "7px";

            pjs.style.display = "inline";
            pjs.style.width = "197px";
            pjs.style.paddingLeft = "27%";

            var ic = document.createElement('i');
            ic.classList.add("svico-mwatch");
            ic.innerText = "Отметка на моменте";
            ic.style.fontStyle = "unset";

            pjs.onclick = function() {
                ic.innerHTML = 'Сохранено';
                ic.style.color = "rgb(72 243 41)";
                setTimeout(function(){
                    ic.innerHTML = 'Отметка на моменте';
                    ic.style.color = "";
                }, 1500);
            };

            var btnback = document.createElement('pjsdiv');
            btnback.innerHTML = '◀◀ 5';
            btnback.style.position = "relative";
            btnback.style.top = "-7px";
            btnback.style.paddingLeft = "12px";

            btnback.onclick = function() {
                btnback.style.color = "rgb(255, 221, 31)";
                document.querySelector('video').currentTime -= 5;
                setTimeout(function(){
                    btnback.style.color = "";
                }, 500);
            };

            var btnforw = document.createElement('pjsdiv');
            btnforw.innerHTML = ' ▶▶';
            btnforw.style.position = "relative";
            btnforw.style.top = "-7px";

            btnforw.onclick = function() {
                btnforw.style.color = "rgb(255, 221, 31)";
                document.querySelector('video').currentTime += 5;
                setTimeout(function(){
                    btnforw.style.color = "";
                }, 500);
            };
            //document.querySelector('video').currentTime += 5;

            pjs.appendChild(ic);
            g[1].parentElement.parentElement.parentElement.appendChild(pjs);
            g[1].parentElement.parentElement.parentElement.appendChild(btnback);
            g[1].parentElement.parentElement.parentElement.appendChild(btnforw);

            g[1].parentElement.parentElement.parentElement.style.width = "400px";

        }
        console.log('[Seasonvar enchancer] Trying to load script...');

        //Перемотка видео тапами
        //document.querySelector('video').currentTime -= 5; сделать дабл клик!!

svfunc.markSet=function(a)
{
	var t=a.data("markset"),e="",r=
	{
		id:svfunc.idSeason,minute:0,second:0
	};
	if(!svfunc.userLogin&&support.localStorage)
	{
		var s=localStorage.getItem("curMC");null==s?s=1:s%5==0?(svfunc.svmodal("/?mod=login&nologin5=1"),s=1):s++,localStorage.setItem("curMC",s)
	}
	if(68!=mark.trans||"setseria"!=t&&"settime"!=t||(t="wanttosee"),"wanttosee"==t)
	r.seria=-1,e="Сериал добавлен в список желаемых";
	else if("watched"==t)r.seria=-2,e="Сериал отмечен как просмотренный";
	else if("notWatched"==t)r.seria=-3,e="Сериал отмечен как не просматриваемый и занесен в черный список";
	else
	{
		if(r.seria=svfunc.player.getSeries(),""==mark.trans?r.tran=0:r.tran=mark.trans,"settime"==t)
	{
		var o=svfunc.player.getTime();
		r.minute=Math.floor(o/60),r.second=parseInt(o>1? o-60*r.minute:o-60*r.minute+1  );
        	window.location.hash = "rewind=" + r.seria + "_seriya_na_" + r.minute + "_minute_" + r.second + "_sekunde";
	}
		t="pauseadd",e="Отметка добавлена"
	}
	r[t]=!0,$.post("jsonMark.php",r,function(a)
	{
		"success"==a.msg&&(svfunc.markShow(r.seria,r.minute,r.second),svfunc.notify(
	{txt:e,type:"msg"}),
	!0!==a.id&&void 0!==a.id&&68!==mark.trans&&confirm("у вас есть отметка на последней серии предыдущего сезона, удалить ее?")&&$.post("jsonMark.php",
	{
	delId:a.id
	},function()
	{

	},"json"))
	},"json"),markAuto.remove()
}

    }, 3500);
})();
