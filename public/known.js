/**
 * 외운 단어 기록
 * -------------------------------------------------------------
 * 브라우저에만 저장됩니다. 서버로 아무것도 보내지 않아요.
 * 그래서 기기를 바꾸거나 브라우저 기록을 지우면 초기화됩니다.
 *
 * 카드 페이지와 단어장이 같은 창고를 쓰므로,
 * 카드에서 "외웠어요" 를 누르면 단어장의 외운 목록에도 바로 반영돼요.
 */
(function () {
  var KEY = 'kkamukdang-known';

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      // 저장을 막아둔 브라우저(시크릿 모드 등)에서도 페이지는 정상 동작해야 합니다.
      return {};
    }
  }

  function write(map) {
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
    } catch (e) {}
  }

  window.KkKnown = {
    /** 외운 단어 키 목록 */
    all: function () {
      return Object.keys(read());
    },
    has: function (key) {
      return Object.prototype.hasOwnProperty.call(read(), key);
    },
    add: function (key) {
      var m = read();
      m[key] = Date.now();   // 언제 외웠는지도 남겨둡니다
      write(m);
    },
    remove: function (key) {
      var m = read();
      delete m[key];
      write(m);
    },
    count: function () {
      return Object.keys(read()).length;
    },
    clear: function () {
      write({});
    },
  };
})();
