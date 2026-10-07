/* Go-Live email engine — shared by go-live-communication.html (the form) and go-live-admin.html (the editor).
 *
 * Template language (kept deliberately small so non-developers can edit emails):
 *   {{fieldId}}                    the value of a field; blank -> [Field label] placeholder (or the default, see below)
 *   {{fieldId|default text}}       value, or the default text when blank
 *   {{date:fieldId}}               a date field written out: "Tuesday October 6th, 2026"   (also {{date:id|TBD}})
 *   {{first:fieldId}}              first word of the value (e.g. "Melissa" from "Melissa Sawicki")
 *   {{names:contacts:Travel Manager}}   first names of the matching contacts: "Heidi and Dyllan"
 *   {{emails:contacts:Travel Manager}}  their email addresses, comma separated
 *   {{contactLines:contacts}}      one "Name — Title — email" line per contact
 *   {{#if fieldId}} ... {{else}} ... {{/if}}      conditions: id | !id | id=Value | id!=Value | id=A|B (either)
 *   ## Heading                     a ruled, capitalised heading      ---   a thin rule line
 * Contacts are typed one per line as:  Name | Title | Email | Role
 */
(function (root) {
  var RULE = '__________________________';   // underscores: look like a thin line but cost 1 byte each in a mailto link (box-drawing chars cost 9)
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function str(v) { return v == null ? '' : String(v).trim(); }
  function ordinal(n) { var s = n % 100; if (s >= 11 && s <= 13) return n + 'th'; return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }

  function fmtDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v));
    if (!m) return '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return '';
    return DAYS[d.getDay()] + ' ' + MONTHS[d.getMonth()] + ' ' + ordinal(d.getDate()) + ', ' + d.getFullYear();
  }

  function parseContacts(text) {
    return String(text || '').split(/\r?\n/).map(function (line) {
      var p = line.split(/\s*[|\t]\s*/).map(function (x) { return x.trim(); });
      if (!p[0]) return null;
      return { name: p[0], title: p[1] || '', email: p[2] || '', role: p[3] || '' };
    }).filter(Boolean);
  }
  function filterContacts(list, role) {
    if (!role) return list;
    var r = role.toLowerCase();
    var hit = list.filter(function (c) { return c.role.toLowerCase().indexOf(r) !== -1; });
    return hit.length ? hit : list;            // nobody tagged with the role -> use everyone
  }
  function joinNames(a) {
    if (a.length <= 1) return a.join('');
    if (a.length === 2) return a[0] + ' and ' + a[1];
    return a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
  }

  function fieldIndex(cfg) {
    var idx = {};
    ((cfg && cfg.sections) || []).forEach(function (s) { (s.fields || []).forEach(function (f) { idx[f.id] = f; }); });
    return idx;
  }

  // value of a "{{...}}" expression (before default handling)
  function evalExpr(expr, values) {
    var parts = expr.split(':').map(function (x) { return x.trim(); });
    var fn = parts[0], id, role;
    if (parts.length === 1) return { id: fn, value: str(values[fn]) };
    id = parts[1]; role = parts.slice(2).join(':');
    var v = str(values[id]);
    switch (fn) {
      case 'date': return { id: id, value: fmtDate(v) };
      case 'first': return { id: id, value: v.split(/\s+/)[0] || '' };
      case 'upper': return { id: id, value: v.toUpperCase() };
      case 'names': return { id: id, value: joinNames(filterContacts(parseContacts(values[id]), role).map(function (c) { return c.name.split(/\s+/)[0]; })) };
      case 'emails': return { id: id, value: filterContacts(parseContacts(values[id]), role).map(function (c) { return c.email; }).filter(Boolean).join(', ') };
      case 'contactLines': return { id: id, value: parseContacts(values[id]).map(function (c) { return [c.name, c.title, c.email].filter(Boolean).join(' — '); }).join('\n') };
      default: return { id: expr, value: str(values[expr]) };
    }
  }

  function condTrue(cond, values) {
    cond = cond.trim();
    var m;
    if ((m = /^([A-Za-z][A-Za-z0-9_]*)\s*(!=|=|~)\s*(.*)$/.exec(cond))) {
      var have = str(values[m[1]]).toLowerCase();
      var opts = m[3].split('|').map(function (x) { return x.trim().toLowerCase(); });
      var hit = m[2] === '~' ? opts.some(function (o) { return o && have.indexOf(o) !== -1; }) : opts.indexOf(have) !== -1;
      return m[2] === '!=' ? !hit : hit;
    }
    if (cond.charAt(0) === '!') return !str(values[cond.slice(1).trim()]);
    return !!str(values[cond]);
  }

  // Render one template. Returns { text, missing:[labels] }.
  function render(tpl, values, cfg) {
    values = values || {};
    var idx = fieldIndex(cfg), missing = [];
    var s = String(tpl || '').replace(/\r\n/g, '\n');

    // 1) conditionals, innermost first (so they can nest)
    var re = /\{\{#if\s+([^}]*?)\s*\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}(\n?)/g, guard = 0, changed = true;
    while (changed && guard++ < 50) {
      changed = false;
      s = s.replace(re, function (all, cond, body, nl, offset, whole) {
        changed = true;
        var cut = body.indexOf('{{else}}');
        var thenP = cut === -1 ? body : body.slice(0, cut);
        var elseP = cut === -1 ? '' : body.slice(cut + 8);
        var startsLine = offset === 0 || whole.charAt(offset - 1) === '\n';
        var blockMode = startsLine && body.charAt(0) === '\n';
        var chosen = condTrue(cond, values) ? thenP : elseP;
        if (blockMode) { chosen = chosen.replace(/^\n/, ''); return chosen; }
        return chosen + nl;
      });
    }

    // 2) variables
    s = s.replace(/\{\{\s*([^#\/}][^}]*?)\s*\}\}/g, function (all, inner) {
      if (inner === 'else') return '';
      var bar = inner.indexOf('|');
      var expr = bar === -1 ? inner : inner.slice(0, bar);
      var dflt = bar === -1 ? null : inner.slice(bar + 1);
      var r = evalExpr(expr, values);
      if (r.value) return r.value;
      if (dflt !== null) return dflt;
      var label = (idx[r.id] && idx[r.id].label) || r.id;
      if (missing.indexOf(label) === -1) missing.push(label);
      return '[' + label + ']';
    });

    // 3) headings and rules, then tidy blank lines
    s = s.split('\n').map(function (line) {
      if (/^##\s+/.test(line)) return RULE + '\n' + line.replace(/^##\s+/, '').toUpperCase() + '\n' + RULE;
      if (/^---\s*$/.test(line)) return RULE;
      return line.replace(/\s+$/, '');
    }).join('\n');
    s = s.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '');
    return { text: s, missing: missing };
  }

  // Render a whole email config { subject, to, cc, body } with the given values.
  function renderEmail(emailCfg, values, cfg) {
    var b = render(emailCfg.body, values, cfg);
    var sub = render(emailCfg.subject, values, cfg);
    var to = render(emailCfg.to, values, cfg);
    var cc = render(emailCfg.cc, values, cfg);
    var addrs = function (t) { return t.text.split(/[;,]\s*/).map(function (x) { return x.trim(); }).filter(function (x) { return x && x.charAt(0) !== '['; }); };
    var miss = [];
    [b, sub, to].forEach(function (r) { r.missing.forEach(function (m) { if (miss.indexOf(m) === -1) miss.push(m); }); });
    return { subject: sub.text.replace(/\n+/g, ' '), to: addrs(to), cc: addrs(cc), body: b.text, missing: miss };
  }

  // Every field id a template refers to (the editor uses this to warn before a field is deleted or mistyped)
  function refs(tpl) {
    var out = [];
    String(tpl || '').replace(/\{\{\s*([^}]*?)\s*\}\}/g, function (all, inner) {
      if (inner === 'else' || inner === '/if') return '';
      var e = inner.replace(/^#if\s+/, '').replace(/^!/, '').split('|')[0];
      var m = /^([A-Za-z][A-Za-z0-9_]*)\s*(?:!=|=|~).*$/.exec(e);
      var id = m ? m[1] : (e.indexOf(':') !== -1 ? e.split(':')[1] : e);
      id = (id || '').trim();
      if (id && out.indexOf(id) === -1) out.push(id);
      return '';
    });
    return out;
  }
  function unknownRefs(tpl, cfg) { var idx = fieldIndex(cfg); return refs(tpl).filter(function (id) { return !idx[id]; }); }

  var api = { RULE: RULE, fmtDate: fmtDate, parseContacts: parseContacts, render: render, renderEmail: renderEmail, unknownRefs: unknownRefs, refs: refs, fieldIndex: fieldIndex, condTrue: condTrue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GoLive = api;
})(typeof window !== 'undefined' ? window : this);
