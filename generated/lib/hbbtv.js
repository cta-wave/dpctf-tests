(function () {

    function setKeyset(mask) {
        try {
            var app = document.getElementById('appmgr').getOwnerApplication(document);
            app.privateData.keyset.setValue(mask);
        } catch (e) { }
    }

    function initApp() {
        try {
            var app = document.getElementById('appmgr').getOwnerApplication(document);
            app.show();
        } catch (e) { }
        setKeyset(0x1 + 0x2 + 0x4 + 0x8 + 0x10);
    }

    function activate() {
        // active only on hbbtv terminals
        if (navigator.userAgent.toLowerCase().indexOf('hbbtv') === -1) {
            return;
        }
        // create hbbtv objects and add to body
        var appmgroipfcfg = '<object id="appmgr" type="application/oipfApplicationManager" style="position: absolute; left: 0px; top: 0px; width: 0px; height: 0px;">';

        var elem = document.createElement("div");
        elem.innerHTML = appmgroipfcfg;
        document.body.appendChild(elem);

        setTimeout(initApp, 1000);
    }

    setTimeout(activate, 1000);
})();


function stopBroadcastOnHbbTV() {
    return new Promise(function (resolve) {
        // stop broadcast only on hbbtv terminals
        if (navigator.userAgent.toLowerCase().indexOf('hbbtv') === -1) {
            resolve();
        }

        // create hbbtv objects and add to body
        var broadcastTag = '<object id="broadcast-object" type="video/broadcast" style="position: absolute; left: 0px; top: 0px; width: 1280px; height: 720px;">';

        var elem = document.createElement("div");
        elem.innerHTML = broadcastTag;
	    elem.style = "visibility:hidden;width:0px;height:0px;"
        document.body.appendChild(elem);
        var broadcastObj = document.getElementById("broadcast-object");

        // already stopped?
        if (broadcastObj.playState === 3) {
            return resolve();
        }

        var stopBroadcastTimeout = setTimeout(function () {
            resolve("error on stopping broadcast: timeout");
        }, 10000);

        broadcastObj.onPlayStateChange = function (state, error) {
            if (error !== undefined) {
                return resolve("error on stopping broadcast: error number " + error);
            }
            switch (state) {
                case 0: // Uninitialized
                    break;
                case 1: // Connecting
                case 2: // Presenting
                    broadcastObj.stop();
                    break;
                case 3: // Stopped
                    broadcastObj.onPlayStateChange = function(){};
                    clearTimeout(stopBroadcastTimeout);
                    resolve();
                    break;
                default:
                    break;
            }
        }

        try {
            broadcastObj.bindToCurrentChannel();
        } catch (err) {
            return resolve("error on stopping broadcast:" + err);
        }
    });
}
