// Turns "hit knee on belly 3 times, omoplata'd 1 person, technique of the day was the knee cut"
// into log items: [{ nodeId, kind, count, phrase }]. Runs offline, no model involved.
// kinds: hit (you did it live) · caught (it was done to you) · escape · drill · class (technique of the day)
(function (root) {
  const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, once: 1, twice: 2, thrice: 3, 'a couple': 2, 'a couple of': 2, 'a few': 3, 'a bunch': 5, 'a bunch of': 5 };
  const NUMWORD = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a couple of|a couple|a few|a bunch of|a bunch)';
  const UNIT = '(?:x|times?|people|persons?|guys?|girls?|ppl|partners?|reps?|rounds?|(?:training )?partners?|(?:white|blue|purple|brown|black)? ?belts?|times? in a row)';
  const SKIP_AUTO = new Set(['efficiency', 'refinement', 'coaching', 'tap early', 'giving back', 'your own style', 'competing']);
  const STOP = new Set('i im me my we us our the a an and or but to of in on at with was were is it its that this then also today tonight class did do got had have just really pretty so very some lot lots of from for felt feel good bad ok okay rolled rolls rolling round rounds training trained session'.split(' '));

  const CUES = [
    ['class', /\b(technique of the day|tech of the day|totd|todays technique|technique today|todays class|class was|lesson was|we learned|we learnt|learned|learnt|we did|we covered|covered|taught|coach showed|instructor showed|showed us|focus was|theme was|class on|class today was)\b/g],
    ['drill', /\b(drill|drills|drilled|drilling|practiced|practised|practicing|practising|worked on|working on|reps|repped)\b/g],
    ['caught', /\b(got caught|been caught|was caught|got tapped|got subbed|got submitted|got choked|got finished|got stuck|got smashed|got swept|got passed|got mounted|got my back taken|took my back|caught me|got me|tapped me|subbed me|choked me|finished me|swept me|passed me|mounted me|tapped to|tapped out to|lost to|fell for|fell into|got hit with|ate a|ate an)\b/g],
    ['escape', /\b(escaped|escape from|escaped from|got out of|got out from|survived|recovered guard from|escaping)\b/g],
    ['hit', /\b(got|hit|hits|landed|finished|caught|tapped|subbed|submitted|nailed|scored|swept|took|pulled off|won with|got a|got the|managed)\b/g],
  ];
  const PRIORITY = { class: 5, drill: 4, caught: 3, escape: 2, hit: 1 };

  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’'`]/g, '').replace(/×/g, ' x ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function forms(alias) {
    const words = alias.split(' ');
    const last = words.pop();
    const pre = words.length ? words.join(' ') + ' ' : '';
    const out = [{ t: alias, verb: /ed$/.test(last) }];
    if (!/\d$/.test(last)) {
      out.push({ t: pre + last + 's', verb: false }, { t: pre + last + 'es', verb: false });
      if (/e$/.test(last)) out.push({ t: pre + last + 'd', verb: true });
      else {
        out.push({ t: pre + last + 'ed', verb: true }, { t: pre + last + 'd', verb: true });
        if (/[^aeiou][aeiou][bdgklmnprt]$/.test(last)) out.push({ t: pre + last + last.slice(-1) + 'ed', verb: true });
      }
    }
    return out;
  }

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }

  function toCount(word) {
    if (word == null) return null;
    if (/^\d+$/.test(word)) return parseInt(word, 10);
    return WORDNUM[word] ?? null;
  }

  function createParser(nodes) {
    // nodes: [{ id, t, a?, kind:'topic'|'kid' }]
    const entries = [];
    const seen = new Set();
    nodes.forEach((n, order) => {
      const names = [];
      const title = n.t;
      const base = norm(title.replace(/\(.*?\)/g, ''));
      if (!SKIP_AUTO.has(base)) names.push(base);
      const paren = title.match(/\((.*?)\)/); if (paren) names.push(norm(paren[1]));
      const colon = title.split(':'); if (colon.length > 1) names.push(norm(colon[1]));
      (n.a || []).forEach(x => names.push(norm(x)));
      names.filter(Boolean).forEach(name => forms(name).forEach(f => {
        if (seen.has(f.t)) return;           // first node to claim a name keeps it
        seen.add(f.t);
        entries.push({ t: f.t, verb: f.verb, id: n.id, words: f.t.split(' ').length, order, topic: n.kind === 'topic' });
      }));
    });
    // longest names first; kids beat topics on equal length
    entries.sort((x, y) => y.words - x.words || y.t.length - x.t.length || (x.topic - y.topic) || x.order - y.order);

    function findMatches(seg) {
      const padded = ' ' + seg + ' ';
      const taken = [];
      const found = [];
      for (const e of entries) {
        let from = 0, ix;
        const needle = ' ' + e.t + ' ';
        while ((ix = padded.indexOf(needle, from)) !== -1) {
          const start = ix, end = ix + e.t.length; // in seg coordinates (padded offset cancels)
          if (!taken.some(([s, f]) => start < f && end > s)) {
            taken.push([start, end]);
            found.push({ start, end, id: e.id, verb: e.verb, text: e.t });
          }
          from = ix + 1;
        }
      }
      return found.sort((a, b) => a.start - b.start);
    }

    function fuzzy(seg) {
      const tokens = seg.split(' ');
      let best = null;
      for (const e of entries) {
        if (e.t.length < 5 || e.words > tokens.length) continue;
        for (let i = 0; i + e.words <= tokens.length; i++) {
          const cand = tokens.slice(i, i + e.words).join(' ');
          if (Math.abs(cand.length - e.t.length) > 3) continue;
          const sim = 1 - lev(cand, e.t) / Math.max(cand.length, e.t.length);
          if (sim >= 0.8 && (!best || sim > best.sim)) {
            const start = tokens.slice(0, i).join(' ').length + (i ? 1 : 0);
            best = { sim, start, end: start + cand.length, id: e.id, verb: e.verb, text: cand };
          }
        }
      }
      return best ? [best] : [];
    }

    function kindIn(before) {
      let best = null;
      for (const [kind, re] of CUES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(before))) {
          const pos = m.index + m[0].length;
          if (!best || pos > best.pos || (pos === best.pos && PRIORITY[kind] > PRIORITY[best.kind])) best = { kind, pos };
        }
      }
      return best && best.kind;
    }

    function countAfter(after) {
      const a = after.slice(0, 48);
      let m = a.match(new RegExp(`^\\s*(?:\\S+\\s+){0,3}?(?:on |to |against )?(${NUMWORD})\\s*${UNIT}\\b`));
      if (m) return toCount(m[1]);
      m = a.match(/^\s*(?:\S+\s+){0,3}?(once|twice|thrice)\b/); if (m) return toCount(m[1]);
      m = a.match(/^\s*(?:\S+\s+){0,3}?x\s?(\d+)\b/) || a.match(/^\s*(?:\S+\s+){0,3}?(\d+)\s?x\b/); if (m) return toCount(m[1]);
      m = a.match(/^\s*(\d+)\s*$/) || a.match(/^\s*(\d+)\s+(?:and|then|also)\b/); if (m) return toCount(m[1]);
      return null;
    }
    function countBefore(before) {
      const m = before.match(new RegExp(`(${NUMWORD})\\s*(?:x\\s*)?(?:more\\s+|clean\\s+|nice\\s+|good\\s+)?$`));
      return m ? toCount(m[1]) : null;
    }

    function splitSegments(text) {
      return String(text)
        .split(/[,;.!?\n]+|\s+(?:then|also|plus|after that)\s+/i)
        .map(norm).filter(Boolean);
    }

    function parse(text) {
      const items = [];
      const unmatched = [];
      for (const seg of splitSegments(text)) {
        let matches = findMatches(seg);
        if (!matches.length) matches = fuzzy(seg);
        // "drilled it 10 reps": a pronoun points back at the last technique mentioned
        if (!matches.length && items.length) {
          const ref = seg.match(/\b(it|that|them|those|this one|that one)\b/);
          if (ref && kindIn(seg.slice(0, ref.index))) {
            const last = items[items.length - 1];
            matches = [{ start: ref.index, end: ref.index + ref[0].length, id: last.nodeId, verb: false, text: last.phrase }];
          }
        }
        if (!matches.length) {
          const meaningful = seg.split(' ').filter(w => !STOP.has(w) && !/^\d+$/.test(w));
          if (meaningful.length) unmatched.push(seg);
          continue;
        }
        let prevKind = null;
        matches.forEach((m, i) => {
          const before = seg.slice(i ? matches[i - 1].end : 0, m.start);
          const after = seg.slice(m.end, i + 1 < matches.length ? matches[i + 1].start : seg.length);
          let kind = kindIn(before);
          if (m.verb && /\b(got|get|gets|getting|was|been|being)\s*$/.test(before)) kind = 'caught';
          if (/^\s*(me|on me|got me|caught me|tapped me)\b/.test(after)) kind = 'caught';
          if (!kind) kind = prevKind || 'hit';
          let count = kind === 'class' ? 1 : (countAfter(after) ?? countBefore(before) ?? 1);
          count = Math.max(1, Math.min(50, count));
          prevKind = kind;
          items.push({ nodeId: m.id, kind, count, phrase: m.text });
        });
      }
      // merge repeats of the same technique + kind
      const merged = [];
      for (const it of items) {
        const same = merged.find(x => x.nodeId === it.nodeId && x.kind === it.kind);
        if (same) same.count = Math.min(50, same.count + it.count); else merged.push({ ...it });
      }
      return { items: merged, unmatched };
    }

    return { parse, norm };
  }

  root.BJJParser = { createParser, norm };
  if (typeof module !== 'undefined') module.exports = root.BJJParser;
})(typeof window !== 'undefined' ? window : globalThis);
