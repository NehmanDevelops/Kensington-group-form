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

  // How dates are written is a setting (cfg.dateFormat) so the team can change it in the editor.
  // Tokens: {weekday} Wednesday  {wk} Wed  {month} October  {mon} Oct  {dayth} 21st  {day} 21  {dd} 21 (2 digits)  {mm} 10  {year} 2026  {yy} 26
  var DEFAULT_DATE_FORMAT = '{weekday}, {month} {dayth}, {year}';
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(v, fmt) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v));
    if (!m) return '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return '';
    var t = { weekday: DAYS[d.getDay()], wk: DAYS[d.getDay()].slice(0, 3), month: MONTHS[d.getMonth()], mon: MONTHS[d.getMonth()].slice(0, 3), dayth: ordinal(d.getDate()),
              day: String(d.getDate()), dd: pad2(d.getDate()), mm: pad2(d.getMonth() + 1), year: String(d.getFullYear()), yy: String(d.getFullYear()).slice(-2) };
    return String(fmt || DEFAULT_DATE_FORMAT).replace(/\{(\w+)\}/g, function (all, k) { return t[k] !== undefined ? t[k] : all; });
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
  function evalExpr(expr, values, dateFmt) {
    var parts = expr.split(':').map(function (x) { return x.trim(); });
    var fn = parts[0], id, role;
    if (parts.length === 1) return { id: fn, value: str(values[fn]) };
    id = parts[1]; role = parts.slice(2).join(':');
    var v = str(values[id]);
    switch (fn) {
      case 'date': return { id: id, value: fmtDate(v, dateFmt) };
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
      var r = evalExpr(expr, values, cfg && cfg.dateFormat);
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

  // ---- friendly text for the editor -------------------------------------------------------------------------------
  // The editor shows ‹Account Name› instead of {{accountName}}, "‹IF Region is USA› … ‹OTHERWISE› … ‹END IF›" instead of
  // {{#if region=USA}} … {{else}} … {{/if}}. toFriendly() / toRaw() translate both ways (and round-trip exactly).
  function labelOf(cfg, id) { var f = fieldIndex(cfg)[id]; return f ? f.label : id; }
  function idOfLabel(cfg, label) {
    var want = String(label).trim().toLowerCase(), hit = null;
    ((cfg && cfg.sections) || []).forEach(function (s) { (s.fields || []).forEach(function (f) { if (!hit && f.label.trim().toLowerCase() === want) hit = f.id; }); });
    return hit;
  }
  function toFriendly(raw, cfg) {
    return String(raw || '').replace(/\{\{\s*([^}]*?)\s*\}\}/g, function (all, inner) {
      if (inner === 'else') return '‹OTHERWISE›';
      if (inner === '/if') return '‹END IF›';
      var m = /^#if\s+(.*)$/.exec(inner);
      if (m) {
        var c = m[1].trim(), x;
        if ((x = /^([A-Za-z][A-Za-z0-9_]*)\s*(!=|=|~)\s*(.*)$/.exec(c))) {
          var lab = labelOf(cfg, x[1]), vals = x[3].split('|').join(' or ');
          return '‹IF ' + lab + (x[2] === '=' ? ' is ' : x[2] === '!=' ? ' is not ' : ' contains ') + vals + '›';
        }
        if (c.charAt(0) === '!') return '‹IF ' + labelOf(cfg, c.slice(1).trim()) + ' is empty›';
        return '‹IF ' + labelOf(cfg, c) + ' is filled in›';
      }
      var bar = inner.indexOf('|'), expr = bar === -1 ? inner : inner.slice(0, bar), tail = bar === -1 ? '' : inner.slice(bar);
      var p = expr.split(':').map(function (t) { return t.trim(); });
      if (p.length === 1) return '‹' + labelOf(cfg, p[0]) + tail + '›';
      var fn = p[0], id = p[1], role = p.slice(2).join(':');
      if (fn === 'date') return '‹' + labelOf(cfg, id) + ' as date' + tail + '›';
      if (fn === 'first') return '‹first word of ' + labelOf(cfg, id) + tail + '›';
      if (fn === 'names') return '‹' + (role || 'Contact') + ' first names' + tail + '›';
      if (fn === 'emails') return '‹' + (role || 'Contact') + ' emails' + tail + '›';
      if (fn === 'contactLines') return '‹Contact list' + tail + '›';
      return all;
    });
  }
  function toRaw(text, cfg) {
    return String(text || '').replace(/‹([^›\n]+)›/g, function (all, inner) {
      var t = inner.trim(), m;
      if (/^OTHERWISE$/i.test(t)) return '{{else}}';
      if (/^END IF$/i.test(t)) return '{{/if}}';
      var cond = function (lab, op, val) { var id = idOfLabel(cfg, lab); return id ? '{{#if ' + id + op + val + '}}' : all; };
      if ((m = /^IF (.+?) is not (.+)$/i.exec(t))) return cond(m[1], '!=', m[2].split(/ or /i).join('|'));
      if ((m = /^IF (.+?) is filled in$/i.exec(t))) { var a = idOfLabel(cfg, m[1]); return a ? '{{#if ' + a + '}}' : all; }
      if ((m = /^IF (.+?) is empty$/i.exec(t))) { var b = idOfLabel(cfg, m[1]); return b ? '{{#if !' + b + '}}' : all; }
      if ((m = /^IF (.+?) contains (.+)$/i.exec(t))) return cond(m[1], '~', m[2].split(/ or /i).join('|'));
      if ((m = /^IF (.+?) is (.+)$/i.exec(t))) return cond(m[1], '=', m[2].split(/ or /i).join('|'));
      var bar = t.indexOf('|'), head = (bar === -1 ? t : t.slice(0, bar)).trim(), tail = bar === -1 ? '' : t.slice(bar);
      var id = idOfLabel(cfg, head);
      if (id) return '{{' + id + tail + '}}';
      if ((m = /^(.+) as date$/i.exec(head))) { id = idOfLabel(cfg, m[1]); if (id) return '{{date:' + id + tail + '}}'; }
      if ((m = /^first word of (.+)$/i.exec(head))) { id = idOfLabel(cfg, m[1]); if (id) return '{{first:' + id + tail + '}}'; }
      if ((m = /^(.+) first names$/i.exec(head))) return '{{names:contacts:' + m[1] + tail + '}}';
      if ((m = /^(.+) emails$/i.exec(head))) return '{{emails:contacts:' + m[1] + tail + '}}';
      if (/^Contact list$/i.test(head)) return '{{contactLines:contacts' + tail + '}}';
      return all;     // not recognised: left as typed so the editor can warn about it
    });
  }
  // pieces of friendly text the editor could not understand
  function unrecognised(friendly, cfg) {
    var bad = [];
    String(friendly || '').replace(/‹([^›\n]+)›/g, function (all) { if (toRaw(all, cfg) === all) bad.push(all); return all; });
    return bad;
  }

  // ---------- styled (HTML) version of an email: logo banner, coloured headings, for copy-and-paste into Outlook ----------
  // Works on the plain text the templates already produce: an underlined line is a heading, "- " lines are bullets.
  var LOGO_URL = 'https://kensington-group-form.vercel.app/kensington-logo-cream.png';
  function escH(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function inlineHtml(t) {
    return escH(t)
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:#3a2f3c;">$1</a>')
      .replace(/(^|[\s(;])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1<a href="mailto:$2" style="color:#3a2f3c;">$2</a>')
      .replace(/\[[^\]\n]{1,80}\]/g, function (m) { return '<span style="background:#f6e7a8;">' + m + '</span>'; });
  }
  function toHtml(body) {
    var lines = String(body || '').replace(/\r/g, '').split('\n'), out = [], para = [], list = [], title = '';
    var isRule = function (l) { return /^_{8,}\s*$/.test(l || ''); };
    var P = 'margin:0 0 14px;font-family:Georgia,\'Times New Roman\',serif;font-size:15px;line-height:1.6;color:#3a2f3c;';
    var flush = function () {
      if (para.length) out.push('<p style="' + P + '">' + para.map(inlineHtml).join('<br>') + '</p>'); para = [];
      if (list.length) out.push('<ul style="margin:0 0 14px;padding-left:22px;' + P.replace('margin:0 0 14px;', '') + '">' + list.map(function (x) { return '<li style="margin:0 0 4px;">' + inlineHtml(x) + '</li>'; }).join('') + '</ul>'); list = [];
    };
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (i + 2 < lines.length + 1 && lines[i + 1] !== undefined && isRule(lines[i + 1]) && !isRule(l) && l.trim() && i > 0 && isRule(lines[i - 1])) continue;   // heading text (handled with its top rule)
      if (isRule(l) && lines[i + 1] !== undefined && lines[i + 1].trim() && isRule(lines[i + 2])) {
        flush();
        var h = lines[i + 1].trim(); i += 2;
        out.push('<h2 style="margin:28px 0 12px;padding:9px 12px;background-color:#efe8d6;background-image:linear-gradient(#efe8d6,#efe8d6);border-left:4px solid #3a2f3c;font-family:Georgia,\'Times New Roman\',serif;font-weight:bold;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#3a2f3c;">' + inlineHtml(h) + '</h2>');
        continue;
      }
      if (/^KENSINGTON CORPORATE\s*\|/.test(l) && isRule(lines[i + 1])) { title = l.split('|').slice(1).join('|').trim(); i += 1; continue; }
      if (/^- /.test(l)) { if (para.length) flush(); list.push(l.slice(2)); continue; }
      if (!l.trim()) { flush(); continue; }
      if (list.length) flush();
      para.push(l);
    }
    flush();
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 12px 20px 0;">'
      + '<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:100%;border-collapse:separate;border-radius:14px;overflow:hidden;background-color:#fdf9ec;background-image:linear-gradient(#fdf9ec,#fdf9ec);border:1px solid #e4ddcc;color-scheme:light only;supported-color-schemes:light;">'
      + '<tr><td align="center" bgcolor="#3a2f3c" style="background-color:#3a2f3c;background-image:linear-gradient(#3a2f3c,#3a2f3c);padding:30px 24px 26px;">'
      + '<img src="' + LOGO_URL + '" width="260" alt="Kensington Corporate" style="display:block;width:260px;max-width:80%;height:auto;margin:0 auto 14px;border:0;">'
      + (title ? '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:12px;letter-spacing:4px;text-transform:uppercase;color:#c9c3b2;">' + escH(title) + '</div>' : '')
      + '</td></tr><tr><td height="4" bgcolor="#c9c3b2" style="background-color:#c9c3b2;background-image:linear-gradient(#c9c3b2,#c9c3b2);font-size:0;line-height:0;">&nbsp;</td></tr>'
      + '<tr><td bgcolor="#fdf9ec" style="background-color:#fdf9ec;background-image:linear-gradient(#fdf9ec,#fdf9ec);padding:30px 38px 10px;">' + out.join('') + '</td></tr>'
      + '<tr><td bgcolor="#3a2f3c" align="center" style="background-color:#3a2f3c;background-image:linear-gradient(#3a2f3c,#3a2f3c);padding:14px;font-family:Georgia,serif;font-size:11px;letter-spacing:2px;color:#c9c3b2;">KENSINGTON CORPORATE</td></tr></table>'
      + '</td></tr></table>';
  }

  var api = { toHtml: toHtml, toFriendly: toFriendly, toRaw: toRaw, unrecognised: unrecognised, idOfLabel: idOfLabel, RULE: RULE, DEFAULT_DATE_FORMAT: DEFAULT_DATE_FORMAT, fmtDate: fmtDate, parseContacts: parseContacts, render: render, renderEmail: renderEmail, unknownRefs: unknownRefs, refs: refs, fieldIndex: fieldIndex, condTrue: condTrue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GoLive = api;
})(typeof window !== 'undefined' ? window : this);
