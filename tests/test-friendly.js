const fs = require('fs');
const root = require('path').join(__dirname, '..') + require('path').sep;
const G = require(root + 'go-live-engine.js');
const cfg = JSON.parse(fs.readFileSync(root + 'go-live-default-config.json', 'utf8'));
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra || ''); } else console.log('ok  ', name); };

// every default template survives friendly -> raw unchanged
const bad = [];
['internal', 'welcome', 'tm'].forEach(k => ['subject', 'to', 'cc', 'body', 'attachments'].forEach(p => {
  const raw = cfg.emails[k][p] || '';
  const fr = G.toFriendly(raw, cfg);
  if (G.toRaw(fr, cfg) !== raw) bad.push(k + '.' + p);
  if (fr.indexOf('{{') !== -1) bad.push(k + '.' + p + ' still shows {{ }}');
}));
ok('every default template round-trips exactly', bad.length === 0, bad.join(', '));

const fw = G.toFriendly(cfg.emails.welcome.body, cfg);
ok('friendly welcome reads naturally',
  fw.indexOf('Hi ‹Travel Manager first names›,') !== -1 && fw.indexOf('‹IF OBT is Deem›') !== -1 && fw.indexOf('‹IF OBT Sign-on Method is SSO›') !== -1 &&
  fw.indexOf('‹OTHERWISE›') !== -1 && fw.indexOf('‹END IF›') !== -1 && fw.indexOf('‹first word of Lead Agent (90 days)›') !== -1, fw.slice(0, 400));
const fi = G.toFriendly(cfg.emails.internal.body, cfg);
ok('friendly internal: dates, defaults, contact list', fi.indexOf('‹Go-Live Date as date›') !== -1 && fi.indexOf('‹Contracted Value|N/A›') !== -1 && fi.indexOf('‹Contact list›') !== -1);

const typed = G.toRaw('Hi ‹Account Name›. ‹IF Region is USA›US team‹OTHERWISE›CA team‹END IF›', cfg);
ok('typed friendly text becomes a working email', G.renderEmail({ subject: '', to: '', cc: '', body: typed }, { accountName: 'Acme', region: 'USA' }, cfg).body === 'Hi Acme. US team', typed);
ok('IF ... is A or B', G.toRaw('‹IF OBT is Concur or Deem›x‹END IF›', cfg) === '{{#if obt=Concur|Deem}}x{{/if}}');
ok('IF ... is not / is empty / contains', G.toRaw('‹IF Region is not USA›', cfg) === '{{#if region!=USA}}' && G.toRaw('‹IF CC (optional) is empty›', cfg) === '{{#if !cc}}' && G.toRaw('‹IF OBT Sign-on Method contains SSO›', cfg) === '{{#if signOn~SSO}}');
ok('typos are reported, never silently dropped', G.unrecognised('Hi ‹Acount Name› and ‹Account Name›', cfg).join() === '‹Acount Name›');
ok('label matching ignores capitals and spaces at the ends', G.toRaw('‹ account name ›', cfg) === '{{accountName}}');

const renamed = JSON.parse(JSON.stringify(cfg));
renamed.sections[0].fields.find(f => f.id === 'accountName').label = 'Client Name';
ok('renaming a question renames it everywhere; its id never changes', G.toFriendly('{{accountName}}', renamed) === '‹Client Name›' && G.toRaw('‹Client Name›', renamed) === '{{accountName}}');

// styled (HTML) version for copy-and-paste into Outlook
const sv = { accountName: 'Acme', region: 'USA', leadAgent: 'Mel Sawicki', csm: 'Mira', csmEmail: 'm@k.com', csmPhone: '1', signoffNames: 'Jenna', contacts: 'A B | EA | a@b.com | Travel Manager', signOn: 'SSO' };
const hh = G.toHtml(G.renderEmail(cfg.emails.welcome, sv, cfg).body);
ok('styled email: logo banner, headings, bullets, no leftover rules', /banner-welcome\.png/.test(hh) && /banner-footer\.png/.test(hh) && (hh.match(/<h2/g) || []).length >= 6 && /<li/.test(hh) && !/____/.test(hh) && hh.indexOf('KENSINGTON CORPORATE |') === -1 && hh.indexOf('KENSINGTON CORPORATE  |') === -1);
ok('styled email: emails and links become clickable, text is escaped', /href="mailto:m@k.com"/.test(hh) && G.toHtml('a <b> & https://x.com/y.').indexOf('&lt;b&gt; &amp; <a href="https://x.com/y"') !== -1);

console.log(fails ? fails + ' FAILED' : 'ALL FRIENDLY TESTS PASSED');
process.exit(fails ? 1 : 0);
