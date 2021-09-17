// ==UserScript==
// @name         Seasonvar enchancer
// @namespace    *://seasonvar.ru/*
// @version      1.0
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
        if(prevvid != vid && button)//Детектить была ли кнопка создана заранее.
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
            pjs.style.left = "185px";
            pjs.style.top = "-7px";
            pjs.style.padding = "7px";
            pjs.style.cursor = "pointer";

            var i = document.createElement('i');
            i.classList.add("svico-mwatch");
            i.innerText = "Отметка на моменте";
            i.style.fontStyle = "unset";

            i.onclick = function() {

                i.innerHTML = 'Сохранено';
                i.style.color = "rgb(72 243 41)";
                setTimeout(function(){
                    i.innerHTML = 'Отметка на моменте';
                    i.style.color = "";
                }, 1500);
    };

            pjs.appendChild(i);
            g[1].parentElement.parentElement.parentElement.appendChild(pjs);
        }
        console.log('[Seasonvar enchancer] Trying to load script...');

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
		r.minute=Math.floor(o/60),r.second=parseInt(o>0? o-60*r.minute:o-60*r.minute+1  );
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
