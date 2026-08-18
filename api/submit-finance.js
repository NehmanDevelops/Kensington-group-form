// Finance Request (MS-Forms style) -> writes a row into the Finance Requests
// Tracker sheet on Smartsheet. One row per submission, every field its own
// column (fields not used by the selected Request Type are simply left blank).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.SMARTSHEET_API_TOKEN;
  if (!TOKEN) return res.status(503).json({ error: 'SMARTSHEET_API_TOKEN not configured' });

  const SHEET_ID = '8151195108462468'; // Finance Requests Tracker

  const COL = {
    submittedDate:        4214651187662724,
    requestType:           8718250815033220,
    agentName:              555476490424196,
    companyName:            5059076117794692,
    pcc:                     2807276304109444,
    pnr:                     7310875931479940,
    invoiceNum:              1681376397266820,
    branch:                  6184976024637316,
    ccEmails:                3933176210952068,
    vendorName:              8436775838322564,
    invoiceTotal:            1118426443845508,
    actionToBeTaken:         5622026071216004,
    admLocation:             3370226257530756,
    admChargedTo:            7873825884901252,
    currency:                2244326350688132,
    origPaymentMethod:       6747925978058628,
    origPaymentAmount:       4496126164373380,
    newPaymentMethod:        8999725791743876,
    newPaymentAmount:            5720676536196,
    refundMethod:            4509320303906692,
    typeOfRefund:            2257520490221444,
    payoutReason:            6761120117591940,
    payoutMethod:            1131620583378820,
    receivedFromVendor:      5635220210749316,
    amountOwingToClient:     3383420397064068,
    reasonForRefund:         7887020024434564,
    refundPaymentMethod:      568670629957508,
    totalAmountToRefund:     5072270257328004,
    cardLast4:               2820470443642756,
    issuingCountry:          7324070071013252,
    issuingBank:             1694570536800132,
    mailingAddress:          6198170164170628,
    attentionTo:             3946370350485380,
    bankingInfo:             8449969977855876,
    clientOriginallyPaid:     287195653246852,
    vendorAmountReceived:    4790795280617348,
    additionalComments:      2538995466932100,
    passengerName:           7042595094302596,
    ykInvoice:               1413095560089476,
    departureDate:           5916695187459972,
    serviceDescription:      3664895373774724,
    amount:                  8168495001145220,
    notes:                    850145606668164,
    requesterEmail:          5353745234038660,
    reasonForUdidUpdate:     3101945420353412,
    udidNum:                 7605545047723908,
    origUdidValue:           1976045513510788,
    newUdidValue:            6479645140881284,
    status:                  4227845327196036,
  };

  try {
    const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!d.requestType || !d.agentName) {
      return res.status(400).json({ error: 'Request Type and Agent Name are required.' });
    }
    const today = new Date().toISOString().split('T')[0];
    const s = (v) => (v === undefined || v === null ? '' : String(v).trim());

    const map = {
      submittedDate: today,
      requestType: s(d.requestType),
      agentName: s(d.agentName),
      companyName: s(d.companyName),
      pcc: s(d.pcc),
      pnr: s(d.pnr),
      invoiceNum: s(d.invoice),
      branch: s(d.branch),
      ccEmails: s(d.ccEmails),
      vendorName: s(d.vendorName),
      invoiceTotal: s(d.invoiceTotal),
      actionToBeTaken: s(d.actionToBeTaken),
      admLocation: s(d.admLocation),
      admChargedTo: s(d.admChargedTo),
      currency: s(d.currency),
      origPaymentMethod: s(d.origPaymentMethod),
      origPaymentAmount: s(d.origPaymentAmount),
      newPaymentMethod: s(d.newPaymentMethod),
      newPaymentAmount: s(d.newPaymentAmount),
      refundMethod: s(d.refundMethod),
      typeOfRefund: s(d.typeOfRefund),
      payoutReason: s(d.payoutReason),
      payoutMethod: s(d.payoutMethod),
      receivedFromVendor: s(d.receivedFromVendor),
      amountOwingToClient: s(d.amountOwingToClient),
      reasonForRefund: s(d.reasonForRefund),
      refundPaymentMethod: s(d.refundPaymentMethod),
      totalAmountToRefund: s(d.totalAmountToRefund),
      cardLast4: s(d.cardLast4),
      issuingCountry: s(d.issuingCountry),
      issuingBank: s(d.issuingBank),
      mailingAddress: s(d.mailingAddress),
      attentionTo: s(d.attentionTo),
      bankingInfo: s(d.bankingInfo),
      clientOriginallyPaid: s(d.clientOriginallyPaid),
      vendorAmountReceived: s(d.vendorAmountReceived),
      additionalComments: s(d.additionalComments),
      passengerName: s(d.passengerName),
      ykInvoice: s(d.ykInvoice),
      departureDate: s(d.departureDate),
      serviceDescription: s(d.serviceDescription),
      amount: s(d.amount),
      notes: s(d.notes),
      requesterEmail: s(d.requesterEmail),
      reasonForUdidUpdate: s(d.reasonForUdidUpdate),
      udidNum: s(d.udidNum),
      origUdidValue: s(d.origUdidValue),
      newUdidValue: s(d.newUdidValue),
      status: 'New',
    };

    const cells = Object.keys(map)
      .filter((k) => map[k] !== '')
      .map((k) => ({ columnId: COL[k], value: map[k] }));

    const r = await fetch(`https://api.smartsheet.com/2.0/sheets/${SHEET_ID}/rows`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ toBottom: true, cells }]),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.message || 'Smartsheet write failed' });
    return res.status(200).json({ success: true, rowId: data.result && data.result[0] && data.result[0].id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
