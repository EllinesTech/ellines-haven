import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, callStkPush } from '../firebase';
import './Cart.css';

// ── STK Push polling screen ────────────────────────────────────────────────────
function StkWaiting({ order, onSuccess, onFailed, onCancel }) {
  const [status, setStatus]     = useState('waiting'); // waiting | success | failed | timeout
  const [mpesaCode, setMpesaCode] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!order?.id) return;

    // Real-time listener on the order doc — fires the moment callback updates it
    const unsub = onSnapshot(doc(db, 'orders', order.id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      if (data.status === 'Completed') {
        setMpesaCode(data.mpesaTransactionId || '');
        setStatus('success');
        clearTimeout(timeoutRef.current);
        setTimeout(() => onSuccess(data), 1800);
      } else if (data.status === 'PaymentFailed') {
        setStatus('failed');
        clearTimeout(timeoutRef.current);
      }
    });

    // 3-minute timeout — STK push expires after 2 mins on Safaricom's side
    timeoutRef.current = setTimeout(() => {
      setStatus('timeout');
      unsub();
    }, 3 * 60 * 1000);

    return () => { unsub(); clearTimeout(timeoutRef.current); };
  }, [order?.id]); // eslint-disable-line

  if (status === 'success') return (
    <div className="done-box" style={{ textAlign:'center', padding:'40px 20px' }}>
      <div className="done-box__check" style={{ background:'var(--ok)' }}>✓</div>
      <h2 style={{ color:'var(--ok)' }}>Payment Confirmed!</h2>
      <p>M-Pesa transaction: <strong style={{ color:'var(--gold)' }}>{mpesaCode}</strong></p>
      <p style={{ color:'var(--muted)', fontSize:'.88rem', marginTop:8 }}>
        Your books are being unlocked…
      </p>
    </div>
  );

  if (status === 'failed') return (
    <div className="done-box" style={{ textAlign:'center', padding:'40px 20px' }}>
      <div className="done-box__check" style={{ background:'var(--err)', fontSize:'2rem' }}>✕</div>
      <h2 style={{ color:'var(--err)' }}>Payment Failed</h2>
      <p style={{ color:'var(--muted)' }}>
        The payment was declined or cancelled. Please try again.
      </p>
      <button className="btn btn-primary" style={{ marginTop:20 }} onClick={onFailed}>Try Again</button>
    </div>
  );

  if (status === 'timeout') return (
    <div className="done-box" style={{ textAlign:'center', padding:'40px 20px' }}>
      <div style={{ fontSize:'3rem', marginBottom:16 }}>⏱</div>
      <h2>Request Timed Out</h2>
      <p style={{ color:'var(--muted)' }}>
        No response received. If you already paid, contact us with your M-Pesa code.
      </p>
      <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:20 }}>
        <button className="btn btn-primary" onClick={onFailed}>Try Again</button>
        <button className="btn btn-ghost" onClick={onCancel}>Back to Cart</button>
      </div>
    </div>
  );

  // ── Waiting for customer to approve on phone ──
  return (
    <div className="done-box" style={{ textAlign:'center', padding:'40px 20px' }}>
      <div style={{ fontSize:'3.5rem', marginBottom:16, animation:'pulse 1.5s infinite' }}>📱</div>
      <h2>Check Your Phone</h2>
      <p style={{ color:'var(--muted)', maxWidth:380, margin:'0 auto 16px' }}>
        An M-Pesa payment prompt has been sent to your phone.
        Enter your <strong>M-Pesa PIN</strong> to complete the payment.
      </p>
      <div style={{
        background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.25)',
        borderRadius:'var(--r-sm)', padding:'14px 20px', marginBottom:20,
        display:'inline-block', minWidth:220,
      }}>
        <div style={{ fontSize:'1.5rem', fontWeight:700, color:'var(--gold)' }}>
          KSh {order?.total?.toLocaleString()}
        </div>
        <div style={{ fontSize:'0.8rem', color:'var(--muted)', marginTop:4 }}>
          Order {order?.id}
        </div>
      </div>
      <p style={{ color:'var(--muted)', fontSize:'.82rem', marginBottom:20 }}>
        Waiting for confirmation… <span style={{ animation:'pulse 1s infinite', display:'inline-block' }}>●</span>
      </p>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ── Main Cart component ────────────────────────────────────────────────────────
export default function Cart() {
  const { cart, removeFromCart, clearCart, user, placeOrder, settings, myPerms, siteControls } = useApp();
  // steps: cart | pay | stk_waiting | pending | done
  const [step,        setStep]        = useState('cart');
  const [method,      setMethod]      = useState('mpesa');
  const [phone,       setPhone]       = useState('');
  const [ref,         setRef]         = useState('');
  const [busy,        setBusy]        = useState(false);
  const [stkError,    setStkError]    = useState('');
  const [placedOrder, setPlacedOrder] = useState(null);
  const navigate = useNavigate();
  const total = cart.reduce((s, b) => s + b.price, 0);

  const methods      = settings.payMethods || ['mpesa', 'airtel', 'card'];
  const methodLabels = { mpesa: 'M-Pesa', airtel: 'Airtel Money', card: 'Card' };

  // ── Permission / site-control gates ─────────────────────────────────────
  if (user && myPerms?.canPurchase === false) return (
    <main style={{ minHeight:'60vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40, textAlign:'center' }}>
      <div style={{ fontSize:'3rem' }}>🔒</div>
      <h2>Purchasing Restricted</h2>
      <p style={{ color:'var(--muted)' }}>You don't have permission to make purchases. Contact support.</p>
      <Link to="/library" className="btn btn-primary">Browse Books</Link>
    </main>
  );

  if (siteControls?.disableOrders) return (
    <main style={{ minHeight:'60vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40, textAlign:'center' }}>
      <div style={{ fontSize:'3rem' }}>🛒</div>
      <h2>Orders Temporarily Disabled</h2>
      <p style={{ color:'var(--muted)' }}>We are not accepting orders right now. Please check back soon.</p>
      <Link to="/library" className="btn btn-primary">Browse Books</Link>
    </main>
  );

  const checkout = () => { if (!user) navigate('/login'); else setStep('pay'); };

  // ── M-Pesa STK Push flow ─────────────────────────────────────────────────
  const submitStkPush = async e => {
    e.preventDefault();
    setStkError('');
    setBusy(true);
    try {
      // 1. Create the order in Firestore (status: Pending)
      const order = await placeOrder([...cart], 'mpesa_stk', '', phone);
      setPlacedOrder(order);

      // 2. Trigger STK push via Cloud Function
      await callStkPush({
        phone,
        amount: total,
        orderId: order.id,
        userEmail: user.email,
        bookIds: cart.map(b => b.id),
      });

      // 3. Move to waiting screen — real-time listener handles the rest
      clearCart();
      setStep('stk_waiting');
    } catch (err) {
      // Extract the real error message from Firebase Functions error
      const msg = err?.details || err?.message || err?.code || JSON.stringify(err);
      setStkError(msg || 'Could not send payment request. Try again.');
      console.error('[Cart] stkPush error:', err);
    } finally {
      setBusy(false);
    }
  };

  // ── Manual reference flow (Airtel / fallback) ────────────────────────────
  const submitManual = async e => {
    e.preventDefault();
    setBusy(true);
    await new Promise(r => setTimeout(r, 400));
    const order = await placeOrder([...cart], method, ref, phone);
    setPlacedOrder(order);
    clearCart();
    setBusy(false);
    setStep('pending');
  };

  // ── STK Waiting screen ───────────────────────────────────────────────────
  if (step === 'stk_waiting') return (
    <main className="cart-page">
      <div className="container" style={{ maxWidth:520, margin:'60px auto' }}>
        <StkWaiting
          order={placedOrder}
          onSuccess={() => navigate('/my-library')}
          onFailed={() => { setStep('pay'); setMethod('mpesa'); }}
          onCancel={() => navigate('/my-library')}
        />
      </div>
    </main>
  );

  // ── Done screen (after auto-confirm) ────────────────────────────────────
  if (step === 'done') return (
    <main className="cart-page">
      <div className="container">
        <div className="done-box">
          <div className="done-box__check">✓</div>
          <h2>Books Unlocked!</h2>
          <p>Your payment was confirmed and your books are ready to read.</p>
          <div style={{ display:'flex', gap:'12px', justifyContent:'center', marginTop:'28px' }}>
            <Link to="/my-library" className="btn btn-primary">Go to My Library</Link>
            <Link to="/library" className="btn btn-outline">Browse More</Link>
          </div>
        </div>
      </div>
    </main>
  );

  // ── Pending screen (manual methods) ─────────────────────────────────────
  if (step === 'pending') return (
    <main className="cart-page">
      <div className="container">
        <div className="done-box">
          <div className="done-box__check pending-icon">!</div>
          <h2>Payment Submitted</h2>
          <p>Your order <strong style={{ color: 'var(--gold)' }}>{placedOrder?.id}</strong> is pending confirmation.</p>
          <div className="pending-info card">
            <div className="pending-row"><span>Amount</span><strong>KSh {placedOrder?.total?.toLocaleString()}</strong></div>
            <div className="pending-row"><span>Method</span><strong>{methodLabels[placedOrder?.method] || placedOrder?.method}</strong></div>
            {placedOrder?.ref && <div className="pending-row"><span>Transaction Code</span><strong style={{ color:'var(--gold)' }}>{placedOrder?.ref}</strong></div>}
            <div className="pending-row"><span>Status</span><span className="adm-status adm-status--pending">Pending Verification</span></div>
          </div>
          <p style={{ color:'var(--muted)', fontSize:'.88rem', maxWidth:420, margin:'16px auto 0' }}>
            Once our team verifies your payment, your books will be unlocked automatically.
          </p>
          <div className="cart-wa-alt">
            <p>Speed it up via WhatsApp:</p>
            <a href={`https://wa.me/254748255466?text=${encodeURIComponent('Hi! Order ' + (placedOrder?.id||'') + ' — KSh ' + (placedOrder?.total||'') + '. Code: ' + (placedOrder?.ref||'N/A'))}`}
              target="_blank" rel="noopener noreferrer" className="btn btn-wa">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Confirm via WhatsApp
            </a>
          </div>
          <div style={{ display:'flex', gap:'12px', justifyContent:'center', marginTop:'28px' }}>
            <Link to="/my-library" className="btn btn-primary">Go to My Library</Link>
            <Link to="/library" className="btn btn-outline">Browse More</Link>
          </div>
        </div>
      </div>
    </main>
  );

  // ── Payment screen ───────────────────────────────────────────────────────
  if (step === 'pay') return (
    <main className="cart-page">
      <div className="page-header"><div className="container"><h1>Checkout</h1></div></div>
      <div className="container">
        <div className="pay-layout">
          <div className="pay-form card">
            <h3>Choose Payment Method</h3>
            <div className="pay-methods">
              {methods.map(v => (
                <button key={v} className={'pay-btn' + (method === v ? ' pay-btn--on' : '')} onClick={() => { setMethod(v); setStkError(''); }}>
                  {methodLabels[v] || v}
                </button>
              ))}
            </div>

            {/* ── M-Pesa: STK Push (automatic) ── */}
            {method === 'mpesa' && (
              <form onSubmit={submitStkPush}>
                <div className="pay-mpesa-box">
                  <div style={{
                    background:'rgba(46,204,113,0.08)', border:'1px solid rgba(46,204,113,0.25)',
                    borderLeft:'3px solid var(--ok)', borderRadius:'var(--r-sm)',
                    padding:'10px 14px', marginBottom:16, fontSize:'0.83rem',
                  }}>
                    ⚡ <strong style={{ color:'var(--ok)' }}>Instant payment</strong> — you'll get an M-Pesa prompt on your phone. Enter your PIN and books unlock automatically.
                  </div>
                  <div className="pay-detail-row"><span>Amount</span><strong className="pay-highlight">KSh {total.toLocaleString()}</strong></div>
                  <div className="pay-detail-row"><span>Business</span><strong>{settings.mpesaName || 'Ellines Haven'}</strong></div>
                  <div className="form-group" style={{ marginTop:16 }}>
                    <label>Your M-Pesa Phone Number *</label>
                    <input className="field" placeholder="07XX XXX XXX" value={phone}
                      onChange={e => setPhone(e.target.value)} required />
                    <small>The prompt will be sent to this number</small>
                  </div>
                  {stkError && (
                    <div style={{ background:'rgba(231,76,60,0.08)', border:'1px solid rgba(231,76,60,0.3)', borderRadius:'var(--r-sm)', padding:'10px 14px', marginTop:12, fontSize:'0.83rem', color:'#e74c3c' }}>
                      ⚠ {stkError}
                    </div>
                  )}
                </div>
                <div className="pay-total"><span>Total</span><strong>KSh {total.toLocaleString()}</strong></div>
                <button type="submit" className="btn btn-primary" style={{ width:'100%' }} disabled={busy}>
                  {busy ? 'Sending prompt…' : '📱 Pay Now with M-Pesa'}
                </button>
                <div className="pay-wa-divider"><span>or</span></div>
                <a href={`https://wa.me/254748255466?text=${encodeURIComponent('Hi! I\'d like to order:\n' + cart.map(b => `• ${b.title} — KSh ${b.price}`).join('\n') + `\n\nTotal: KSh ${total}`)}`}
                  target="_blank" rel="noopener noreferrer" className="btn btn-wa" style={{ width:'100%' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Order via WhatsApp instead
                </a>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop:12, width:'100%' }} onClick={() => setStep('cart')}>Back to Cart</button>
              </form>
            )}

            {/* ── Airtel Money (manual reference) ── */}
            {method === 'airtel' && (
              <form onSubmit={submitManual}>
                <div className="pay-mpesa-box">
                  <p className="pay-instruction">Send via <strong>Airtel Money</strong></p>
                  <div className="pay-detail-row"><span>Send to</span><strong className="pay-highlight">{settings.airtelNum || 'Contact us for Airtel number'}</strong></div>
                  <div className="pay-detail-row"><span>Amount</span><strong className="pay-highlight">KSh {total.toLocaleString()}</strong></div>
                  <div className="form-group" style={{ marginTop:16 }}>
                    <label>Your Airtel Number</label>
                    <input className="field" placeholder="073X XXX XXX" value={phone} onChange={e => setPhone(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ marginTop:12 }}>
                    <label>Transaction Reference *</label>
                    <input className="field" placeholder="Airtel transaction code" value={ref} onChange={e => setRef(e.target.value.toUpperCase())} required style={{ textTransform:'uppercase', letterSpacing:2, fontWeight:600 }} />
                  </div>
                </div>
                <div className="pay-total"><span>Total</span><strong>KSh {total.toLocaleString()}</strong></div>
                <button type="submit" className="btn btn-primary" style={{ width:'100%' }} disabled={busy}>{busy ? 'Submitting…' : 'Submit Payment'}</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop:12, width:'100%' }} onClick={() => setStep('cart')}>Back to Cart</button>
              </form>
            )}

            {/* ── Card (not yet live) ── */}
            {method === 'card' && (
              <div className="pay-mpesa-box">
                <div className="adm-info-note" style={{ marginBottom:16 }}>Card payments require backend integration. Please use M-Pesa or contact us.</div>
                <div className="form-group" style={{ marginBottom:14 }}><label>Card Number</label><input className="field" placeholder="1234 5678 9012 3456" disabled /></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div className="form-group"><label>Expiry</label><input className="field" placeholder="MM/YY" disabled /></div>
                  <div className="form-group"><label>CVV</label><input className="field" placeholder="123" disabled /></div>
                </div>
                <button className="btn btn-primary" style={{ width:'100%', marginTop:16 }} disabled>Card payments coming soon</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop:12, width:'100%' }} onClick={() => setStep('cart')}>Back to Cart</button>
              </div>
            )}
          </div>

          <div className="pay-summary card">
            <h3>Order Summary</h3>
            {cart.map(b => (
              <div key={b.id} className="pay-item">
                <img src={b.cover || '/logo-icon.png'} alt={b.title} />
                <div><strong>{b.title}</strong><span>KSh {b.price}</span></div>
              </div>
            ))}
            <div className="pay-total"><span>{cart.length} item{cart.length !== 1 ? 's' : ''}</span><strong>KSh {total.toLocaleString()}</strong></div>
            <div className="pay-trust">
              {method === 'mpesa'
                ? <><span>⚡ Books unlock instantly after M-Pesa payment</span><span>No waiting — fully automatic</span></>
                : <><span>Books unlock after payment is verified</span><span>Usually within minutes during business hours</span></>
              }
            </div>
          </div>
        </div>
      </div>
    </main>
  );

  // ── Cart screen ──────────────────────────────────────────────────────────
  return (
    <main className="cart-page">
      <div className="page-header"><div className="container"><h1>Your Cart</h1><p>{cart.length} item{cart.length !== 1 ? 's' : ''}</p></div></div>
      <div className="container">
        {cart.length === 0
          ? <div className="cart-empty">
              <div className="cart-empty__icon">&#128722;</div>
              <h3>Your cart is empty</h3>
              <p>Add some books to get started.</p>
              <Link to="/library" className="btn btn-primary">Browse Books</Link>
            </div>
          : <div className="cart-layout">
              <div className="cart-items">
                {cart.map(b => (
                  <div key={b.id} className="cart-item card">
                    <img src={b.cover || '/logo-icon.png'} alt={b.title} className="cart-item__img" />
                    <div className="cart-item__info">
                      <span className="cart-item__genre">{b.genre}</span>
                      <h3><Link to={`/book/${b.id}`}>{b.title}</Link></h3>
                      <p>by {b.author}</p>
                      <p style={{ color:'var(--muted)', fontSize:'.78rem' }}>{b.pages} pages · {b.readTime}</p>
                    </div>
                    <div className="cart-item__right">
                      <div className="cart-item__price">KSh {b.price.toLocaleString()}</div>
                      <button className="cart-item__rm" onClick={() => removeFromCart(b.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cart-sum card">
                <h3>Summary</h3>
                {cart.map(b => (
                  <div key={b.id} className="cart-sum__row">
                    <span>{b.title.length > 24 ? b.title.slice(0,24)+'...' : b.title}</span>
                    <span>KSh {b.price}</span>
                  </div>
                ))}
                <div className="cart-sum__total"><span>Total</span><strong>KSh {total.toLocaleString()}</strong></div>
                <button className="btn btn-primary" style={{ width:'100%' }} onClick={checkout}>Proceed to Checkout</button>
                {!user && <p className="cart-sum__note">You need to sign in to complete purchase.</p>}
              </div>
            </div>
        }
      </div>
    </main>
  );
}
