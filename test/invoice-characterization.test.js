const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

test('invoice uses the checkout HSN slab calculation', () => {
  const items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  const checkout = pricing.computeTotals(items, '');
  const printedInvoice = invoice.computeInvoiceFigures({ items, coupon: '' });

  assert.deepEqual(
    { tax: checkout.tax, total: checkout.total },
    { tax: 5, total: 105 }
  );
  assert.deepEqual(
    { tax: printedInvoice.tax, total: printedInvoice.total, gstPercent: printedInvoice.rows[0].gstPercent },
    { tax: 5, total: 105, gstPercent: 5 }
  );
});

test('invoice applies the SAVE10 cap and taxes the post-discount taxable value', () => {
  const items = [{ id: 2, name: 'Groundnut oil', hsn: '1508', price: 2240, qty: 1 }];
  const checkout = pricing.computeTotals(items, 'SAVE10');
  const printedInvoice = invoice.computeInvoiceFigures({ items, coupon: 'SAVE10' });

  assert.deepEqual(
    { subtotal: checkout.subtotal, discount: checkout.discount, tax: checkout.tax, total: checkout.total },
    { subtotal: 2240, discount: 150, tax: 104.5, total: 2194.5 }
  );
  assert.deepEqual(
    {
      subtotal: printedInvoice.subtotal,
      discount: printedInvoice.discount,
      tax: printedInvoice.tax,
      cgst: printedInvoice.cgst,
      sgst: printedInvoice.sgst,
      total: printedInvoice.total,
      lineTax: printedInvoice.rows[0].lineTax,
      gstPercent: printedInvoice.rows[0].gstPercent
    },
    {
      subtotal: 2240,
      discount: 150,
      tax: 104.5,
      cgst: 52.25,
      sgst: 52.25,
      total: 2194.5,
      lineTax: 104.5,
      gstPercent: 5
    }
  );
});

test('reconciliation matches checkout figures and skips cancelled orders', () => {
  const items = [{ id: 3, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  const checkout = pricing.computeTotals(items, '');
  const db = {
    orders: [
      {
        id: 101,
        date: '2022-01-05',
        customer: 'Anil Kulkarni',
        items,
        coupon: '',
        subtotal: checkout.subtotal,
        discount: checkout.discount,
        tax: checkout.tax,
        total: checkout.total
      },
      {
        id: 102,
        date: '2022-01-06',
        customer: 'Groundnut buyer',
        items: [{ id: 4, name: 'Groundnut oil', hsn: '1508', price: 2240, qty: 1 }],
        coupon: 'SAVE10',
        subtotal: 2240,
        discount: 150,
        tax: 104.5,
        total: 2194.5
      },
      {
        id: 103,
        date: '2022-01-07',
        customer: 'Tea buyer',
        items: [{ id: 5, name: 'Tea', hsn: '0902', price: 100, qty: 1 }],
        coupon: '',
        subtotal: 100,
        discount: 0,
        tax: 18,
        total: 118
      },
      {
        id: 104,
        date: '2022-01-08',
        status: 'cancelled',
        items,
        coupon: '',
        subtotal: 100,
        discount: 0,
        tax: 5,
        total: 105
      }
    ]
  };

  const result = reports.getGstReconciliation(db);

  assert.equal(result.totalChecked, 3);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.deepEqual(result.rows.map((row) => [row.orderId, row.matched]), [
    [101, true],
    [102, true],
    [103, true]
  ]);
  assert.deepEqual(
    { ledgerTax: result.rows[1].ledgerTax, invoiceTax: result.rows[1].invoiceTax, ledgerTotal: result.rows[1].ledgerTotal, invoiceTotal: result.rows[1].invoiceTotal },
    { ledgerTax: 104.5, invoiceTax: 104.5, ledgerTotal: 2194.5, invoiceTotal: 2194.5 }
  );
});
