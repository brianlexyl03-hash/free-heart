// Tells the server what this browser can decode (Jellyfin calls this a device profile).
(function () {
  try {
    var v = document.createElement('video');
    function ok(t) { try { return !!(window.MediaSource && MediaSource.isTypeSupported && MediaSource.isTypeSupported(t)) || /probably|maybe/.test(v.canPlayType(t)); } catch (e) { return false; } }
    var c = [];
    if (ok('video/mp4; codecs="hvc1.1.6.L120.B0"')) c.push('hevc');
    if (ok('video/mp4; codecs="hvc1.2.4.L153.B0"')) c.push('hevc10');
    if (ok('video/mp4; codecs="av01.0.08M.08"')) c.push('av1');
    if (ok('video/mp4; codecs="vp09.00.40.08"')) c.push('vp9');
    if (ok('audio/mp4; codecs="ac-3"')) c.push('ac3');
    if (ok('audio/mp4; codecs="ec-3"')) c.push('eac3');
    document.cookie = 'fh_caps=' + c.join('.') + '; path=/; max-age=2592000; SameSite=Lax';
  } catch (e) { /* ignore */ }
})();
