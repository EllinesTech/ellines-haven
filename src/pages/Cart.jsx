import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, onSnapshot, updateDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, callVerifyPaystack, callCreatePayPalOrder, callCapturePayPalOrder } from '../firebase';
import EditableField from '../components/EditableField';
import { useEditMode } from '../context/EditModeContext';
import { bookPath } from '../utils/slugify';
import { usePageMeta } from '../hooks/usePageMeta';
import './Cart.css';

// Paystack public key — loaded from environment variables
// DO NOT hardcode API keys in source code
const PAYSTACK_PUBLIC_KEY = __PAYSTACK_KEY__;

// ── Paystack fee pass-through (customer bears the cost) ───────────────────────
// Reverse-pricing formula: grossAmount = netPayout / (1 - feePercent)
// This ensures that after Paystack deducts its fee, you receive exactly the book price.
const PAYSTACK_FEES = {
  mpesa:      0.015,  // 1.5%  — M-Pesa via Paystack
  card:       0.029,  // 2.9%  — Local Visa / Mastercard / bank
  intl_card:  0.038,  // 3.8%  — International cards + Apple Pay
};

/**
 * Returns the integer amount (in KES cents) to pass to Paystack so that,
 * after Paystack deducts its fee, you net exactly `desiredNetKes`.
 */
function calcPaystackAmount(desiredNetKes, channel) {
  const feePercent = PAYSTACK_FEES[channel] ?? PAYSTACK_FEES.card;
  const grossKes   = desiredNetKes / (1 - feePercent);
  return Math.ceil(grossKes * 100); // integer subunits
}

const CHANNEL_LABELS = {
  mpesa:     { label: 'M-Pesa',                    fee: '1.5%' },
  card:      { label: 'Local Card / Bank',          fee: '2.9%' },
  intl_card: { label: 'International Card / Apple Pay', fee: '3.8%' },
};
// Load Paystack inline script once and wait for it to be ready
function loadPaystack() {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop?.setup) { resolve(); return; }
    // Remove any stale script tag
    const existing = document.querySelector('script[src*="paystack"]');
    if (existing) existing.remove();
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.async = true;
    s.onload = () => {
      // Give it a tick to initialize
      setTimeout(resolve, 100);
    };
    s.onerror = () => reject(new Error('Failed to load Paystack script'));
    document.head.appendChild(s);
  });
}

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
        // Notify user in their own feed
        import('../utils/userNotifier').then(({ notifyBooksUnlocked }) => {
          notifyBooksUnlocked(order?.userEmail || '', order?.items || [], order?.id || '');
        }).catch(() => {});
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
      <div className="done-box__check pending-icon">⏱</div>
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
    <div className="done-box cart-stk-wait">
      <div className="cart-stk-wait__pulse" aria-hidden="true" />
      <h2>Check Your Phone</h2>
      <p className="cart-stk-wait__lede">
        An M-Pesa payment prompt has been sent to your phone.
        Enter your <strong>M-Pesa PIN</strong> to complete the payment.
      </p>
      <div className="cart-stk-wait__amount">
        <div className="cart-stk-wait__kes">
          KSh {order?.total?.toLocaleString()}
        </div>
        <div className="cart-stk-wait__order">
          Order {order?.id}
        </div>
      </div>
      <p className="cart-stk-wait__status">
        Waiting for confirmation… <span className="cart-stk-wait__dot" aria-hidden="true">●</span>
      </p>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ── Notify admin of payment issue (cancel / failure) ──────────────────────────
async function notifyAdminPaymentIssue(order, reason, paystackRef) {
  try {
    await setDoc(doc(db, 'admin_notifications', (order?.id || 'unk') + '_issue_' + Date.now()), {
      type:        'payment_issue',
      orderId:     order?.id,
      userName:    order?.userName,
      userEmail:   order?.userEmail,
      total:       order?.total,
      reason,
      paystackRef: paystackRef || null,
      status:      'unread',
      createdAt:   serverTimestamp(),
    });
  } catch {}
}

// ── VerifyingScreen — listens to Firestore + retries server verify ───────────
// Unlock happens only in Cloud Functions (verifyPaystackPayment / webhook).
function VerifyingScreen({ orderId, paystackRef, userEmail, onDone, onGiveUp }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!orderId) return;
    let stopped = false;

    const unsub = onSnapshot(doc(db, 'orders', orderId), (snap) => {
      if (!snap.exists() || stopped) return;
      if (snap.data().status === 'Completed') {
        stopped = true;
        onDone();
      }
    });

    const timer = setInterval(() => setElapsed(s => s + 1), 1000);

    // Periodically re-call verify so Haven unlocks even when the hub webhook
    // (ellines.co.ke) is the only Paystack webhook URL.
    let verifyAttempts = 0;
    const verifyTimer = setInterval(async () => {
      if (stopped || !paystackRef || !userEmail) return;
      verifyAttempts += 1;
      if (verifyAttempts > 12) return; // ~60s of retries
      try {
        await callVerifyPaystack({
          reference: paystackRef,
          orderId,
          userEmail,
        });
        // Success → onSnapshot will flip to Completed; also finish here
        if (!stopped) {
          stopped = true;
          onDone();
        }
      } catch {
        /* pending / network — keep waiting */
      }
    }, 5000);

    const giveUp = setTimeout(() => {
      if (!stopped && onGiveUp) onGiveUp();
    }, 90_000);

    return () => {
      stopped = true;
      unsub();
      clearInterval(timer);
      clearInterval(verifyTimer);
      clearTimeout(giveUp);
    };
  }, [orderId, paystackRef, userEmail, onDone, onGiveUp]);

  const dots = '.'.repeat((elapsed % 3) + 1);

  return (
    <main className="cart-page">
      <div className="cart-status-screen">
        <div className="cart-status-screen__spinner" aria-hidden="true" />
        <h2>Confirming Payment{dots}</h2>
        <p>
          Your payment is being processed. For M-Pesa this can take up to 30 seconds after entering your PIN.
        </p>
        <p className="cart-status-screen__hint">
          {elapsed < 10 ? 'Waiting for confirmation…' :
           elapsed < 20 ? 'Still waiting — M-Pesa is processing…' :
           elapsed < 35 ? 'Almost there — confirming with Paystack…' :
           'This is taking a bit longer than usual. Your books will unlock automatically — you can also retry from My Library → Orders.'}
        </p>
      </div>
    </main>
  );
}

// ── Main Cart component ────────────────────────────────────────────────────────
export default function Cart() {
  const { cart, removeFromCart, clearCart, user, placeOrder, settings, myPerms, siteControls, applyReferralDiscount } = useApp();
  
  usePageMeta({
    title: 'Cart',
    description: 'Review your cart and complete your purchase securely with M-Pesa, card, or PayPal — lifetime access to books.',
  });

  // steps: cart | pay | stk_waiting | pending | done | verifying | paypal_modal
  const [step,             setStep]            = useState('cart');
  const [method,           setMethod]          = useState('paystack');
  const [paystackChannel,  setPaystackChannel] = useState('mpesa'); // mpesa | card | intl_card
  const [phone,            setPhone]           = useState('');
  const [ref,              setRef]             = useState('');
  const [busy,             setBusy]            = useState(false);
  const [stkError,         setStkError]        = useState('');
  const [placedOrder,      setPlacedOrder]     = useState(null);
  const [verifyRef,        setVerifyRef]       = useState(null); // paystack ref while verifying
  const [cancelledNotice,  setCancelledNotice] = useState('');
  const [refundAcked,      setRefundAcked]     = useState(false); // no-refund acknowledgement
  const navigate = useNavigate();
  const total = cart.reduce((s, b) => s + b.price, 0);

  // ── Promo code — declared BEFORE the referral useEffect that reads it ───
  const [promoInput,     setPromoInput]     = useState('');
  const [promoApplied,   setPromoApplied]   = useState(null); // { code, type, discountValue }
  const [promoError,     setPromoError]     = useState('');
  const [promoChecking,  setPromoChecking]  = useState(false);

  // ── Auto-apply referral code from URL param ──────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode && !promoApplied) {
      // Auto-apply referral code as a promo discount
      (async () => {
        try {
          const result = await applyReferralDiscount(refCode);
          if (result.success) {
            // Create a promo-like entry for referral discount
            setPromoApplied({
              code: refCode,
              type: 'Referral',
              discountValue: Math.round(total * 0.1), // 10% for referral
              promoId: `referral_${refCode}`,
              referrerEmail: result.referrerEmail,
              referrerName: result.referrerName,
            });
            // Clean URL so referral code isn't re-applied on refresh
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch {}
      })();
    }
  }, [user]); // eslint-disable-line

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoError('');
    setPromoChecking(true);
    try {
      const snap = await getDoc(doc(db, 'site_data', 'promos'));
      const list  = snap.exists() ? (snap.data().list || []) : [];
      const found = list.find(p => p.code?.toUpperCase() === code && p.active);
      if (!found) { setPromoError('Invalid or expired promo code.'); setPromoChecking(false); return; }
      const today = new Date().toISOString().slice(0, 10);
      if (found.expires && found.expires < today) { setPromoError('This promo code has expired.'); setPromoChecking(false); return; }
      if (found.maxUses > 0 && found.uses >= found.maxUses) { setPromoError('This promo code has reached its usage limit.'); setPromoChecking(false); return; }

      // Calculate discount
      let discountValue = 0;
      if (found.type === 'Percentage') {
        const pct = parseFloat(found.discount);
        discountValue = Math.round((pct / 100) * total);
      } else {
        discountValue = parseFloat(found.discount) || 0;
      }
      discountValue = Math.min(discountValue, total); // can't discount more than total

      setPromoApplied({ code: found.code, type: found.type, rawDiscount: found.discount, discountValue, promoId: found.id });
    } catch {
      setPromoError('Could not verify promo code. Please try again.');
    }
    setPromoChecking(false);
  };

  const removePromo = () => { setPromoApplied(null); setPromoInput(''); setPromoError(''); };

  // Effective total after promo
  const discountAmount = promoApplied?.discountValue || 0;
  const effectiveTotal = Math.max(0, total - discountAmount);

  // ── Handle Paystack callback redirect (mobile payments) ──────────────────
  // Paystack redirects to /cart?trxref=ORD-xxx_yyy&reference=ORD-xxx_yyy
  // after the customer pays on mobile. We detect those params and auto-verify.
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference || !user) return;

    // Clean the URL so a refresh doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);

    setStep('verifying');

    // Look up the order by paystackRef in Firestore
    (async () => {
      try {
        const { getDocs, collection, query, where } = await import('firebase/firestore');
        const snap = await getDocs(
          query(collection(db, 'orders'), where('paystackRef', '==', reference))
        );

        const orderDoc   = snap.empty ? null : snap.docs[0];
        const orderId    = orderDoc?.id || null;
        const orderData  = orderDoc?.data() || {};

        // If webhook already completed it — go straight to done
        if (orderData.status === 'Completed') {
          clearCart();
          setStep('done');
          return;
        }

        if (!orderId) {
          setStkError('Could not find your order for this payment. Contact support with ref: ' + reference);
          setStep('pay');
          return;
        }

        setPlacedOrder({ id: orderId, ...orderData });
        setVerifyRef(reference);

        // Otherwise call verify function (server unlocks)
        try {
          await callVerifyPaystack({
            reference,
            orderId,
            userEmail: user.email,
          });
          clearCart();
          setStep('done');
        } catch (verifyErr) {
          // Verify failed — poll Firestore for up to 15 s in case the webhook
          // fires while we're waiting (race condition on mobile redirect flow)
          let confirmed = false;
          const { getDoc, doc: fsDoc } = await import('firebase/firestore');
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1500));
            try {
              const snap2 = await getDoc(fsDoc(db, 'orders', orderId));
              if (snap2.exists() && snap2.data().status === 'Completed') {
                confirmed = true;
                break;
              }
            } catch { /* keep polling */ }
          }
          if (confirmed) {
            clearCart();
            setStep('done');
          } else {
            // Stay on verifying so VerifyingScreen keeps retrying
            setStep('verifying');
          }
        }
      } catch {
        // Outer error (e.g. Firestore query failed) — show helpful message
        setStkError('Payment may have succeeded. If books are not in your library in a few minutes, contact support.');
        setStep('pay');
      }
    })();
  }, [user]); // eslint-disable-line

  const methodLabels = { mpesa: 'M-Pesa', airtel: 'Airtel Money', card: 'Card', paypal: 'PayPal' };

  // ── Permission / site-control gates ─────────────────────────────────────
  if (user && myPerms?.canPurchase === false) return (
    <main className="cart-page">
      <div className="cart-gate">
        <div className="cart-gate__icon" aria-hidden="true">!</div>
        <h2>Purchasing Restricted</h2>
        <p>You don't have permission to make purchases. Contact support.</p>
        <Link to="/library" className="btn btn-primary">Browse Books</Link>
      </div>
    </main>
  );

  if (siteControls?.disableOrders) return (
    <main className="cart-page">
      <div className="cart-gate">
        <div className="cart-gate__icon" aria-hidden="true">—</div>
        <h2>Orders Temporarily Disabled</h2>
        <p>We are not accepting orders right now. Please check back soon.</p>
        <Link to="/library" className="btn btn-primary">Browse Books</Link>
      </div>
    </main>
  );

  const checkout = () => {
    setCancelledNotice('');
    if (!user) navigate('/login'); else setStep('pay');
  };

  // ── Paystack payment flow ─────────────────────────────────────────────────
  const submitPaystack = async e => {
    e.preventDefault();
    setStkError('');
    setBusy(true);
    try {
      await loadPaystack();

      // Calculate gross amount so customer bears the Paystack fee
      const paystackAmountCents = calcPaystackAmount(effectiveTotal, paystackChannel);
      const grossKes = paystackAmountCents / 100;
      const feeKes   = +(grossKes - effectiveTotal).toFixed(2);

      // Create order WITH paystackRef already set so webhook/verify can find it
      // even if a later updateDoc is blocked by rules.
      const orderId = 'ORD-' + Date.now();
      const paystackRef = orderId + '_' + Date.now();
      const order = await placeOrder([...cart], 'paystack', '', '', promoApplied, {
        id: orderId,
        paystackRef,
        paystackChannel,
        expectedGrossKes: grossKes,
      });
      setPlacedOrder(order);
      setVerifyRef(paystackRef);

      // Best-effort refresh of ref fields (create already has them)
      try {
        await updateDoc(doc(db, 'orders', order.id), {
          paystackRef,
          paystackChannel,
          expectedGrossKes: grossKes,
          updatedAt: serverTimestamp(),
        });
      } catch (refErr) {
        console.warn('[Cart] paystackRef update skipped:', refErr.message);
      }

      await new Promise((resolve) => {
        let paymentSucceeded = false;
        const paystackChannels =
          paystackChannel === 'mpesa' ? ['mobile_money'] :
          ['card'];

        const handler = window.PaystackPop.setup({
          key:      PAYSTACK_PUBLIC_KEY,
          email:    user.email,
          amount:   paystackAmountCents,
          currency: 'KES',
          ref:      paystackRef,
          channels: paystackChannels,
          metadata: {
            orderId:          order.id,
            userEmail:        user.email,
            userName:         user.name,
            books:            cart.map(b => b.title).join(', '),
            netPayout:        effectiveTotal,
            paystackChannel,
            paystackFeeKes:   feeKes,
            promoCode:        promoApplied?.code || null,
            discountAmount:   discountAmount || 0,
          },
          callback: (response) => {
            // Payment popup reported success — only Cloud Functions unlock books
            paymentSucceeded = true;
            setVerifyRef(response.reference);
            setStep('verifying');

            const doVerify = async () => {
              // ── Step 1: check if webhook / prior verify already completed ──
              try {
                const { getDoc: fsGet, doc: fsDoc } = await import('firebase/firestore');
                const snap = await fsGet(fsDoc(db, 'orders', order.id));
                if (snap.exists() && snap.data().status === 'Completed') {
                  try {
                    const { notifyBooksUnlocked } = await import('../utils/userNotifier');
                    await notifyBooksUnlocked(user.email.toLowerCase(), order.items || [], order.id);
                  } catch {}
                  clearCart();
                  setStep('done');
                  return;
                }
              } catch { /* continue */ }

              // ── Step 2: server verify + unlock ────────────────────────────
              try {
                await callVerifyPaystack({
                  reference: response.reference,
                  orderId:   order.id,
                  userEmail: user.email,
                });

                try {
                  const { notifyBooksUnlocked } = await import('../utils/userNotifier');
                  await notifyBooksUnlocked(user.email.toLowerCase(), order.items || [], order.id);
                } catch {}
                try {
                  const { trackActivity, NOTIFICATION_CATEGORIES } = await import('../utils/adminActivityTracker');
                  const titles = (order.items || []).map(i => i.title).join(', ');
                  trackActivity({
                    category: NOTIFICATION_CATEGORIES.BOOK_PURCHASE,
                    title: '📚 Book Purchase Confirmed',
                    message: `${user.name || user.email} purchased ${(order.items || []).length} book${(order.items || []).length !== 1 ? 's' : ''}: ${titles} — KSh ${(order.total || 0).toLocaleString()}`,
                    userEmail: user.email.toLowerCase(),
                    userName: user.name,
                    metadata: { orderId: order.id, total: order.total, method: 'paystack', ref: response.reference },
                    priority: 'high',
                  }).catch(() => {});
                } catch {}

                clearCart();
                setStep('done');
              } catch (verifyErr) {
                const verifyErrMsg = String(verifyErr?.message || verifyErr?.details || '');
                console.warn('[Cart] verify threw:', verifyErrMsg);

                const hardFail = /failed|abandoned|reversed|declined|invalid|too low|does not match|permission/i.test(verifyErrMsg);
                const pendingRace = /pending|timeout|network|unavailable|deadline|unlock failed|Retry Activation/i.test(verifyErrMsg);

                if (hardFail && !/pending/i.test(verifyErrMsg)) {
                  setStkError(
                    'Payment was not confirmed. If money was deducted, go to My Library → Orders and tap Retry Activation. Ref: ' +
                    response.reference
                  );
                  setStep('pay');
                  return;
                }

                // Pending / unlock race — stay on verifying; screen retries + listens
                if (pendingRace || !hardFail) {
                  setVerifyRef(response.reference);
                  setStep('verifying');
                  return;
                }

                setStkError(
                  'Payment confirmation timed out. Go to My Library → Orders and tap Retry Activation. Ref: ' +
                  response.reference
                );
                setStep('pay');
              }
            };

            doVerify().finally(resolve);
          },
          onClose: () => {
            // Paystack also fires onClose after a successful payment — never
            // cancel an order that already completed or whose success callback ran.
            if (paymentSucceeded) {
              resolve();
              return;
            }
            if (order?.id) {
              (async () => {
                try {
                  const { getDoc: fsGet, doc: fsDoc } = await import('firebase/firestore');
                  const snap = await fsGet(fsDoc(db, 'orders', order.id));
                  if (snap.exists() && snap.data().status === 'Completed') return;
                  await updateDoc(doc(db, 'orders', order.id), {
                    status: 'Cancelled',
                    cancelledAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  notifyAdminPaymentIssue(order, 'Customer cancelled payment', null);
                } catch { /* ignore */ }
              })();
            }
            setCancelledNotice('Payment was cancelled. Your cart is unchanged — add, remove, or proceed when ready.');
            setStep('cart');
            resolve();
          },
        });
        handler.openIframe();
      });
    } catch (err) {
      const msg = err?.details || err?.message || 'Payment failed. Try again.';
      setStkError(msg);
    } finally {
      setBusy(false);
    }
  };

  // ── Manual reference flow (Airtel / fallback) — awaits admin confirmation ──
  const submitManual = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      const order = await placeOrder([...cart], method, ref, phone, promoApplied);
      setPlacedOrder(order);
      // Do NOT auto-unlock — Airtel refs need admin verification to prevent free unlocks
      clearCart();
      setStep('pending');
    } catch (err) {
      setStkError('Something went wrong. Please try again or contact support.');
    } finally {
      setBusy(false);
    }
  };

  // ── PayPal payment flow ────────────────────────────────────────────────────
  const submitPayPal = async e => {
    e.preventDefault();
    setStkError('');
    setBusy(true);
    try {
      const order = await placeOrder([...cart], 'paypal', '', '', promoApplied);
      setPlacedOrder(order);

      // Convert KES → USD for PayPal (approximate rate; use a live rate API in production)
      const KES_TO_USD = 0.0077;
      const usdAmount  = (effectiveTotal * KES_TO_USD).toFixed(2);

      // Create PayPal order via Cloud Function
      const { data: ppData } = await callCreatePayPalOrder({
        amount:    usdAmount,
        orderId:   order.id,
        userEmail: user.email,
        currency:  'USD',
      });

      if (!ppData.paypalOrderId) throw new Error('Failed to create PayPal order');

      if (!window.paypal) {
        await new Promise((resolve, reject) => {
          // Use the client-id from settings or fallback to sandbox for safety
          const clientId = settings.paypalClientId || 'test';
          const s = document.createElement('script');
          s.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`;
          s.async = true;
          s.onload = () => setTimeout(resolve, 200);
          s.onerror = () => reject(new Error('Failed to load PayPal SDK'));
          document.head.appendChild(s);
        });
      }

      if (!window.paypal?.Buttons) throw new Error('PayPal SDK not available. Check PayPal Client ID in settings.');

      setStep('paypal_modal');

      // Render PayPal buttons in a modal container
      await new Promise((resolve) => {
        window.paypal.Buttons({
          createOrder: () => ppData.paypalOrderId,
          onApprove: async (data) => {
            setStep('verifying');
            try {
              await callCapturePayPalOrder({
                paypalOrderId: data.orderID,
                orderId: order.id,
                userEmail: user.email,
              });
              // Notify user in their own feed
              try {
                const { notifyBooksUnlocked } = await import('../utils/userNotifier');
                await notifyBooksUnlocked(user.email.toLowerCase(), order.items || [], order.id);
              } catch {}
              clearCart();
              setStep('done');
              resolve();
            } catch (err) {
              updateDoc(doc(db, 'orders', order.id), { status: 'PaymentFailed', failReason: err.message, updatedAt: serverTimestamp() }).catch(() => {});
              setStkError('PayPal capture failed: ' + (err.message || 'unknown error'));
              setStep('pay');
              resolve();
            }
          },
          onCancel: () => {
            updateDoc(doc(db, 'orders', order.id), { status: 'Cancelled', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
            setCancelledNotice('PayPal payment was cancelled. Your cart is unchanged — modify it or try a different payment method.');
            setStep('cart');
            resolve();
          },
          onError: (err) => {
            setStkError('PayPal error: ' + (err?.message || 'unknown error'));
            setCancelledNotice('PayPal encountered an error. Your cart is still here — please try again.');
            setStep('cart');
            resolve();
          },
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 48 },
        }).render('#paypal-button-container');
      });
    } catch (err) {
      const msg = err?.details || err?.message || 'PayPal payment failed. Try again.';
      setStkError(msg);
      setStep('pay');
    } finally {
      setBusy(false);
    }
  };

  // ── PayPal modal screen ───────────────────────────────────────────────────
  if (step === 'paypal_modal') return (
    <main className="cart-page">
      <div className="container cart-modal-wrap">
        <div className="card cart-modal-card">
          <p className="cart-modal-card__brand">PayPal</p>
          <h2>Complete Payment</h2>
          <p className="cart-modal-card__amount">
            You'll be charged <strong>USD ~${(effectiveTotal * 0.0077).toFixed(2)}</strong>
            <span> (≈ KSh {effectiveTotal.toLocaleString()})</span>
          </p>
          <p className="cart-modal-card__sub">Complete your payment securely via PayPal.</p>
          <div id="paypal-button-container" style={{ minHeight:48 }} />
          <button className="btn btn-ghost btn-sm cart-modal-card__back" onClick={() => setStep('pay')}>
            Back to Payment Options
          </button>
        </div>
      </div>
    </main>
  );

  // ── STK Waiting screen (legacy) ──────────────────────────────────────────
  if (step === 'stk_waiting') return (
    <main className="cart-page">
      <div className="container" style={{ maxWidth:520, margin:'60px auto' }}>
        <StkWaiting
          order={placedOrder}
          onSuccess={() => navigate('/my-library')}
          onFailed={() => { setStep('pay'); setMethod('paystack'); }}
          onCancel={() => navigate('/my-library')}
        />
      </div>
    </main>
  );

  // ── Verifying screen ──────────────────────────────────────────────────────
  if (step === 'verifying') return (
    <VerifyingScreen
      orderId={placedOrder?.id}
      paystackRef={verifyRef || placedOrder?.paystackRef}
      userEmail={user?.email}
      onDone={() => { clearCart(); setStep('done'); }}
      onGiveUp={() => {
        setStkError(
          'Confirmation is taking longer than usual. Check My Library → Orders and tap Retry Activation if needed.' +
          (verifyRef ? ' Ref: ' + verifyRef : '')
        );
        setStep('pay');
      }}
    />
  );

  // ── Done screen ───────────────────────────────────────────────────────────
  if (step === 'done') return (
    <main className="cart-page">
      <div className="container" style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="done-box">
          <div className="done-box__check">✓</div>
          <h2>Books Unlocked!</h2>
          <p>Your payment was confirmed and your books are ready to read.</p>

          {/* ── Order receipt summary ── */}
          {placedOrder && (
            <div style={{
              margin: '20px 0 8px',
              padding: '14px 18px',
              background: 'rgba(201,168,76,0.07)',
              border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 'var(--r-sm)',
              textAlign: 'left',
              fontSize: '0.82rem',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontWeight:700, color:'var(--gold)' }}>
                <span>Order #{placedOrder.id}</span>
                <span>KSh {(placedOrder.total||0).toLocaleString()}</span>
              </div>
              {(placedOrder.items || []).map(item => (
                <div key={item.id} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderTop:'1px solid rgba(255,255,255,0.05)', color:'var(--muted)' }}>
                  <span>{item.title}</span>
                  <span>KSh {(item.price||0).toLocaleString()}</span>
                </div>
              ))}
              {placedOrder.promoCode && (
                <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderTop:'1px solid rgba(255,255,255,0.05)', color:'#2ecc71' }}>
                  <span>{placedOrder.promoCode}</span>
                  <span>−KSh {(placedOrder.discountAmount||0).toLocaleString()}</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderTop:'1px solid rgba(255,255,255,0.08)', fontWeight:700, marginTop:4 }}>
                <span style={{ color:'var(--text)' }}>Total Paid</span>
                <span style={{ color:'var(--gold)' }}>KSh {(placedOrder.total||0).toLocaleString()}</span>
              </div>
              <div style={{ marginTop:10, display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize:'0.75rem' }}
                  onClick={() => {
                    const lines = [
                      '=== ELLINES HAVEN — ORDER RECEIPT ===',
                      `Order ID: ${placedOrder.id}`,
                      `Date: ${new Date().toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' })}`,
                      `Customer: ${user?.name} (${user?.email})`,
                      '',
                      'BOOKS PURCHASED:',
                      ...(placedOrder.items||[]).map(i => `  • ${i.title} — KSh ${(i.price||0).toLocaleString()}`),
                      ...(placedOrder.promoCode ? [`  Promo (${placedOrder.promoCode}): −KSh ${(placedOrder.discountAmount||0).toLocaleString()}`] : []),
                      '',
                      `TOTAL PAID: KSh ${(placedOrder.total||0).toLocaleString()}`,
                      '',
                      'Licensed for personal use only. Visit: haven.ellines.co.ke',
                      '======================================',
                    ].join('\n');
                    const blob = new Blob([lines], { type:'text/plain' });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement('a');
                    a.href     = url;
                    a.download = `receipt-${placedOrder.id}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Save Receipt
                </button>
              </div>
            </div>
          )}

          {/* ── Share your purchase ── */}
          <div className="done-share">
            <p className="done-share__label">Share with friends</p>
            <div className="done-share__links">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Just bought "${(placedOrder?.items||[]).map(i=>i.title).join('" & "')}" on Ellines Haven — amazing East African fiction!\n\nhaven.ellines.co.ke`
                )}`}
                target="_blank" rel="noopener noreferrer"
                className="done-share__btn done-share__btn--wa"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  `Just bought "${(placedOrder?.items||[]).map(i=>i.title).join('" & "')}" — East African fiction at its finest\n\nhaven.ellines.co.ke`
                )}`}
                target="_blank" rel="noopener noreferrer"
                className="done-share__btn done-share__btn--x"
              >
                Tweet
              </a>
              <button
                type="button"
                className="done-share__btn"
                onClick={() => {
                  const url = 'https://haven.ellines.co.ke/library';
                  try { navigator.clipboard.writeText(url); } catch { window.prompt('Copy:', url); }
                }}
              >
                Copy Link
              </button>
            </div>
          </div>

          <div className="done-box__actions">
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
  if (step === 'pay') {
    // Which methods are active — driven by admin settings, default includes the 4 core ones
    const activeMethods = settings.payMethods || ['paystack','mpesa','airtel','card'];
    const show = {
      paystack: activeMethods.includes('paystack'),
      paypal:   activeMethods.includes('paypal') && (settings.paypalEnabled || settings.paypalClientId),
      airtel:   activeMethods.includes('airtel'),
      wa:       activeMethods.includes('wa'),
    };
    return (
    <main className="cart-page">
      <header className="cart-hero">
        <div className="cart-hero__glow" aria-hidden="true" />
        <div className="cart-hero__orb cart-hero__orb--1" aria-hidden="true" />
        <div className="container cart-hero__inner">
          <p className="cart-hero__brand">Ellines Haven</p>
          <h1><EditableField field="checkout_heading">Checkout</EditableField></h1>
          <p>Secure payment · Instant unlock</p>
        </div>
      </header>
      <div className="container">
        <div className="pay-layout">
          <div className="pay-form card">

            {/* ── Accepted payment labels ── */}
            <div className="pay-accepted">
              {['M-Pesa', 'Visa / Mastercard', 'Bank Transfer', 'International Cards', 'PayPal'].map(label => (
                <span key={label} className="pay-accepted__chip">{label}</span>
              ))}
              <span className="pay-accepted__chip pay-accepted__chip--ok">Secure · Instant unlock</span>
            </div>

            {/* ── PayPal tab (only if enabled) ── */}
            {show.paypal && (
              <div className="pay-method-tabs">
                <button className={'pay-btn' + (method !== 'paypal' ? '' : ' pay-btn--on')} onClick={() => { setMethod('paystack'); setStkError(''); }} type="button">Card / M-Pesa</button>
                <button className={'pay-btn' + (method === 'paypal' ? ' pay-btn--on' : '')} onClick={() => { setMethod('paypal'); setStkError(''); }} type="button">PayPal</button>
              </div>
            )}

            {/* ── Paystack: M-Pesa / Card / Bank ── */}
            {method !== 'paypal' && (
              <form onSubmit={submitPaystack}>
                <div className="pay-mpesa-box">
                  <div className="pay-instant-note">
                    <strong>Instant unlock</strong> — books unlock automatically the moment payment confirms.
                  </div>

                  {/* Payment method selector — shows total per option, no fee language */}
                  <p className="pay-channel-label">
                    Payment method
                  </p>
                  <div className="pay-channel-list">
                    {[
                      { key:'mpesa',     label:'Pay with M-Pesa' },
                      { key:'card',      label:'Pay with Local Card' },
                      { key:'intl_card', label:'Pay with International Card' },
                    ].map(({ key, label }) => {
                      const active   = paystackChannel === key;
                      return (
                        <label key={key} className={'pay-channel' + (active ? ' pay-channel--on' : '')}>
                          <span className="pay-channel__left">
                            <input
                              type="radio"
                              name="paystackChannel"
                              value={key}
                              checked={active}
                              onChange={() => setPaystackChannel(key)}
                            />
                            <span className="pay-channel__label">{label}</span>
                          </span>
                          <span className="pay-channel__price">
                            KSh {(calcPaystackAmount(effectiveTotal, key) / 100).toFixed(2)}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {stkError && <div className="pay-error">{stkError}</div>}
                </div>
                <div className="pay-total">
                  <span>Total</span>
                  <strong>KSh {(calcPaystackAmount(effectiveTotal, paystackChannel) / 100).toFixed(2)}</strong>
                </div>
                {/* ── Promo code on pay screen ── */}
                {promoApplied && (
                  <div className={'pay-promo-applied' + (promoApplied.type === 'Referral' ? ' pay-promo-applied--ref' : '')}>
                    <span>
                      <strong>{promoApplied.code}</strong> applied
                      {promoApplied.referrerName && <span className="pay-promo-applied__from"> from {promoApplied.referrerName}</span>}
                    </span>
                    <span className="pay-promo-applied__amt">−KSh {discountAmount.toLocaleString()}</span>
                  </div>
                )}
                {/* ── No-refund acknowledgement ── */}
                <label className="pay-refund-ack">
                  <input
                    type="checkbox"
                    checked={refundAcked}
                    onChange={e => setRefundAcked(e.target.checked)}
                  />
                  <span>
                    I understand that <strong>all digital book purchases are final and non-refundable</strong>. Once payment is confirmed and my book is unlocked, no refund can be issued. <Link to="/terms#refund" target="_blank">Read refund policy →</Link>
                  </span>
                </label>

                {/* ── M-Pesa heads-up ── */}
                <div className="pay-help-note">
                  <span>
                    Your book unlocks automatically after payment. If it doesn't appear in your library, go to{' '}
                    <strong className="gold-text">My Library → Orders</strong> and tap{' '}
                    <strong>Retry Activation</strong>.
                  </span>
                </div>

                <button type="submit" className="btn btn-primary pay-submit" disabled={busy || !refundAcked}>
                  {busy ? 'Opening payment…' : `Pay KSh ${(calcPaystackAmount(effectiveTotal, paystackChannel) / 100).toFixed(2)}`}
                </button>
                <button type="button" className="btn btn-ghost btn-sm pay-back" onClick={() => setStep('cart')}>Back to Cart</button>
              </form>
            )}

            {/* ── PayPal ── */}
            {method === 'paypal' && (
              <form onSubmit={submitPayPal}>
                <div className="pay-mpesa-box">
                  <div className="pay-paypal-note">
                    <strong>PayPal</strong> — pay with your PayPal balance, linked bank, Visa, or Mastercard. Globally accepted.
                  </div>
                  <div className="pay-detail-row"><span>Amount (KES)</span><strong className="pay-highlight">KSh {effectiveTotal.toLocaleString()}</strong></div>
                  <div className="pay-detail-row"><span>Amount (USD approx.)</span><strong className="pay-paypal-usd">~${(effectiveTotal * 0.0077).toFixed(2)}</strong></div>
                  <div className="pay-detail-row"><span>Accepted</span><strong>PayPal · Visa · Mastercard · Bank</strong></div>
                  <p className="pay-paypal-hint">
                    Note: PayPal processes in USD. The USD amount shown is approximate.
                  </p>
                  {stkError && <div className="pay-error">{stkError}</div>}
                </div>
                <div className="pay-total"><span>Total</span><strong>KSh {effectiveTotal.toLocaleString()}</strong></div>
                {/* ── No-refund acknowledgement ── */}
                <label className="pay-refund-ack">
                  <input type="checkbox" checked={refundAcked} onChange={e => setRefundAcked(e.target.checked)} />
                  <span>
                    I understand that <strong>all digital book purchases are final and non-refundable</strong>. Once payment is confirmed and my book is unlocked, no refund can be issued. <Link to="/terms#refund" target="_blank">Read refund policy →</Link>
                  </span>
                </label>
                <button type="submit" className="btn btn-primary pay-submit pay-submit--paypal" disabled={busy || !refundAcked}>
                  {busy ? 'Connecting to PayPal…' : 'Pay with PayPal'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm pay-back" onClick={() => setStep('cart')}>Back to Cart</button>
              </form>
            )}

            {/* ── Airtel Money (manual) ── */}
            {method === 'airtel' && (
              <form onSubmit={submitManual}>
                <div className="pay-mpesa-box">
                  <p className="pay-instruction">Send via <strong>Airtel Money</strong></p>
                  <div className="pay-detail-row"><span>Send to</span><strong className="pay-highlight">{settings.airtelNum || 'Contact us for Airtel number'}</strong></div>
                  <div className="pay-detail-row"><span>Amount</span><strong className="pay-highlight">KSh {effectiveTotal.toLocaleString()}</strong></div>
                  <div className="form-group" style={{ marginTop:16 }}><label>Your Airtel Number</label><input className="field" placeholder="073X XXX XXX" value={phone} onChange={e => setPhone(e.target.value)} required /></div>
                  <div className="form-group" style={{ marginTop:12 }}><label>Transaction Reference *</label><input className="field" placeholder="Airtel transaction code" value={ref} onChange={e => setRef(e.target.value.toUpperCase())} required style={{ textTransform:'uppercase', letterSpacing:2, fontWeight:600 }} /></div>
                </div>
                <div className="pay-total"><span>Total</span><strong>KSh {effectiveTotal.toLocaleString()}</strong></div>
                {/* ── No-refund acknowledgement ── */}
                <label className="pay-refund-ack">
                  <input type="checkbox" checked={refundAcked} onChange={e => setRefundAcked(e.target.checked)} />
                  <span>I understand that <strong>all digital purchases are final and non-refundable</strong>. <Link to="/terms#refund" target="_blank">Refund policy →</Link></span>
                </label>
                <button type="submit" className="btn btn-primary pay-submit" disabled={busy || !refundAcked}>{busy ? 'Submitting…' : 'Submit Payment'}</button>
                <button type="button" className="btn btn-ghost btn-sm pay-back" onClick={() => setStep('cart')}>Back to Cart</button>
              </form>
            )}

            {/* ── WhatsApp ── */}
            {method === 'wa' && (
              <div className="pay-mpesa-box">
                <p className="pay-instruction">Order directly via <strong>WhatsApp</strong></p>
                <div className="pay-detail-row"><span>Amount</span><strong className="pay-highlight">KSh {effectiveTotal.toLocaleString()}</strong></div>
                <p style={{ color:'var(--muted)', fontSize:'0.83rem', marginTop:12 }}>We'll confirm your payment and unlock your books manually — usually within minutes.</p>
                <a href={`https://wa.me/254748255466?text=${encodeURIComponent('Hi! I\'d like to order:\n' + cart.map(b => `• ${b.title} — KSh ${b.price}`).join('\n') + `\n\nTotal: KSh ${effectiveTotal}` + (promoApplied ? `\nPromo: ${promoApplied.code} (−KSh ${discountAmount})` : ''))}`}
                  target="_blank" rel="noopener noreferrer" className="btn btn-wa" style={{ width:'100%', marginTop:16 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Order via WhatsApp
                </a>
                <button type="button" className="btn btn-ghost btn-sm pay-back" onClick={() => setStep('cart')}>Back to Cart</button>
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
            {discountAmount > 0 && (
              <div className="pay-summary-discount">
                <span>{promoApplied?.code}</span>
                <strong>−KSh {discountAmount.toLocaleString()}</strong>
              </div>
            )}
            <div className="pay-total">
              <span>{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
              <strong>KSh {effectiveTotal.toLocaleString()}</strong>
            </div>
            <div className="pay-trust">
              {method === 'paystack'
                ? <><span>Books unlock instantly after payment</span><span>M-Pesa · Card · Bank supported</span></>
                : method === 'paypal'
                ? <><span>PayPal secure checkout</span><span>Books unlock automatically on payment</span></>
                : <><span>Books unlock after payment is verified</span><span>Usually within minutes</span></>
              }
            </div>
          </div>
        </div>
      </div>
    </main>
  );
  } // end if (step === 'pay')

  // ── Cart screen ──────────────────────────────────────────────────────────
  return (
    <main className="cart-page">
      <header className="cart-hero">
        <div className="cart-hero__glow" aria-hidden="true" />
        <div className="cart-hero__orb cart-hero__orb--1" aria-hidden="true" />
        <div className="cart-hero__orb cart-hero__orb--2" aria-hidden="true" />
        <div className="container cart-hero__inner">
          <p className="cart-hero__brand">Ellines Haven</p>
          <h1><EditableField field="cart_heading">Your Cart</EditableField></h1>
          <p>{cart.length} item{cart.length !== 1 ? 's' : ''} · Ready when you are</p>
        </div>
      </header>
      <div className="container">
        {/* Payment cancelled notice */}
        {cancelledNotice && (
          <div className="cart-cancelled-notice" role="alert">
            <span>{cancelledNotice}</span>
            <button
              className="cart-cancelled-notice__close"
              onClick={() => setCancelledNotice('')}
              aria-label="Dismiss"
            >✕</button>
          </div>
        )}

        {cart.length === 0
          ? (
            <div className="cart-empty">
              <div className="cart-empty__icon" aria-hidden="true" />
              <h3><EditableField field="cart_empty_heading">Your cart is empty</EditableField></h3>
              <p><EditableField field="cart_empty_sub">Discover books you'll love and add them here.</EditableField></p>
              <Link to="/library" className="btn btn-primary"><EditableField field="cart_browse_btn">Browse Books</EditableField></Link>
            </div>
          ) : (
            <div className="cart-layout">

              {/* ── Left: item list ── */}
              <div className="cart-items">
                <div className="cart-items-header">
                  <span>{cart.length} item{cart.length !== 1 ? 's' : ''} in your cart</span>
                  <button className="cart-clear-btn" onClick={() => { if (window.confirm('Remove all items from cart?')) clearCart(); }}>
                    Clear cart
                  </button>
                </div>

                {cart.map(b => (
                  <div key={b.id} className="cart-item card">
                    {b.isChapter ? (
                      /* ── Chapter item ── */
                      <div className="cart-item__img-wrap cart-item__img-wrap--chapter">
                        <div className="cart-item__chapter-badge">
                          <div className="cart-item__chapter-label">CH.</div>
                          <div className="cart-item__chapter-num">{b.chapterNum}</div>
                        </div>
                      </div>
                    ) : (
                      <Link to={bookPath(b)} className="cart-item__img-wrap">
                        <img
                          src={b.cover || '/logo-icon.png'}
                          alt={b.title}
                          className="cart-item__img"
                          onError={e => { e.target.src = '/logo-icon.png'; }}
                        />
                      </Link>
                    )}
                    <div className="cart-item__info">
                      {b.isChapter ? (
                        <>
                          <span className="cart-item__genre cart-item__genre--chapter">Chapter {b.chapterNum}</span>
                          <h3 style={{ fontSize:'0.9rem' }}>{b.chapterTitle || b.title}</h3>
                          <p className="cart-item__author" style={{ fontSize:'0.78rem', color:'var(--muted)' }}>
                            from <em>{b.title.replace(/ — Chapter \d+$/, '')}</em>
                          </p>
                          <p className="cart-item__meta cart-item__meta--chapter">Ongoing Series · Individual Chapter</p>
                        </>
                      ) : (
                        <>
                          <span className="cart-item__genre">{b.genre}</span>
                          <h3><Link to={bookPath(b)}>{b.title}</Link></h3>
                          <p className="cart-item__author">by {b.author}</p>
                          <p className="cart-item__meta">{b.pages} pages · {b.readTime}</p>
                        </>
                      )}
                      <div className="cart-item__actions">
                        <button className="cart-item__rm" onClick={() => removeFromCart(b.id)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          Remove
                        </button>
                        {!b.isChapter && <Link to={bookPath(b)} className="cart-item__view">View details</Link>}
                      </div>
                    </div>
                    <div className="cart-item__right">
                      <div className="cart-item__price">KSh {b.price.toLocaleString()}</div>
                      <span className="cart-item__type">{b.isChapter ? 'Single chapter' : 'Digital book'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Right: order summary ── */}
              <div className="cart-sum card">
                <h3>Order Summary</h3>
                <div className="cart-sum__lines">
                {cart.map(b => (
                    <div key={b.id} className="cart-sum__row">
                      <span title={b.title}>{b.title.length > 26 ? b.title.slice(0, 26) + '…' : b.title}</span>
                      <span>KSh {b.price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="cart-sum__divider" />
                <div className="cart-sum__total">
                  <span>Subtotal</span>
                  <strong>KSh {total.toLocaleString()}</strong>
                </div>
                {/* ── Promo code entry ── */}
                <div className="cart-promo">
                  {!promoApplied ? (
                    <div className="cart-promo__row">
                      <input
                        className="field"
                        placeholder="Promo code"
                        value={promoInput}
                        onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoError(''); }}
                        onKeyDown={e => e.key === 'Enter' && applyPromo()}
                      />
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={applyPromo}
                        disabled={promoChecking || !promoInput.trim()}
                      >
                        {promoChecking ? '…' : 'Apply'}
                      </button>
                    </div>
                  ) : (
                    <div className="cart-promo__applied">
                      <span>
                        {promoApplied.code} — <strong>−KSh {discountAmount.toLocaleString()}</strong>
                      </span>
                      <button onClick={removePromo} type="button" aria-label="Remove promo">✕</button>
                    </div>
                  )}
                  {promoError && <p className="cart-promo__error">{promoError}</p>}
                </div>
                {discountAmount > 0 && (
                  <div className="cart-sum__total cart-sum__total--discount">
                    <span>Discount</span>
                    <strong>−KSh {discountAmount.toLocaleString()}</strong>
                  </div>
                )}
                <div className="cart-sum__total cart-sum__total--final">
                  <span>Total</span>
                  <strong>KSh {effectiveTotal.toLocaleString()}</strong>
                </div>
                <p className="cart-sum__unlock-note">Books unlock instantly after payment</p>
                <div className="cart-sum__refund">
                  <strong>No refunds</strong> — digital books are delivered instantly and cannot be returned once unlocked. <Link to="/terms#refund">Policy →</Link>
                </div>
                <button className="btn btn-primary cart-sum__cta" onClick={checkout}>
                  Proceed to Checkout
                </button>
                {!user && (
                  <p className="cart-sum__note">
                    <Link to="/login">Sign in</Link> to complete your purchase. Your cart is saved.
                  </p>
                )}
                <Link to="/library" className="cart-sum__continue">← Continue browsing</Link>
              </div>

            </div>
          )
        }
      </div>
    </main>
  );
}
