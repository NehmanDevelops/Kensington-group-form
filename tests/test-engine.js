const fs = require('fs');
const root = require('path').join(__dirname, '..') + require('path').sep;
const G = require(root + 'go-live-engine.js');
const cfg = JSON.parse(fs.readFileSync(root + 'go-live-default-config.json', 'utf8'));
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra || ''); } else console.log('ok  ', name); };

// defaults the form would apply
const defaults = {}; cfg.sections.forEach(s => s.fields.forEach(f => { if (f.default) defaults[f.id] = f.default; }));

const pfah = Object.assign({}, defaults, {
  submittedBy: 'Jenna Davidson', accountName: 'Partners for Affordable Housing', region: 'Canada', accountLocation: 'Calgary, AB', contractedValue: '$80k USD',
  serviceLevel: 'Envoy & Entourage', dk: 'Envoy 6476181711  / Entourage 6476181712', launchType: 'Full', goLiveDate: '2026-10-06', handoverDate: '2026-10-06',
  implementationsLead: 'Kathy Boyken', csim: 'Jenna Davidson', csm: 'Mira Seagram', csmEmail: 'mira.seagram@kensingtoncorporate.com', csmPhone: '647-329-4045',
  leadAgent: 'Melissa Sawicki', bdm: 'Tammy Jule-Ganne', bdmEmail: 'tammy@kensingtoncorporate.com', signoffNames: 'Jenna, Kathy, Mira, Melissa', tmSignoff: 'Jenna & Kathy',
  contacts: 'Heidi Berger | Special Projects Lead | heidi.berger@pfah.ca | Travel Manager\nDyllan Lough | EA | dyllan@pfah.ca | Travel Manager\nJolene Livingston | Founder and CEO | jolene@pfah.ca',
  selfRegLink: 'https://example.com/selfreg', signOn: '2FA or Email Verification', adminTraining: '2026-09-24', generalTraining: '2026-10-06', contractExpiry: '2028-07-30',
  policyLink: 'https://example.com/policy',
});
const pbrands = Object.assign({}, pfah, { accountName: 'Premium Brands', signOn: 'SSO', launchType: 'Partial', launchNotes: 'Go-Live will launch with a small pilot group.', rebate: 'Implementation fee refunded by 50%' ,
  contacts: 'Ovianna Tse | EA | ovianna@pbhcorp.com | Travel Manager\nManica Ng | Admin Assistant | manica@pbhcorp.com | Travel Manager\nKwong Yee | Sr Director | | Decision Maker' });

const w = G.renderEmail(cfg.emails.welcome, pfah, cfg);
const t = G.renderEmail(cfg.emails.tm, pfah, cfg);
const i = G.renderEmail(cfg.emails.internal, pfah, cfg);
const wp = G.renderEmail(cfg.emails.welcome, pbrands, cfg);

ok('welcome has no missing placeholders', w.missing.length === 0, JSON.stringify(w.missing));
ok('welcome To = travel managers only', JSON.stringify(w.to) === JSON.stringify(['heidi.berger@pfah.ca', 'dyllan@pfah.ca']), JSON.stringify(w.to));
ok('greeting has no stray comma', /^Hi Heidi and Dyllan,/m.test(w.body) && !/Heidi, and Dyllan/.test(w.body));
ok('subject', w.subject === 'Welcome to Kensington Corporate — Partners for Affordable Housing Go-Live', w.subject);
ok('2FA wording', /request an email sign-in link, which we recommend/.test(w.body) && !/single sign-on/.test(w.body));
ok('SSO wording (Premium Brands)', /single sign-on \(SSO\)/.test(wp.body) && !/email sign-in link/.test(wp.body));
ok('loyalty not migrated', /did not migrate from your previous TMC/.test(w.body));
ok('lead agent paragraph', /Melissa Sawicki will be your lead agent/.test(w.body) && /put ATTN: Melissa Sawicki at the top/.test(w.body) && /If Melissa is unavailable/.test(w.body));
ok('canada support block', /canada@kensingtoncorporate.com/.test(w.body) && !/\[US support/.test(w.body));
ok('csm section', /## |DEDICATED CUSTOMER SUCCESS MANAGER/.test(w.body) && /Mira can be reached at mira.seagram@kensingtoncorporate.com or 647-329-4045/.test(w.body));
ok('no pronoun in csm section', !/\bShe\b|\bshe'll|\bShe'll/.test(w.body));
ok('signoff', /Jenna, Kathy, Mira, Melissa & the entire Kensington Corporate team$/.test(w.body));
ok('no empty accountNotes section', !/SPECIFIC TO/.test(w.body));
ok('no triple blank lines', !/\n\n\n/.test(w.body));
ok('Concur videos line only for Concur', /SAP Concur/.test(w.body));

const usa = G.renderEmail(cfg.emails.welcome, Object.assign({}, pfah, { region: 'USA', obt: 'Deem', accountNotes: 'Custom note here.' }), cfg);
ok('USA shows placeholder + email placeholder', /\[US support details/.test(usa.body) && /\[US support email\]/.test(usa.body));
ok('Deem shows editable placeholder + no SAP Concur line', /\[Deem sign-in instructions/.test(usa.body) && !/SAP Concur/.test(usa.body));
ok('account notes section appears', /SPECIFIC TO PARTNERS FOR AFFORDABLE HOUSING/.test(usa.body) && /Custom note here\./.test(usa.body));

ok('TM greeting + signoff', /^Hi Heidi and Dyllan,/m.test(t.body) && /Thank you,\nJenna & Kathy$/.test(t.body));
ok('TM self-reg link', /Partners for Affordable Housing Self-Registration Link: https:\/\/example.com\/selfreg/.test(t.body));
ok('TM no missing', t.missing.length === 0, JSON.stringify(t.missing));
const tNoLink = G.renderEmail(cfg.emails.tm, Object.assign({}, pfah, { selfRegLink: '' }), cfg);
ok('TM missing link flagged (the [INSERT LINK] problem)', tNoLink.missing.indexOf('Self-Registration Link') !== -1);

ok('internal subject has go-live date', i.subject === 'Go-Live Internal Communication — Partners for Affordable Housing | Go-Live Tuesday, October 6th, 2026', i.subject);
ok('internal recipients', i.to.indexOf('tammy@kensingtoncorporate.com') !== -1 && i.to.length === 6, JSON.stringify(i.to));
ok('internal values', /Contracted Value: \$80k USD/.test(i.body) && /Full or Partial Launch: Full\n/.test(i.body) && /Contract Expiration Date: Sunday, July 30th, 2028/.test(i.body));
ok('internal date text', /Go-Live: Tuesday, October 6th, 2026/.test(i.body) && /OBT Admin Training: Thursday, September 24th, 2026/.test(i.body));
ok('internal partial launch details', /Full or Partial Launch: Partial\. Go-Live will launch/.test(G.renderEmail(cfg.emails.internal, pbrands, cfg).body));
ok('internal contact lines', /Heidi Berger — Special Projects Lead — heidi.berger@pfah.ca/.test(i.body));
ok('unknownRefs finds nothing in defaults', ['internal', 'welcome', 'tm'].every(k => !G.unknownRefs(cfg.emails[k].body + cfg.emails[k].subject + cfg.emails[k].to, cfg).length), JSON.stringify(['internal', 'welcome', 'tm'].map(k => G.unknownRefs(cfg.emails[k].body + cfg.emails[k].subject + cfg.emails[k].to, cfg))));
ok('unknownRefs catches a typo', G.unknownRefs('Hi {{#if nope}}x{{/if}} {{date:alsoNope}}', cfg).join() === 'nope,alsoNope');
ok('blank form shows placeholders, never crashes', G.renderEmail(cfg.emails.welcome, {}, cfg).missing.length > 3);
ok('date formatter', G.fmtDate('2026-10-01') === 'Thursday, October 1st, 2026' && G.fmtDate('2026-10-22') === 'Thursday, October 22nd, 2026' && G.fmtDate('2026-10-13') === 'Tuesday, October 13th, 2026' && G.fmtDate('2026-10-21') === 'Wednesday, October 21st, 2026' && G.fmtDate('x') === '');


// --- date style is a setting (Jos: comma after the weekday; the team can change the style in the editor) ---
ok('Jos example: Wednesday, October 21st, 2026', G.fmtDate('2026-10-21') === 'Wednesday, October 21st, 2026', G.fmtDate('2026-10-21'));
ok('style: no comma', G.fmtDate('2026-10-21', '{weekday} {month} {dayth}, {year}') === 'Wednesday October 21st, 2026');
ok('style: short', G.fmtDate('2026-10-21', '{mon} {day}, {year}') === 'Oct 21, 2026');
ok('style: numeric', G.fmtDate('2026-10-07', '{year}-{mm}-{dd}') === '2026-10-07' && G.fmtDate('2026-10-07', '{dd}/{mm}/{yy}') === '07/10/26');
ok('style: unknown token left visible, not crashing', G.fmtDate('2026-10-21', '{month} {nope}') === 'October {nope}');
const cfgStyle = Object.assign({}, cfg, { dateFormat: '{weekday} {month} {dayth}, {year}' });
ok('email picks up cfg.dateFormat', /Go-Live: Tuesday October 6th, 2026/.test(G.renderEmail(cfg.emails.internal, pfah, cfgStyle).body) && /Tuesday October 6th, 2026$/.test(G.renderEmail(cfg.emails.internal, pfah, cfgStyle).subject));
ok('email default has the comma', /Go-Live: Tuesday, October 6th, 2026/.test(i.body) && /Go-Live Tuesday, October 6th, 2026$/.test(i.subject));


const lens = { welcome: w.body.length, tm: t.body.length, internal: i.body.length };
console.log('body chars', lens, ' mailto url chars ~', Object.fromEntries(Object.entries({ welcome: w, tm: t, internal: i }).map(([k, v]) => [k, encodeURIComponent(v.body).length])));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
