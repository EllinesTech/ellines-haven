import { useState } from 'react';
import './OrderReceiptModal.css';

/* Order Receipt Modal — shows detailed order information with print/download capability */
export default function OrderReceiptModal({ order, user, onClose }) {
  const [printing, setPrinting] = useState(false);

  if (!order) return null;

  const formatDate = (ts) => {
    if (!ts) return '—';
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('en-KE', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch { return '—'; }
  };

  const handlePrint = () => {
    setPrinting(true);
    window.print();
    setTimeout(() => setPrinting(false), 500);
  };

  const handleDownload = () => {
    // Create a downloadable text receipt
    const receiptText = `
ELLINES HAVEN - ORDER RECEIPT
================================

Order ID: ${order.id}
Order Date: ${formatDate(order.createdAt || order.date)}
Status: ${order.status}

CUSTOMER INFORMATION
--------------------
Name: ${order.userName || user?.name || '—'}
Email: ${order.userEmail || user?.email || '—'}

ITEMS PURCHASED
----------------
${(order.items || []).map((item, i) => 
  `${i + 1}. ${item.title}
   Price: KSh ${item.price?.toLocaleString() || '0'}
   Quantity: ${item.quantity || 1}
`).join('\n')}

PAYMENT DETAILS
----------------
Payment Method: ${order.method || '—'}
${order.paystackRef ? `Paystack Reference: ${order.paystackRef}` : ''}
${order.mpesaTransactionId ? `M-Pesa Transaction: ${order.mpesaTransactionId}` : ''}
${order.ref ? `Reference: ${order.ref}` : ''}
${order.phone ? `Phone: ${order.phone}` : ''}

TOTAL: KSh ${order.total?.toLocaleString() || '0'}

Completed: ${formatDate(order.completedAt || order.createdAt)}

================================
Thank you for your purchase!
Visit us at: https://haven.ellines.co.ke
Support: +254 748 255 466
Email: ellines.haven@gmail.com
`;

    const blob = new Blob([receiptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ellines-Haven-Receipt-${order.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="receipt-modal-backdrop" onClick={onClose} />
      
      {/* Modal */}
      <div className="receipt-modal">
        <div className="receipt-modal-header">
          <h2>📄 Order Receipt</h2>
          <button className="receipt-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="receipt-modal-body">
          {/* Receipt content */}
          <div className="receipt-content">
            {/* Header */}
            <div className="receipt-header">
              <div className="receipt-logo">
                <img src="/logo-nobg.png" alt="Ellines Haven" style={{ height: 50, objectFit: 'contain' }} />
              </div>
              <h3>Order Receipt</h3>
              <p className="receipt-tagline">Home For The Story Soul</p>
            </div>

            {/* Order Info */}
            <div className="receipt-section">
              <div className="receipt-row">
                <span className="receipt-label">Order ID:</span>
                <strong>{order.id}</strong>
              </div>
              <div className="receipt-row">
                <span className="receipt-label">Date:</span>
                <span>{formatDate(order.createdAt || order.date)}</span>
              </div>
              <div className="receipt-row">
                <span className="receipt-label">Status:</span>
                <span className="receipt-status-badge">✅ {order.status}</span>
              </div>
            </div>

            {/* Customer Info */}
            <div className="receipt-section">
              <h4>Customer Information</h4>
              <div className="receipt-row">
                <span className="receipt-label">Name:</span>
                <span>{order.userName || user?.name || '—'}</span>
              </div>
              <div className="receipt-row">
                <span className="receipt-label">Email:</span>
                <span>{order.userEmail || user?.email || '—'}</span>
              </div>
            </div>

            {/* Items */}
            <div className="receipt-section">
              <h4>Items Purchased</h4>
              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Book Title</th>
                    <th className="receipt-table-right">Price</th>
                    <th className="receipt-table-right">Qty</th>
                    <th className="receipt-table-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).map((item, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{item.title}</td>
                      <td className="receipt-table-right">KSh {item.price?.toLocaleString() || '0'}</td>
                      <td className="receipt-table-right">{item.quantity || 1}</td>
                      <td className="receipt-table-right">
                        KSh {((item.price || 0) * (item.quantity || 1)).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Payment Info */}
            <div className="receipt-section">
              <h4>Payment Details</h4>
              <div className="receipt-row">
                <span className="receipt-label">Method:</span>
                <span>{order.method || '—'}</span>
              </div>
              {order.paystackRef && (
                <div className="receipt-row">
                  <span className="receipt-label">Paystack Ref:</span>
                  <code>{order.paystackRef}</code>
                </div>
              )}
              {order.mpesaTransactionId && (
                <div className="receipt-row">
                  <span className="receipt-label">M-Pesa Transaction:</span>
                  <code>{order.mpesaTransactionId}</code>
                </div>
              )}
              {order.ref && !order.paystackRef && !order.mpesaTransactionId && (
                <div className="receipt-row">
                  <span className="receipt-label">Reference:</span>
                  <code>{order.ref}</code>
                </div>
              )}
              {order.phone && (
                <div className="receipt-row">
                  <span className="receipt-label">Phone:</span>
                  <span>{order.phone}</span>
                </div>
              )}
              {order.completedAt && (
                <div className="receipt-row">
                  <span className="receipt-label">Completed:</span>
                  <span>{formatDate(order.completedAt)}</span>
                </div>
              )}
            </div>

            {/* Total */}
            <div className="receipt-total">
              <span>TOTAL:</span>
              <strong>KSh {order.total?.toLocaleString() || '0'}</strong>
            </div>

            {/* Footer */}
            <div className="receipt-footer">
              <p>Thank you for your purchase!</p>
              <p className="receipt-footer-links">
                <a href="https://haven.ellines.co.ke" target="_blank" rel="noopener noreferrer">haven.ellines.co.ke</a>
                {' · '}
                <a href="tel:+254748255466">+254 748 255 466</a>
                {' · '}
                <a href="mailto:ellines.haven@gmail.com">ellines.haven@gmail.com</a>
              </p>
              <p className="receipt-footer-note">
                Digital books purchased are non-refundable. For support, contact us via WhatsApp or email.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="receipt-modal-footer">
          <button className="btn btn-outline" onClick={handleDownload}>
            ⬇️ Download Receipt
          </button>
          <button className="btn btn-primary" onClick={handlePrint} disabled={printing}>
            {printing ? '🖨️ Printing…' : '🖨️ Print Receipt'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}
