/**
 * 까먹당 기록 저장소
 * -------------------------------------------------------------
 * 개발지시서 §3 · §4 를 그대로 옮긴 것입니다.
 *
 *   kkmd:expr:{표현ID}  → { state, streak, nextDue, lastSeen, graduated }
 *   kkmd:stamps:s{n}    → { episodes: [1,2,3], completed, completedAt }
 *   kkmd:counter        → { reunions, graduated }
 *   kkmd:ui             → { ctaClosed, episodesRead }
 *
 * 원칙 세 가지
 *   · 날짜는 "YYYY-MM-DD" 문자열로만. 타임존 계산을 하지 않습니다
 *   · 모든 접근을 try/catch 로 감쌉니다. 저장이 막혀도 페이지는 살아 있어야 해요
 *   · 이미 있는 항목의 일정을 다시 쓰지 않습니다 (재열람으로 리셋되면 안 됨)
 */
(function () {
  var PREFIX = 'kkmd:';

  /* ---------- 날짜 ---------- */

  /** 오늘 (사용자 기기의 자정 기준) */
  function today() {
    return ymd(new Date());
  }

  function ymd(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /** 오늘부터 n일 뒤 */
  function plusDays(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  /** a 가 b 보다 이르거나 같은가 (문자열 비교로 충분합니다) */
  function onOrBefore(a, b) {
    return String(a) <= String(b);
  }

  /* ---------- 저장소 ---------- */

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      // 시크릿 모드·저장 차단 환경. 기록 없이 열람만 가능한 상태로 둡니다.
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function keys() {
    try {
      var out = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  /* ---------- 표현 ---------- */

  function getExpr(id) {
    return read('expr:' + id, null);
  }

  function setExpr(id, data) {
    return write('expr:' + id, data);
  }

  /** 큐에 있는 표현 전부 */
  function allExpr() {
    var out = [];
    keys().forEach(function (k) {
      if (k.indexOf('expr:') !== 0) return;
      var v = read(k, null);
      if (v) out.push({ id: k.slice(5), data: v });
    });
    return out;
  }

  /**
   * 처음 만나는 표현만 큐에 넣습니다.
   * 이미 있으면 손대지 않아요 — 다시 읽었다고 일정이 밀리면 안 되니까요.
   */
  function register(id, days) {
    if (getExpr(id)) return false;
    setExpr(id, {
      state: 'new',
      streak: 0,
      nextDue: plusDays(days == null ? 3 : days),
      lastSeen: null,
      graduated: false,
    });
    return true;
  }

  /**
   * 「자신 없어요」 — 간격을 줄이기만 합니다.
   * 아직 큐에 없으면 지금 넣고 바로 내일로 잡습니다.
   * 이미 내일 이내로 잡혀 있으면 그대로 둡니다. 미루는 조작은 없습니다.
   */
  function accelerate(id) {
    var e = getExpr(id);
    var tomorrow = plusDays(1);
    if (!e) {
      setExpr(id, {
        state: 'new', streak: 0, nextDue: tomorrow, lastSeen: null, graduated: false,
      });
      return true;
    }
    if (e.graduated) return false;
    if (onOrBefore(e.nextDue, tomorrow)) return false;  // 이미 더 이르면 그대로
    e.nextDue = tomorrow;
    setExpr(id, e);
    return true;
  }

  /* ---------- 도장 ---------- */

  function getStamps(season) {
    return read('stamps:s' + season, { episodes: [], completed: false, completedAt: null });
  }

  /** 회차 도장. 이미 찍혀 있으면 false 를 돌려줍니다 (애니메이션 판단용). */
  function stampEpisode(season, no) {
    var s = getStamps(season);
    if (s.episodes.indexOf(no) >= 0) return false;
    s.episodes.push(no);
    s.episodes.sort(function (a, b) { return a - b; });
    write('stamps:s' + season, s);
    return true;
  }

  /**
   * 완주 도장.
   *
   *   퀴즈를 다 풀었는지는 **검증하지 않습니다.** 마감도 없어요.
   *   다만 **에피소드 도장은 다 모여야** 합니다 — 그것이 완주의 조건입니다.
   *
   * total 을 넘기면 여기서도 한 번 더 확인합니다.
   * 화면에서 버튼을 감추는 것만으로는 콘솔이나 옛 기록으로 어긋난 상태가
   * 남을 수 있어서, 저장 단계에도 같은 규칙을 둡니다.
   *
   * 완주 코드도 이때 만들어 함께 보관합니다 (투표 폼에 적어 넣는 용도).
   */
  function stampComplete(season, total) {
    var s = getStamps(season);
    if (s.completed) return s.code || null;

    if (total != null && (s.episodes || []).length < total) {
      console.log('[kkmd] 아직 안 읽은 편이 있어 완주 도장을 찍지 않았어요.');
      return null;
    }
    s.completed = true;
    s.completedAt = today();
    s.code = 'S' + season + '-' + randomCode(4);
    write('stamps:s' + season, s);
    return s.code;
  }

  /** 헷갈리기 쉬운 글자(0·O·1·I)는 빼고 만듭니다. */
  function randomCode(n) {
    var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    var out = '';
    for (var i = 0; i < n; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  /* ---------- 카운터 · UI ---------- */

  function getCounter() {
    return read('counter', { reunions: 0, graduated: 0 });
  }

  function bumpCounter(field, by) {
    var c = getCounter();
    c[field] = (c[field] || 0) + (by == null ? 1 : by);
    write('counter', c);
    return c;
  }

  function getUi() {
    return read('ui', { ctaClosed: false, episodesRead: 0 });
  }

  function setUi(patch) {
    var u = getUi();
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) u[k] = patch[k];
    write('ui', u);
    return u;
  }

  /* ---------- 정리 ---------- */

  /**
   * 기록을 전부 지웁니다. 개발 중 확인용이에요.
   * 콘솔에서  Kkmd.reset()  하고 새로고침하면 처음 방문한 상태가 됩니다.
   */
  function reset() {
    var removed = 0;
    keys().forEach(function (k) {
      try { localStorage.removeItem(PREFIX + k); removed++; } catch (e) {}
    });
    console.log('[kkmd] ' + removed + '개 지웠어요. 새로고침(F5) 하면 처음 상태가 됩니다.');
    return removed;
  }

  /** 지금 저장된 내용을 보기 좋게 출력합니다. */
  function dump() {
    var out = {};
    keys().forEach(function (k) { out[k] = read(k, null); });
    console.table
      ? console.log(JSON.stringify(out, null, 2))
      : console.log(out);
    return out;
  }

  /**
   * 확인용 — 가상의 학습 기록을 만들어 넣습니다.
   *
   *   Kkmd.demo()        기본: 표현 6개 만기 + 도장 3개
   *   Kkmd.demo('full')  졸업·재회까지 있는 상태 (추억 보관함 확인용)
   *
   * 실제 표현 ID 를 모르면 아무것도 하지 않으므로,
   * /expressions.json 을 받아 그 안의 ID 를 씁니다.
   */
  function demo(mode) {
    var base = (location.pathname.indexOf('/ep/') === 0) ? '../../' : '';
    fetch('/expressions.json')
      .then(function (r) { return r.json(); })
      .then(function (list) {
        var ids = list.map(function (e) { return e.id; });
        if (!ids.length) return;

        // 회차 도장 — full 은 완주 직전 상태가 목적이라 전부 채웁니다
        write('stamps:s1', {
          episodes: mode === 'full' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3],
          completed: false,
          completedAt: null,
        });

        ids.forEach(function (id, i) {
          if (mode === 'full') {
            if (i < 3) {
              // 졸업한 표현
              setExpr(id, { state: 'ok', streak: 3, nextDue: plusDays(14),
                            lastSeen: plusDays(-2), graduated: true });
            } else if (i < 9) {
              // 오늘 만날 표현
              setExpr(id, { state: ['lost', 'vague', 'new'][i % 3], streak: 0,
                            nextDue: plusDays(-1), lastSeen: null, graduated: false });
            } else {
              // 나중에 만날 표현
              setExpr(id, { state: 'ok', streak: 1, nextDue: plusDays(i - 5),
                            lastSeen: plusDays(-3), graduated: false });
            }
          } else if (i < 6) {
            setExpr(id, { state: 'new', streak: 0, nextDue: plusDays(-1),
                          lastSeen: null, graduated: false });
          }
        });

        if (mode === 'full') write('counter', { reunions: 4, graduated: 3 });

        console.log('[kkmd] 확인용 기록을 넣었어요. 새로고침(F5) 하세요.');
      })
      .catch(function () {
        console.log('[kkmd] /expressions.json 을 불러오지 못했어요.');
      });
  }

  /** 발행 전에 쓰던 골라 풀기 기록을 한 번 걷어냅니다. */
  function cleanupLegacy() {
    try {
      if (localStorage.getItem('kkamukdang-known') != null) {
        localStorage.removeItem('kkamukdang-known');
      }
    } catch (e) {}
  }

  window.Kkmd = {
    today: today,
    plusDays: plusDays,
    onOrBefore: onOrBefore,

    getExpr: getExpr,
    setExpr: setExpr,
    allExpr: allExpr,
    register: register,
    accelerate: accelerate,

    getStamps: getStamps,
    stampEpisode: stampEpisode,
    stampComplete: stampComplete,

    getCounter: getCounter,
    bumpCounter: bumpCounter,
    getUi: getUi,
    setUi: setUi,

    cleanupLegacy: cleanupLegacy,

    // 개발 중 확인용
    reset: reset,
    dump: dump,
    demo: demo,
  };

  cleanupLegacy();
})();
