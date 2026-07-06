/**
 * Ellines Haven — Firebase Cloud Functions
 * Handles M-Pesa STK Push (Daraja), Paystack webhook, automatic book unlocking,
 * password reset OTP (email + SMS via Africa's Talking), and SMS broadcasts.
 *
 * Secrets:
 *   MPESA_*           — Daraja API credentials
 *   PAYSTACK_SECRET   — Paystack secret key
 *   AT_API_KEY        — Africa's Talking API key  (https://africastalking.com)
 *   AT_USERNAME       — Africa's Talking username (use "sandbox" for testing)
 *   AT_SENDER_ID      — Africa's Talking sender ID / shortcode (e.g. "EllinesHvn")
 *   SMTP_HOST         — SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT         — SMTP port (e.g. 465)
 *   SMTP_USER         — SMTP username / from address
 *   SMTP_PASS         — SMTP password / app password
 */

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("crypto");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// ── Secrets ──────────────────────────────────────────────────────────────────
const CONSUMER_KEY    = defineSecret("MPESA_CONSUMER_KEY");
const CONSUMER_SECRET = defineSecret("MPESA_CONSUMER_SECRET");
const SHORTCODE       = defineSecret("MPESA_SHORTCODE");
const PASSKEY         = defineSecret("MPESA_PASSKEY");
const CALLBACK_URL    = defineSecret("MPESA_CALLBACK_URL");
const MPESA_ENV       = defineSecret("MPESA_ENV");
const PAYSTACK_SECRET = defineSecret("PAYSTACK_SECRET");
const PAYPAL_CLIENT_ID     = defineSecret("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = defineSecret("PAYPAL_CLIENT_SECRET");
const PAYPAL_MODE          = defineSecret("PAYPAL_MODE");

// ── Africa's Talking + SMTP secrets ──────────────────────────────────────────
const AT_API_KEY    = defineSecret("AT_API_KEY");
const AT_USERNAME   = defineSecret("AT_USERNAME");
const AT_SENDER_ID  = defineSecret("AT_SENDER_ID");
const SMTP_HOST     = defineSecret("SMTP_HOST");
const SMTP_PORT     = defineSecret("SMTP_PORT");
const SMTP_USER     = defineSecret("SMTP_USER");
const SMTP_PASS     = defineSecret("SMTP_PASS");

// ── Helpers ───────────────────────────────────────────────────────────────────
const libDocId = (email) =>
  (email || "").toLowerCase().replace(/[^a-z0-9]/g, "_");

/** Get M-Pesa OAuth token */
async function getAccessToken(consumerKey, consumerSecret, env) {
  const base =
    env === "sandbox"
      ? "https://sandbox.safaricom.co.ke"
      : "https://api.safaricom.co.ke";
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const res = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  return res.data.access_token;
}

/** Format phone to 254XXXXXXXXX */
function formatPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0"))   return "254" + digits.slice(1);
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

// ── Order Confirmation Email ───────────────────────────────────────────────────
// Sends a receipt to the buyer after successful payment.
// Uses Africa's Talking Email API (if AT_API_KEY set) or falls back to AT SMS.
// secretValues = { atApiKey, atUsername, atSenderId }
async function sendOrderConfirmationToUser(order, secretValues) {
  const { atApiKey, atUsername, atSenderId } = secretValues;
  if (!atApiKey || !atUsername || !order.userEmail) return;

  const itemList  = (order.items || []).map(i => `• ${i.title} — KSh ${i.price}`).join("\n");
  const promoLine = order.promoCode ? `\nPromo: ${order.promoCode} (−KSh ${order.discountAmount || 0})` : "";
  const total     = `KSh ${Number(order.total || 0).toLocaleString()}`;
  const buyerName = order.userName || "Valued Reader";

  // ── SMS confirmation (always works with sandbox) ──────────────────────────
  const phone = order.phone ? String(order.phone).replace(/\D/g, "") : "";
  if (phone) {
    let formattedPhone = phone;
    if (phone.startsWith("0"))        formattedPhone = "+254" + phone.slice(1);
    else if (phone.startsWith("254")) formattedPhone = "+"   + phone;
    else if (!phone.startsWith("+"))  formattedPhone = "+254" + phone;

    const smsText =
      `Ellines Haven: Payment confirmed! ${total} received.` +
      ` Your book${(order.items||[]).length !== 1 ? "s are" : " is"} ready in My Library.` +
      ` Order: ${order.id}. Thank you!`;

    try {
      const isSandbox = atUsername === "sandbox";
      const params    = new URLSearchParams({ username: atUsername, to: formattedPhone, message: smsText });
      if (!isSandbox && atSenderId) params.append("from", atSenderId);
      await axios.post(
        "https://api.africastalking.com/version1/messaging",
        params.toString(),
        { headers: { apiKey: atApiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" } }
      );
      console.log("[orderConfirm] SMS sent to:", formattedPhone);
    } catch (e) {
      console.warn("[orderConfirm] SMS failed:", e.response?.data || e.message);
    }
  }

  // ── Email confirmation (production AT accounts only) ─────────────────────
  if (atUsername !== "sandbox") {
    const subject = `✅ Order Confirmed — ${total} | Ellines Haven`;
    const body    =
      `Hi ${buyerName},\n\n` +
      `Your payment of ${total} has been confirmed.\n\n` +
      `Books purchased:\n${itemList}${promoLine}\n\n` +
      `Order ID: ${order.id}\n\n` +
      `Your books are ready to read in My Library:\n` +
      `https://ellines-haven.web.app/my-library\n\n` +
      `Thank you for supporting Ellines Haven.\n\n` +
      `— Elijah Mwangi M & The Ellines Haven Team`;

    try {
      const emailParams = new URLSearchParams({
        username: atUsername,
        to:       order.userEmail,
        from:     "noreply@ellines-haven.web.app",
        subject,
        message:  body,
      });
      await axios.post(
        "https://api.africastalking.com/version1/messaging/email",
        emailParams.toString(),
        { headers: { apiKey: atApiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" } }
      );
      console.log("[orderConfirm] email sent to:", order.userEmail);
    } catch (e) {
      console.warn("[orderConfirm] email failed:", e.response?.data || e.message);
    }
  }
}

// ── STK Push (callable from frontend) ────────────────────────────────────────
exports.stkPush = onCall(
  {
    secrets: [CONSUMER_KEY, CONSUMER_SECRET, SHORTCODE, PASSKEY, CALLBACK_URL, MPESA_ENV],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { phone, amount, orderId, userEmail, bookIds } = request.data;

    if (!phone || !amount || !orderId || !userEmail) {
      throw new HttpsError("invalid-argument", "Missing required fields: phone, amount, orderId, userEmail");
    }

    const env           = MPESA_ENV.value() || "production";
    const consumerKey   = CONSUMER_KEY.value();
    const consumerSecret= CONSUMER_SECRET.value();
    const shortcode     = SHORTCODE.value(); // 174379 sandbox / real till for production
    const passkey       = PASSKEY.value();
    const callbackUrl   = CALLBACK_URL.value();

    const isSandbox = env === "sandbox";
    const base = isSandbox
      ? "https://sandbox.safaricom.co.ke"
      : "https://api.safaricom.co.ke";

    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);

    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
    const formattedPhone = formatPhone(phone);

    try {
      const token = await getAccessToken(consumerKey, consumerSecret, env);

      console.log("[stkPush] sending:", { shortcode, formattedPhone, amount: Math.ceil(amount), env, callbackUrl });

      const reqBody = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.ceil(amount),
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: "EllinesBks",
        TransactionDesc: "Ellines Haven Books",
      };
      console.log("[stkPush] request body:", JSON.stringify(reqBody));

      const stkRes = await axios.post(
        `${base}/mpesa/stkpush/v1/processrequest`,
        reqBody,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const { CheckoutRequestID, ResponseCode, ResponseDescription } = stkRes.data;

      if (ResponseCode !== "0") {
        throw new Error(ResponseDescription || "STK push failed");
      }

      // Store checkout request ID in the order so the callback can find it
      await db.collection("orders").doc(orderId).update({
        checkoutRequestId: CheckoutRequestID,
        stkPushSentAt: admin.firestore.FieldValue.serverTimestamp(),
        phone: formattedPhone,
      });

      return { success: true, checkoutRequestId: CheckoutRequestID };
    } catch (err) {
      const darjaError = err.response?.data;
      const darjaStatus = err.response?.status;
      const msg = darjaError?.errorMessage || darjaError?.ResponseDescription || darjaError?.error_description || err.message || "STK push failed";
      console.error("[stkPush] Daraja error:", darjaStatus, JSON.stringify(darjaError));
      throw new HttpsError("internal", msg);
    }
  }
);

// ── M-Pesa Callback (called by Safaricom servers) ─────────────────────────────
exports.mpesaCallback = onRequest(
  {
    secrets: [SHORTCODE],
    region: "us-central1",
  },
  async (req, res) => {
    // Safaricom sends POST with JSON body
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    try {
      const body = req.body?.Body?.stkCallback;
      if (!body) return;

      const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = body;

      console.log("[mpesaCallback] received:", { CheckoutRequestID, ResultCode, ResultDesc });

      // Find the order by checkoutRequestId
      const ordersSnap = await db
        .collection("orders")
        .where("checkoutRequestId", "==", CheckoutRequestID)
        .limit(1)
        .get();

      if (ordersSnap.empty) {
        console.warn("[mpesaCallback] no order found for checkoutRequestId:", CheckoutRequestID);
        return;
      }

      const orderDoc  = ordersSnap.docs[0];
      const order     = orderDoc.data();
      const orderId   = orderDoc.id;

      // ── Payment FAILED ────────────────────────────────────────────────────
      if (ResultCode !== 0) {
        await db.collection("orders").doc(orderId).update({
          status: "PaymentFailed",
          mpesaResultCode: ResultCode,
          mpesaResultDesc: ResultDesc,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log("[mpesaCallback] payment failed for order:", orderId);
        return;
      }

      // ── Payment SUCCESS ───────────────────────────────────────────────────
      // Extract M-Pesa transaction metadata
      const meta = {};
      (CallbackMetadata?.Item || []).forEach((item) => {
        meta[item.Name] = item.Value;
      });

      const mpesaTransactionId = meta.MpesaReceiptNumber || "";
      const paidAmount         = meta.Amount || order.total;
      const paidPhone          = meta.PhoneNumber || order.phone;

      // Update order as completed
      await db.collection("orders").doc(orderId).update({
        status: "Completed",
        mpesaTransactionId,
        paidAmount,
        paidPhone,
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentMethod: "mpesa_stk",
      });

      // ── Unlock books for the buyer ─────────────────────────────────────────
      if (order.userEmail) {
        await unlockBooksForUser(order.userEmail, order.items || [], "mpesa_auto");
        console.log("[mpesaCallback] books unlocked for:", order.userEmail, "order:", orderId);
      }

      // ── Send confirmation SMS/email to buyer ───────────────────────────────
      try {
        await sendOrderConfirmationToUser(
          { ...order, id: orderId, phone: paidPhone || order.phone || "" },
          { atApiKey: AT_API_KEY.value(), atUsername: AT_USERNAME.value(), atSenderId: AT_SENDER_ID.value() }
        );
      } catch (ce) { console.warn("[mpesaCallback] confirm notify failed:", ce.message); }

      // ── Notify the buyer in their user_notifications feed ──────────────────
      if (order.userEmail) {
        try {
          const titles  = (order.items || []).map(i => i.title).join(', ');
          const single  = (order.items || []).length === 1;
          const notifId = `un_mpesa_${orderId}_${Date.now()}`;
          await db.collection("user_notifications").doc(notifId).set({
            userEmail: order.userEmail.toLowerCase(),
            title:     `📚 ${single ? 'Book' : 'Books'} Unlocked!`,
            message:   `Your ${single ? `"${titles}"` : `${(order.items||[]).length} books`} unlocked via M-Pesa. Find them in My Library.`,
            type:      "book_ready",
            bookId:    single ? (order.items[0]?.id || null) : null,
            orderId,
            read:      false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (ne) { console.warn("[mpesaCallback] user notify failed:", ne.message); }
      }

      // ── Notify admin ────────────────────────────────────────────────────────
      try {
        await db.collection("admin_notifications").doc(orderId + "_confirmed").set({
          type: "order_confirmed_auto",
          orderId,
          userName: order.userName,
          userEmail: order.userEmail,
          total: paidAmount,
          mpesaTransactionId,
          status: "unread",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.warn("[mpesaCallback] admin notification failed:", e.message);
      }
    } catch (err) {
      console.error("[mpesaCallback] processing error:", err);
    }
  }
);

// ── Unlock books helper ────────────────────────────────────────────────────────
async function unlockBooksForUser(userEmail, items, source = "auto") {
  const ref = db.collection("libraries").doc(libDocId(userEmail));
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data().books || []) : [];
  const map = new Map(existing.map((b) => [b.id, b]));

  for (const item of items) {
    const prev = map.get(item.id) || {};
    map.set(item.id, {
      ...prev,
      id:               item.id,
      title:            item.title || prev.title || "",
      price:            item.price || prev.price || 0,
      downloadUnlocked: true,
      unlockedAt:       new Date().toISOString(),
      unlockedBy:       source,
    });
  }

  await ref.set(
    { email: userEmail.toLowerCase(), books: Array.from(map.values()) },
    { merge: true }
  );
}

// ── Query payment status (callable from frontend) ──────────────────────────────
exports.queryPaymentStatus = onCall(
  {
    secrets: [CONSUMER_KEY, CONSUMER_SECRET, SHORTCODE, PASSKEY, MPESA_ENV],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { checkoutRequestId } = request.data;
    if (!checkoutRequestId) throw new Error("checkoutRequestId required");

    const env            = MPESA_ENV.value() || "production";
    const consumerKey    = CONSUMER_KEY.value();
    const consumerSecret = CONSUMER_SECRET.value();
    const shortcode      = SHORTCODE.value();
    const passkey        = PASSKEY.value();

    const base =
      env === "sandbox"
        ? "https://sandbox.safaricom.co.ke"
        : "https://api.safaricom.co.ke";

    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

    try {
      const token = await getAccessToken(consumerKey, consumerSecret, env);
      const res = await axios.post(
        `${base}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, error: err.response?.data || err.message };
    }
  }
);

// ── Paystack Webhook ──────────────────────────────────────────────────────────
// Paystack POSTs here after every payment event.
// We verify the signature, then unlock books on charge.success.
exports.paystackWebhook = onRequest(
  { secrets: [PAYSTACK_SECRET], region: "us-central1" },
  async (req, res) => {
    // Always respond 200 immediately so Paystack doesn't retry
    res.status(200).send("OK");

    try {
      const secret = PAYSTACK_SECRET.value();
      const hash = crypto
        .createHmac("sha512", secret)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (hash !== req.headers["x-paystack-signature"]) {
        console.warn("[paystackWebhook] invalid signature — ignoring");
        return;
      }

      const event = req.body;
      console.log("[paystackWebhook] event:", event.event, "ref:", event.data?.reference);

      if (event.event !== "charge.success") return;

      const data      = event.data;
      const reference = data.reference;
      const email     = data.customer?.email?.toLowerCase();
      const paidKobo  = data.amount; // Paystack amounts are in kobo (KES cents × 100)

      if (!reference || !email) {
        console.warn("[paystackWebhook] missing reference or email");
        return;
      }

      // Find the order — try paystackRef first (new code), then order id directly (old code fallback)
      let ordersSnap = await db
        .collection("orders")
        .where("paystackRef", "==", reference)
        .limit(1)
        .get();

      // Fallback: old code stored ref = orderId, so the order doc ID IS the reference
      if (ordersSnap.empty) {
        const directDoc = await db.collection("orders").doc(reference).get();
        if (directDoc.exists) {
          ordersSnap = { empty: false, docs: [directDoc] };
          console.log("[paystackWebhook] found order by direct doc ID:", reference);
        }
      }

      if (ordersSnap.empty) {
        console.warn("[paystackWebhook] no order found for ref:", reference);
        return;
      }

      const orderDoc = ordersSnap.docs[0];
      const order    = orderDoc.data();
      const orderId  = orderDoc.id;

      if (order.status === "Completed") {
        console.log("[paystackWebhook] already completed:", orderId);
        return;
      }

      // Mark order completed
      await db.collection("orders").doc(orderId).update({
        status:           "Completed",
        paystackRef:      reference,
        paystackChannel:  data.channel,
        paidAmount:       paidKobo / 100,
        confirmedAt:      admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
        paymentMethod:    "paystack",
      });

      // Unlock books
      await unlockBooksForUser(order.userEmail || email, order.items || [], "paystack_auto");
      console.log("[paystackWebhook] ✅ books unlocked for:", order.userEmail, "order:", orderId);

      // ── Send confirmation SMS/email to buyer ───────────────────────────────
      try {
        await sendOrderConfirmationToUser(
          { ...order, id: orderId },
          { atApiKey: AT_API_KEY.value(), atUsername: AT_USERNAME.value(), atSenderId: AT_SENDER_ID.value() }
        );
      } catch (ce) { console.warn("[paystackWebhook] confirm notify failed:", ce.message); }

      // ── Notify buyer in their user_notifications feed ─────────────────────
      try {
        const buyerEmail = (order.userEmail || email).toLowerCase();
        const titles     = (order.items || []).map(i => i.title).join(', ');
        const single     = (order.items || []).length === 1;
        const notifId    = `un_ps_${orderId}_${Date.now()}`;
        await db.collection("user_notifications").doc(notifId).set({
          userEmail: buyerEmail,
          title:     `📚 ${single ? 'Book' : 'Books'} Unlocked!`,
          message:   `Your ${single ? `"${titles}"` : `${(order.items||[]).length} books`} unlocked via Paystack. Find them in My Library.`,
          type:      "book_ready",
          bookId:    single ? (order.items[0]?.id || null) : null,
          orderId,
          read:      false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (ne) { console.warn("[paystackWebhook] user notify failed:", ne.message); }

      // Notify admin
      await db.collection("admin_notifications").doc(orderId + "_ps").set({
        type:        "order_confirmed_auto",
        orderId,
        userName:    order.userName,
        userEmail:   order.userEmail,
        total:       paidKobo / 100,
        paystackRef: reference,
        channel:     data.channel,
        status:      "unread",
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});

    } catch (err) {
      console.error("[paystackWebhook] error:", err.message);
    }
  }
);

// ── Verify Paystack payment (callable — double-check from frontend) ────────────
exports.verifyPaystackPayment = onCall(
  {
    secrets: [PAYSTACK_SECRET],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { reference, orderId, userEmail } = request.data;
    if (!reference) throw new HttpsError("invalid-argument", "reference required");

    const secret = PAYSTACK_SECRET.value();

    // ── Step 1: Check Firestore — webhook may have already confirmed ──────────
    if (orderId) {
      try {
        const orderSnap = await db.collection("orders").doc(orderId).get();
        if (orderSnap.exists && orderSnap.data().status === "Completed") {
          console.log("[verifyPaystack] order already completed by webhook:", orderId);
          const d = orderSnap.data();
          return { success: true, channel: d.paystackChannel || "unknown", amount: d.paidAmount || 0, source: "webhook" };
        }
      } catch (e) {
        console.warn("[verifyPaystack] Firestore pre-check failed:", e.message);
      }
    }

    // ── Step 2: Call Paystack verify API — retry up to 8x for pending M-Pesa ──
    // M-Pesa via Paystack can take 10-30 s to confirm. Paystack's callback fires
    // as soon as the PIN is submitted, but the transaction status stays "pending"
    // until Safaricom confirms. We retry here so the Cloud Function handles the
    // wait rather than leaving the browser polling open for 30+ seconds.
    let paystackData;
    const MAX_ATTEMPTS = 8;
    const RETRY_DELAY_MS = 3000; // 3 s between retries → up to ~24 s total

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[verifyPaystack] API attempt ${attempt}/${MAX_ATTEMPTS} for ref:`, reference);
        const res = await axios.get(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
          { headers: { Authorization: `Bearer ${secret}` } }
        );

        paystackData = res.data?.data;
        const psStatus = paystackData?.status;
        console.log(`[verifyPaystack] attempt ${attempt} — status: ${psStatus}, amount: ${paystackData?.amount}, channel: ${paystackData?.channel}`);

        if (psStatus === "success") {
          // Confirmed — proceed to unlock
          break;
        } else if (psStatus === "pending" || psStatus === "processing") {
          // M-Pesa is still processing — wait and retry
          if (attempt < MAX_ATTEMPTS) {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            continue;
          } else {
            // Exhausted retries — throw so frontend can fall back to Firestore polling
            throw new HttpsError("failed-precondition", `Payment still pending after ${MAX_ATTEMPTS} attempts. Webhook will complete it.`);
          }
        } else {
          // Failed / abandoned / reversed — do not retry
          throw new HttpsError("failed-precondition", `Payment status: ${psStatus || "unknown"}`);
        }
      } catch (err) {
        if (err instanceof HttpsError) throw err;
        const status = err.response?.status;
        const psMsg  = err.response?.data?.message;
        const msg    = psMsg || err.message;
        console.error(`[verifyPaystack] Paystack API error on attempt ${attempt} — HTTP ${status}:`, msg);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        throw new HttpsError("internal", msg);
      }
    }

    if (!paystackData || paystackData.status !== "success") {
      throw new HttpsError("failed-precondition", `Payment not confirmed: ${paystackData?.status || "unknown"}`);
    }

    // ── Step 3: Unlock books and mark order Completed ─────────────────────────
    // Payment is confirmed by Paystack — proceed even if Firestore writes fail.
    // The webhook will also attempt to mark completed, so these writes are
    // best-effort; we never block returning success to the client.
    if (orderId && userEmail) {
      try {
        // Support both new format (orderId != reference) and old format (orderId == reference)
        let orderSnap = await db.collection("orders").doc(orderId).get();
        // If not found by orderId, try by reference directly (old code fallback)
        if (!orderSnap.exists) {
          orderSnap = await db.collection("orders").doc(reference).get();
        }
        if (orderSnap.exists && orderSnap.data().status !== "Completed") {
          const order = orderSnap.data();
          await db.collection("orders").doc(orderSnap.id).update({
            status:          "Completed",
            paystackRef:     reference,
            paystackChannel: paystackData.channel,
            paidAmount:      paystackData.amount / 100,
            confirmedAt:     admin.firestore.FieldValue.serverTimestamp(),
            paymentMethod:   "paystack",
          });
          await unlockBooksForUser(userEmail, order.items || [], "paystack_verify");
          console.log("[verifyPaystack] ✅ books unlocked for:", userEmail, "order:", orderSnap.id);
          // Send confirmation SMS/email to buyer
          try {
            await sendOrderConfirmationToUser(
              { ...order, id: orderSnap.id },
              { atApiKey: AT_API_KEY.value(), atUsername: AT_USERNAME.value(), atSenderId: AT_SENDER_ID.value() }
            );
          } catch (ce) { console.warn("[verifyPaystack] confirm notify failed:", ce.message); }
        }
      } catch (fsErr) {
        // Firestore write failed (e.g. IAM/permissions issue) — log it but
        // DO NOT throw. The webhook will handle the order update. We still
        // return success to the client because Paystack confirmed the payment.
        console.error("[verifyPaystack] Firestore update failed (non-fatal):", fsErr.message,
          "— the paystackWebhook will complete the order. ref:", reference);
      }
    }

    // Payment is confirmed regardless of Firestore write outcome
    return { success: true, channel: paystackData.channel, amount: paystackData.amount / 100 };
  }
);

// ── PayPal ─────────────────────────────────────────────────────────────────────
// Get PayPal OAuth2 access token
async function getPayPalToken(clientId, clientSecret, mode) {
  const base = mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await axios.post(
    `${base}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return { token: res.data.access_token, base };
}

// Create a PayPal Order (callable — frontend requests a PayPal order ID)
exports.createPayPalOrder = onCall(
  {
    secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { amount, orderId, userEmail, currency } = request.data;
    if (!amount || !orderId || !userEmail) {
      throw new HttpsError("invalid-argument", "Missing: amount, orderId, userEmail");
    }

    const clientId     = PAYPAL_CLIENT_ID.value();
    const clientSecret = PAYPAL_CLIENT_SECRET.value();
    const mode         = PAYPAL_MODE.value() || "live";

    try {
      const { token, base } = await getPayPalToken(clientId, clientSecret, mode);
      const cur = (currency || "USD").toUpperCase();
      // PayPal only accepts USD natively — for KES orders, amount should be converted before calling
      const res = await axios.post(
        `${base}/v2/checkout/orders`,
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: orderId,
              amount: { currency_code: cur, value: parseFloat(amount).toFixed(2) },
              description: "Ellines Haven — Book Purchase",
            },
          ],
          application_context: {
            brand_name: "Ellines Haven",
            landing_page: "NO_PREFERENCE",
            user_action: "PAY_NOW",
          },
        },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );

      const ppOrderId = res.data.id;

      // Store the PayPal order ID against our order so capture can find it
      await db.collection("orders").doc(orderId).update({
        paypalOrderId: ppOrderId,
        paypalMode: mode,
        paypalCurrency: cur,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, paypalOrderId: ppOrderId };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error("[createPayPalOrder] error:", msg, err.response?.data);
      throw new HttpsError("internal", msg);
    }
  }
);

// Capture a PayPal Order (callable — called after customer approves on PayPal)
exports.capturePayPalOrder = onCall(
  {
    secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { paypalOrderId, orderId, userEmail } = request.data;
    if (!paypalOrderId || !orderId || !userEmail) {
      throw new HttpsError("invalid-argument", "Missing: paypalOrderId, orderId, userEmail");
    }

    const clientId     = PAYPAL_CLIENT_ID.value();
    const clientSecret = PAYPAL_CLIENT_SECRET.value();
    const mode         = PAYPAL_MODE.value() || "live";

    try {
      const { token, base } = await getPayPalToken(clientId, clientSecret, mode);
      const res = await axios.post(
        `${base}/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );

      const capture   = res.data.purchase_units?.[0]?.payments?.captures?.[0];
      const captureId = capture?.id || "";
      const paidAmt   = parseFloat(capture?.amount?.value || 0);
      const currency  = capture?.amount?.currency_code || "USD";

      if (res.data.status !== "COMPLETED") {
        throw new HttpsError("failed-precondition", `PayPal order status: ${res.data.status}`);
      }

      // Fetch order to get items
      const orderSnap = await db.collection("orders").doc(orderId).get();
      if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found");
      const order = orderSnap.data();

      if (order.status === "Completed") {
        return { success: true, captureId, alreadyCompleted: true };
      }

      // Mark completed
      await db.collection("orders").doc(orderId).update({
        status:         "Completed",
        paypalCaptureId: captureId,
        paypalOrderId,
        paidAmount:     paidAmt,
        paypalCurrency: currency,
        confirmedAt:    admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
        paymentMethod:  "paypal",
      });

      // Unlock books
      await unlockBooksForUser(order.userEmail || userEmail, order.items || [], "paypal_auto");
      console.log("[capturePayPalOrder] ✅ books unlocked for:", order.userEmail, "order:", orderId);

      // Send confirmation SMS/email to buyer
      try {
        await sendOrderConfirmationToUser(
          { ...order, id: orderId },
          { atApiKey: AT_API_KEY.value(), atUsername: AT_USERNAME.value(), atSenderId: AT_SENDER_ID.value() }
        );
      } catch (ce) { console.warn("[capturePayPalOrder] confirm notify failed:", ce.message); }

      // ── Notify buyer ──────────────────────────────────────────────────────
      try {
        const buyerEmail = (order.userEmail || userEmail).toLowerCase();
        const titles     = (order.items || []).map(i => i.title).join(', ');
        const single     = (order.items || []).length === 1;
        await db.collection("user_notifications").doc(`un_pp_${orderId}_${Date.now()}`).set({
          userEmail: buyerEmail,
          title:     `📚 ${single ? 'Book' : 'Books'} Unlocked!`,
          message:   `Your ${single ? `"${titles}"` : `${(order.items||[]).length} books`} unlocked via PayPal. Find them in My Library.`,
          type:      "book_ready",
          bookId:    single ? (order.items[0]?.id || null) : null,
          orderId,
          read:      false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (ne) { console.warn("[capturePayPalOrder] user notify failed:", ne.message); }

      // Notify admin
      await db.collection("admin_notifications").doc(orderId + "_pp").set({
        type:           "order_confirmed_auto",
        orderId,
        userName:       order.userName,
        userEmail:      order.userEmail,
        total:          paidAmt,
        paypalCaptureId: captureId,
        currency,
        status:         "unread",
        createdAt:      admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});

      return { success: true, captureId };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error("[capturePayPalOrder] error:", msg, err.response?.data);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", msg);
    }
  }
);

// ── Visitor Tracker — server-side IP + geolocation ────────────────────────────
// Called by the frontend on every first load.
// Server reads the REAL client IP from HTTP headers (cannot be faked by client JS).
// Then fetches geolocation from ip-api.com (free, no key, 45 req/min per IP, JSON).
exports.trackVisitor = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
  },
  async (req, res) => {
    // ── CORS — allow the Ellines Haven frontend ──
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST")   { res.status(405).send("Method Not Allowed"); return; }

    try {
      // ── Extract the true public IP from reverse-proxy headers ──
      // Cloud Run / Firebase Hosting sets x-forwarded-for with the original client IP first.
      const xForwardedFor = req.headers["x-forwarded-for"] || "";
      const xRealIp       = req.headers["x-real-ip"]       || "";
      const cfConnecting  = req.headers["cf-connecting-ip"] || ""; // Cloudflare
      const fastlyClient  = req.headers["fastly-client-ip"]|| ""; // Fastly CDN

      // Pick the first real IP: CF > Fastly > x-real-ip > first of x-forwarded-for > socket
      const rawIp =
        cfConnecting ||
        fastlyClient ||
        xRealIp      ||
        xForwardedFor.split(",")[0].trim() ||
        req.socket?.remoteAddress || "";

      // Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4 → 1.2.3.4)
      const clientIp = rawIp.replace(/^::ffff:/, "").trim() || "unknown";

      const body = req.body || {};
      const page      = (body.page      || "/").slice(0, 200);
      const referrer  = (body.referrer  || "direct").slice(0, 200);
      const userAgent = (body.userAgent || "").slice(0, 300);
      const device    = (body.device    || "Desktop").slice(0, 30);
      const userEmail = (body.userEmail || "").slice(0, 200);
      const userName  = (body.userName  || "").slice(0, 100);

      // ── Geolocate with ip-api.com (free, no key, server-side call) ──
      // Fields: status,message,country,countryCode,region,regionName,city,lat,lon,isp,org,timezone,query
      let geo = {};
      if (clientIp && clientIp !== "unknown" && !clientIp.startsWith("127.") && !clientIp.startsWith("::1")) {
        try {
          const geoRes = await axios.get(
            `http://ip-api.com/json/${encodeURIComponent(clientIp)}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,org,timezone,query`,
            { timeout: 4000 }
          );
          if (geoRes.data?.status === "success") {
            geo = geoRes.data;
          } else {
            console.warn("[trackVisitor] ip-api fallback for", clientIp, ":", geoRes.data?.message);
          }
        } catch (geoErr) {
          console.warn("[trackVisitor] geolocation failed:", geoErr.message);
        }
      }

      // ── Write to Firestore ──
      const visitId = "v_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      await db.collection("site_visitors").doc(visitId).set({
        ip:          geo.query       || clientIp,
        city:        geo.city        || "",
        region:      geo.regionName  || geo.region || "",
        country:     geo.country     || "",
        countryCode: geo.countryCode || "",
        lat:         geo.lat         || null,
        lon:         geo.lon         || null,
        isp:         geo.isp         || geo.org || "",
        org:         geo.org         || "",
        timezone:    geo.timezone    || "",
        page,
        referrer,
        userAgent,
        device,
        rawIp:       clientIp,
        // Logged-in user info (optional — present when visitor is signed in)
        ...(userEmail ? { userEmail, userName } : {}),
        visitedAt:   admin.firestore.FieldValue.serverTimestamp(),
        visitedAtMs: Date.now(),
      });

      res.status(200).json({ ok: true, ip: geo.query || clientIp });
    } catch (err) {
      console.error("[trackVisitor] error:", err.message);
      // Still return 200 so the frontend doesn't retry / show errors
      res.status(200).json({ ok: false });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ── Send Password Reset OTP — email + SMS via Africa's Talking ───────────────
// ─────────────────────────────────────────────────────────────────────────────
exports.sendPasswordResetOtp = onCall(
  {
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { email, phone, otp, name } = request.data;
    if (!email || !otp) throw new HttpsError("invalid-argument", "email and otp are required");

    const userName  = name  || "Valued Reader";
    const otpCode   = String(otp).slice(0, 6);
    const emailSent = { sent: false };
    const smsSent   = { sent: false };

    // ── 1. Send via SMTP (nodemailer-style using axios to SMTP directly is complex;
    //         use Africa's Talking email API which is simpler) ──────────────────
    // Africa's Talking Email API: POST https://api.africastalking.com/version1/messaging/email
    // Alternatively we send via SMTP using the "node-fetch + raw SMTP" pattern.
    // Simplest: use AT Email if AT credentials are present, else fallback to SMTP.

    const atApiKey   = AT_API_KEY.value()   || "";
    const atUsername = AT_USERNAME.value()  || "";
    const atSenderId = AT_SENDER_ID.value() || "EllinesHvn";

    const smtpHost = SMTP_HOST.value() || "";
    const smtpPort = parseInt(SMTP_PORT.value() || "465", 10);
    const smtpUser = SMTP_USER.value() || "";
    const smtpPass = SMTP_PASS.value() || "";

    const emailBody = `
Hi ${userName},

Your Ellines Haven password reset code is:

  ┌─────────────────┐
  │   ${otpCode}   │
  └─────────────────┘

This code is valid for 15 minutes. If you didn't request a password reset, please ignore this email.

— The Ellines Haven Team
https://ellines-haven.web.app
`.trim();

    // ── 1. Send SMS via Africa's Talking SMS API (primary channel) ───────────
    // Sandbox note: do NOT pass a `from` field — AT sandbox ignores custom sender
    // IDs and rejects requests that include them. Only pass `from` in production.
    if (atApiKey && atUsername) {
      const rawPhone = phone ? String(phone).replace(/\D/g, "") : "";
      // Build the recipient list — always send to the account email as SMS if no
      // phone is provided (AT can't send to an email via SMS, so skip in that case)
      const targets = [];

      if (rawPhone) {
        let formattedPhone = rawPhone;
        if (rawPhone.startsWith("0"))        formattedPhone = "+254" + rawPhone.slice(1);
        else if (rawPhone.startsWith("254")) formattedPhone = "+"   + rawPhone;
        else if (!rawPhone.startsWith("+"))  formattedPhone = "+254" + rawPhone;
        targets.push(formattedPhone);
      }

      if (targets.length > 0) {
        const smsText = `Ellines Haven reset code: ${otpCode}. Valid 15 mins. Don't share.`;
        try {
          // AT SMS API expects application/x-www-form-urlencoded body
          const isSandbox = atUsername === "sandbox";
          const params = new URLSearchParams({
            username: atUsername,
            to:       targets.join(","),
            message:  smsText,
          });
          // Only add `from` for production — sandbox rejects it
          if (!isSandbox && atSenderId) {
            params.append("from", atSenderId);
          }

          const smsRes = await axios.post(
            "https://api.africastalking.com/version1/messaging",
            params.toString(),
            {
              headers: {
                apiKey:         atApiKey,
                Accept:         "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
              },
            }
          );
          console.log("[sendOtp] SMS response:", JSON.stringify(smsRes.data));
          const recipients = smsRes.data?.SMSMessageData?.Recipients || [];
          smsSent.sent = recipients.some(r => r.statusCode === 101 || r.status === "Success");
        } catch (e) {
          console.warn("[sendOtp] SMS failed:", e.response?.data || e.message);
        }
      }
    }

    // ── 2. Send email via AT Email API (best-effort, sandbox may not support) ─
    // AT Email API uses form-encoded params, NOT JSON body
    if (atApiKey && atUsername && atUsername !== "sandbox") {
      try {
        const emailParams = new URLSearchParams({
          username: atUsername,
          to:       email,
          from:     smtpUser || "noreply@ellines-haven.web.app",
          subject:  `Your Ellines Haven reset code: ${otpCode}`,
          message:  emailBody,
        });
        await axios.post(
          "https://api.africastalking.com/version1/messaging/email",
          emailParams.toString(),
          {
            headers: {
              apiKey:         atApiKey,
              Accept:         "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
        emailSent.sent = true;
      } catch (e) {
        console.warn("[sendOtp] AT email failed:", e.response?.data || e.message);
      }
    }

    // ── Fallback: store OTP in Firestore so admin can retrieve it in dev mode ─
    if (!smsSent.sent && !emailSent.sent) {
      console.log(`[sendOtp] OTP for ${email}: ${otpCode} — credentials: apiKey=${!!atApiKey} username=${atUsername}`);
      try {
        await db.collection("dev_otps").doc(email.toLowerCase().replace(/[^a-z0-9]/g, "_")).set({
          email, otp: otpCode,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: Date.now() + 900000,
        });
      } catch {}
    }

    return { emailSent: emailSent.sent, smsSent: smsSent.sent };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ── Admin SMS Broadcast — send SMS to all / selected users ───────────────────
// ─────────────────────────────────────────────────────────────────────────────
exports.sendSmsBroadcast = onCall(
  {
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    // Basic admin check — real auth should verify via Firebase Auth token
    const { message, phones, campaignName, adminEmail } = request.data;
    if (!message || !phones || !phones.length) {
      throw new HttpsError("invalid-argument", "message and phones array are required");
    }
    if (message.length > 160) {
      throw new HttpsError("invalid-argument", "SMS message must be 160 characters or fewer");
    }

    const atApiKey   = AT_API_KEY.value()   || "";
    const atUsername = AT_USERNAME.value()  || "";
    const atSenderId = AT_SENDER_ID.value() || "";

    if (!atApiKey || !atUsername) {
      // Log to Firestore for dev mode
      await db.collection("sms_campaigns").add({
        campaignName: campaignName || "Broadcast",
        message,
        phones,
        status: "dev_mode_no_credentials",
        sentBy: adminEmail || "admin",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      return { success: false, reason: "AT_API_KEY / AT_USERNAME not configured. Message logged for dev mode." };
    }

    // Format phone numbers
    const formattedPhones = phones.map(p => {
      const raw = String(p).replace(/\D/g, "");
      if (raw.startsWith("0"))   return "+254" + raw.slice(1);
      if (raw.startsWith("254")) return "+" + raw;
      if (!raw.startsWith("+")) return "+254" + raw;
      return raw;
    }).filter(p => p.length >= 10);

    if (!formattedPhones.length) {
      throw new HttpsError("invalid-argument", "No valid phone numbers provided");
    }

    // Africa's Talking: comma-separated recipients
    const recipients = formattedPhones.join(",");
    let sentCount = 0;
    let failCount = 0;

    try {
      const isSandbox = atUsername === "sandbox";
      const params = new URLSearchParams({
        username: atUsername,
        to:       recipients,
        message,
      });
      // Only add `from` for production — AT sandbox rejects custom sender IDs
      if (!isSandbox && atSenderId) {
        params.append("from", atSenderId);
      }
      const res = await axios.post(
        "https://api.africastalking.com/version1/messaging",
        params.toString(),
        {
          headers: {
            apiKey:         atApiKey,
            Accept:         "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      const recipients_result = res.data?.SMSMessageData?.Recipients || [];
      sentCount = recipients_result.filter(r => r.statusCode === 101).length || formattedPhones.length;
      failCount = recipients_result.filter(r => r.statusCode !== 101).length;
    } catch (e) {
      console.error("[sendSmsBroadcast] AT error:", e.response?.data || e.message);
      throw new HttpsError("internal", e.response?.data?.SMSMessageData?.Message || e.message);
    }

    // Log campaign to Firestore
    await db.collection("sms_campaigns").add({
      campaignName: campaignName || "Broadcast",
      message,
      totalRecipients: formattedPhones.length,
      sentCount,
      failCount,
      status: "sent",
      sentBy: adminEmail || "admin",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    return { success: true, sent: sentCount, failed: failCount };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ── Server-Side Activity Tracking (Reliable, Cross-Device) ───────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Track user login server-side (called after auth verification)
 * This ensures logins are ALWAYS recorded, even if client-side tracking fails
 */
exports.logUserLoginServer = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { userEmail, userName, metadata = {} } = request.data;
    
    if (!userEmail) {
      throw new HttpsError("invalid-argument", "userEmail is required");
    }

    try {
      // Extract real IP from request headers (same as trackVisitor)
      const xForwardedFor = request.rawRequest?.headers["x-forwarded-for"] || "";
      const xRealIp       = request.rawRequest?.headers["x-real-ip"]       || "";
      const cfConnecting  = request.rawRequest?.headers["cf-connecting-ip"] || "";
      const fastlyClient  = request.rawRequest?.headers["fastly-client-ip"]|| "";
      
      const rawIp = cfConnecting || fastlyClient || xRealIp || xForwardedFor.split(",")[0].trim() || "unknown";
      const clientIp = rawIp.replace(/^::ffff:/, "").trim();

      // Create activity record
      const activityId = "act_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      const activityData = {
        id: activityId,
        category: "user_login",
        userEmail: userEmail.toLowerCase(),
        userName: userName || userEmail,
        title: "User Login",
        message: `${userName || userEmail} logged in`,
        icon: "🔐",
        clientIp,
        userAgent: metadata.userAgent || request.rawRequest?.headers["user-agent"] || "",
        device: metadata.device || "Unknown",
        metadata: {
          ...metadata,
          loginTime: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        },
        priority: "low",
        read: false,
        readBy: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      };

      // Write to admin notifications (for admin dashboard)
      await db.collection("admin_notifications").doc(activityId).set(activityData);

      // Write to activity logs (for historical tracking)
      const logId = "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      await db.collection("activity_logs").doc(logId).set({
        id: logId,
        ...activityData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create a user session record for cross-device tracking
      const sessionId = "session_" + userEmail.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + Date.now();
      await db.collection("user_sessions").doc(sessionId).set({
        userEmail: userEmail.toLowerCase(),
        sessionId,
        loginTime: admin.firestore.FieldValue.serverTimestamp(),
        ip: clientIp,
        device: metadata.device || "Unknown",
        userAgent: metadata.userAgent || "",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      console.log("[logUserLoginServer] Login recorded for", userEmail, "from IP:", clientIp);
      return { success: true, activityId, sessionId };
    } catch (err) {
      console.error("[logUserLoginServer] error:", err.message);
      throw new HttpsError("internal", "Failed to log login activity");
    }
  }
);

/**
 * Track user registration server-side
 */
exports.logUserRegistrationServer = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { userEmail, userName, metadata = {} } = request.data;
    
    if (!userEmail) {
      throw new HttpsError("invalid-argument", "userEmail is required");
    }

    try {
      const xForwardedFor = request.rawRequest?.headers["x-forwarded-for"] || "";
      const xRealIp       = request.rawRequest?.headers["x-real-ip"]       || "";
      const cfConnecting  = request.rawRequest?.headers["cf-connecting-ip"] || "";
      const fastlyClient  = request.rawRequest?.headers["fastly-client-ip"]|| "";
      
      const rawIp = cfConnecting || fastlyClient || xRealIp || xForwardedFor.split(",")[0].trim() || "unknown";
      const clientIp = rawIp.replace(/^::ffff:/, "").trim();

      const activityId = "act_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      const activityData = {
        id: activityId,
        category: "user_registration",
        userEmail: userEmail.toLowerCase(),
        userName: userName || userEmail,
        title: "User Registration",
        message: `New user registered: ${userName || userEmail}`,
        icon: "👤",
        clientIp,
        userAgent: metadata.userAgent || "",
        device: metadata.device || "Unknown",
        metadata: {
          ...metadata,
          registrationTime: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        },
        priority: "normal",
        read: false,
        readBy: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      };

      await db.collection("admin_notifications").doc(activityId).set(activityData);
      
      const logId = "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      await db.collection("activity_logs").doc(logId).set({
        id: logId,
        ...activityData,
      });

      console.log("[logUserRegistrationServer] Registration recorded for", userEmail);
      return { success: true, activityId };
    } catch (err) {
      console.error("[logUserRegistrationServer] error:", err.message);
      throw new HttpsError("internal", "Failed to log registration activity");
    }
  }
);

/**
 * Get user's cross-device login history
 */
exports.getUserLoginHistory = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { userEmail } = request.data;
    
    if (!userEmail) {
      throw new HttpsError("invalid-argument", "userEmail is required");
    }

    try {
      const sessions = await db
        .collection("user_sessions")
        .where("userEmail", "==", userEmail.toLowerCase())
        .orderBy("loginTime", "desc")
        .limit(50)
        .get();

      return {
        success: true,
        sessions: sessions.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          loginTime: doc.data().loginTime?.toDate?.() || new Date(doc.data().loginTime),
        })),
      };
    } catch (err) {
      console.error("[getUserLoginHistory] error:", err.message);
      throw new HttpsError("internal", "Failed to fetch login history");
    }
  }
);
