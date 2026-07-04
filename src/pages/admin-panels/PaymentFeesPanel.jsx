/**
 * PaymentFeesPanel — Admin view of Paystack fee pass-through calculator.
 * Shows exactly what each book costs the customer per payment method,
 * and lets admin verify the reverse-pricing math at a glance.
 */
import { useState } from 'react';

// ── Fee constants (must match Cart.jsx) ──────────────────────────────────────
const PAYSTACK_FEES = {
  mpesa:     { rate: 0.015, label: 'M-Pesa',                     color: '#2ecc71' },
  card:      { rate: 0.029, label: 'Local Card / Bank',          color: '#4a9eff' },
  intl_card: { rate: 0.038, label: 'International / Apple Pay',  color: '#c9a84c' },
};

function calcGross(netKes, rateKey) {
  const rate = PAYSTACK_FEES[rateKey].rate;
  const grossCents = Math.ceil((netKes / (1 - rate)) * 100);
  const grossKes   = grossCents / 100;
  const feeKes     = +(grossKes - netKes).toFixed(2);
  return { grossKes, feeKes, grossCents };
}

// ── Single-book calculator ────────────────────────────────────────────────────
function SingleCalc() {
  const [price, setPrice] = useState(350);

  return (
    <div className="card" style={{ padding: '24px 28px' }}>
      <h3 style={{ marginBottom: 6, fontSize: '1rem' }}>Book Price Calculator</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: 20 }}>
        Enter any book price to see exactly what the customer pays per method.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Book price (KSh)</label>
        <input
          type="number"
          min={1}
          value={price}
          onChange={e => setPrice(Math.max(1, Number(e.target.value)))}
          style={{
            width: 120, padding: '8px 12px', borderRadius: 'var(--r-sm)',
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dim)',
            color: 'var(--text)', fontSize: '1rem', fontWeight: 700,
          }}
        />
        <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>→ your net payout</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {Object.entries(PAYSTACK_FEES).map(([key, meta]) => {
          const { grossKes, feeKes } = calcGross(price, key);
          return (
            <div key={key} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${meta.color}30`,
              borderLeft: `3px solid ${meta.color}`,
              borderRadius: 'var(--r-sm)',
              padding: '16px 18px',
            }}>
              <div style={{ fontSize: '0.78rem', color: meta.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                {meta.label} &nbsp;{(meta.rate * 100).toFixed(1)}%
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Book price</span><span>KSh {price.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Processing fee</span><span>KSh {feeKes.toFixed(2)}</span>
                </div>
                <div style={{ height: 1, background: 'var(--dim)', margin: '2px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span style={{ color: 'var(--text)' }}>Customer pays</span>
                  <span style={{ color: meta.color, fontSize: '1.05rem' }}>KSh {grossKes.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ok)', fontSize: '0.78rem' }}>
                  <span>You receive</span><span>KSh {price.toFixed(2)} ✓</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cart simulator — multiple books ──────────────────────────────────────────
function CartSimulator() {
  const [items, setItems] = useState([350, 799]);
  const [newPrice, setNewPrice] = useState('');

  const total = items.reduce((s, p) => s + p, 0);

  const addItem  = () => {
    const p = Math.max(1, Number(newPrice));
    if (!p) return;
    setItems(prev => [...prev, p]);
    setNewPrice('');
  };
  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="card" style={{ padding: '24px 28px' }}>
      <h3 style={{ marginBottom: 6, fontSize: '1rem' }}>Cart Total Simulator</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: 20 }}>
        Add multiple books to simulate a real cart and see total charges per method.
      </p>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {items.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r-sm)', border: '1px solid var(--dim)', fontSize: '0.85rem' }}>
            <span style={{ flex: 1, color: 'var(--muted)' }}>Book {i + 1}</span>
            <span style={{ fontWeight: 600, color: 'var(--text)', minWidth: 80 }}>KSh {p.toLocaleString()}</span>
            <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: '0.9rem', padding: '0 4px' }}>✕</button>
          </div>
        ))}
      </div>

      {/* Add item */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          type="number" min={1} placeholder="Price (KSh)"
          value={newPrice} onChange={e => setNewPrice(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-sm)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dim)', color: 'var(--text)', fontSize: '0.9rem' }}
        />
        <button className="btn btn-primary btn-sm" onClick={addItem}>+ Add Book</button>
      </div>

      {/* Totals per method */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--r-sm)', border: '1px solid var(--dim)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 14px', borderBottom: '1px solid var(--dim)', fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          <span>Payment Method</span><span style={{ textAlign: 'right' }}>Your Net</span><span style={{ textAlign: 'right' }}>Fee</span><span style={{ textAlign: 'right' }}>Customer Pays</span>
        </div>
        {Object.entries(PAYSTACK_FEES).map(([key, meta]) => {
          const { grossKes, feeKes } = calcGross(total, key);
          return (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.87rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                {meta.label}
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>({(meta.rate * 100).toFixed(1)}%)</span>
              </span>
              <span style={{ textAlign: 'right', color: 'var(--ok)', fontWeight: 600, fontSize: '0.87rem' }}>KSh {total.toFixed(2)}</span>
              <span style={{ textAlign: 'right', color: 'var(--muted)', fontSize: '0.85rem' }}>KSh {feeKes.toFixed(2)}</span>
              <span style={{ textAlign: 'right', color: meta.color, fontWeight: 700, fontSize: '0.95rem' }}>KSh {grossKes.toFixed(2)}</span>
            </div>
          );
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 14px', background: 'rgba(201,168,76,0.05)', fontSize: '0.78rem', color: 'var(--muted)' }}>
          <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{items.length} book{items.length !== 1 ? 's' : ''} in cart</span>
          <span style={{ textAlign: 'right', color: 'var(--gold)', fontWeight: 600 }}>KSh {total.toFixed(2)}</span>
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

// ── How it works explainer ────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <div className="card" style={{ padding: '24px 28px' }}>
      <h3 style={{ marginBottom: 6, fontSize: '1rem' }}>How It Works</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: 16, lineHeight: 1.7 }}>
        When a customer picks a payment method at checkout, the app automatically calculates a gross amount
        using the <strong style={{ color: 'var(--text)' }}>reverse-pricing formula</strong> so that after
        Paystack deducts its fee, you receive exactly the book's listed price.
      </p>

      <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 'var(--r-sm)', padding: '14px 18px', marginBottom: 16, fontFamily: 'monospace', fontSize: '0.88rem', color: 'var(--text)' }}>
        Customer charge = Book Price ÷ (1 − Fee Rate)
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 10 }}>
        {Object.entries(PAYSTACK_FEES).map(([key, meta]) => (
          <div key={key} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r-sm)', border: '1px solid var(--dim)', fontSize: '0.82rem' }}>
            <div style={{ color: meta.color, fontWeight: 700, marginBottom: 4 }}>{meta.label}</div>
            <div style={{ color: 'var(--muted)' }}>Rate: <strong style={{ color: 'var(--text)' }}>{(meta.rate * 100).toFixed(1)}%</strong></div>
            <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: 4 }}>
              e.g. KSh 350 → KSh {calcGross(350, key).grossKes.toFixed(2)} charged
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(46,204,113,0.07)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 'var(--r-sm)', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
        ✅ <strong style={{ color: 'var(--ok)' }}>Customer-facing label:</strong> the checkout only shows
        "Pay with M-Pesa — KSh X" with no mention of fees or Paystack.
        The math runs silently in the background.
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function PaymentFeesPanel() {
  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Payment Fee Calculator</h1>
          <span className="adm-page-sub">
            See exactly what customers are charged so you always net the full book price
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <HowItWorks />
        <SingleCalc />
        <CartSimulator />
      </div>
    </div>
  );
}
