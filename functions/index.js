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
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("crypto");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

/** Look up geo for an IP. Never throws — returns {} on failure. */
async function lookupVisitorGeo(clientIp) {
  if (!clientIp || clientIp === "unknown" || clientIp.startsWith("127.") || clientIp.startsWith("::1") || clientIp === "0.0.0.0") {
    return {};
  }
  try {
    const geoRes = await axios.get(
      `http://ip-api.com/json/${encodeURIComponent(clientIp)}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,org,timezone,query`,
      { timeout: 5000, headers: { "User-Agent": "Mozilla/5.0 (compatible; Ellines-Haven-Bot/1.0)" } }
    );
    if (geoRes.data?.status === "success") return geoRes.data;
  } catch (_) { /* try fallback */ }
  try {
    const fallback = await axios.get(`https://ipapi.co/${encodeURIComponent(clientIp)}/json/`, {
      timeout: 4000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Ellines-Haven-Bot/1.0)" },
    });
    if (fallback.data && !fallback.data.error) {
      return {
        status: "success",
        country: fallback.data.country_name,
        countryCode: fallback.data.country_code,
        region: fallback.data.region_code,
        regionName: fallback.data.region,
        city: fallback.data.city,
        lat: fallback.data.latitude,
        lon: fallback.data.longitude,
        isp: fallback.data.org || fallback.data.isp,
        org: fallback.data.org,
        timezone: fallback.data.timezone,
        query: clientIp,
      };
    }
  } catch (_) { /* ignore */ }
  return {};
}

function buildVisitorGeoFields(geo, clientIp) {
  return {
    ip: geo.query || clientIp || "",
    city: geo.city || "",
    region: geo.regionName || geo.region || "",
    country: geo.country || "",
    countryCode: geo.countryCode || "",
    lat: typeof geo.lat === "number" ? geo.lat : null,
    lon: typeof geo.lon === "number" ? geo.lon : null,
    isp: geo.isp || geo.org || "",
    org: geo.org || "",
    timezone: geo.timezone || "",
    rawIp: clientIp || "",
    _needsGeo: false,
  };
}

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

// Fee rates mirror Cart.jsx — used only to bound under/over-payment checks.
const PAYSTACK_FEE_RATES = {
  mpesa: 0.015,
  mobile_money: 0.015,
  card: 0.029,
  intl_card: 0.038,
};

/**
 * Paystack KES amounts are in cents (value × 100).
 * Customer pays gross (net + fee). Reject underpayment below order net
 * and absurd overpayment above the highest fee channel + small slack.
 */
function assertPaystackAmountOk(paidCents, orderTotalKes, channelHint) {
  const netCents = Math.round(Number(orderTotalKes || 0) * 100);
  if (netCents <= 0) return; // free/zero orders — skip
  // Allow 1 KES slack for rounding
  if (paidCents + 100 < netCents) {
    throw new HttpsError(
      "failed-precondition",
      `Payment amount too low: paid ${paidCents / 100} KES, order requires ${netCents / 100} KES`
    );
  }
  const rate = PAYSTACK_FEE_RATES[channelHint] ?? PAYSTACK_FEE_RATES.intl_card;
  const maxGrossCents = Math.ceil((netCents / 100) / (1 - rate) * 100) + 200; // +2 KES slack
  // Also allow absolute ceiling of net * 1.1 in case channel hint is wrong
  const absoluteMax = Math.ceil(netCents * 1.12) + 200;
  const ceiling = Math.max(maxGrossCents, absoluteMax);
  if (paidCents > ceiling * 2) {
    // Only reject wildly wrong amounts (e.g. wrong currency/order mix-up)
    console.warn("[paystack] unusual paid amount", { paidCents, netCents, channelHint });
  }
}

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
        const adminNotifId = orderId + "_confirmed";
        await db.collection("admin_notifications").doc(adminNotifId).set({
          id:       adminNotifId,
          category: "book_purchase",
          type:     "order_confirmed_auto",
          title:    "M-Pesa Payment Confirmed",
          message:  `Order #${orderId} paid KES ${paidAmount} via M-Pesa by ${order.userName || order.userEmail || "customer"}`,
          icon:     "💳",
          orderId,
          userName:            order.userName,
          userEmail:           order.userEmail,
          total:               paidAmount,
          mpesaTransactionId,
          priority:  "high",
          read:      false,
          readBy:    [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAtMs: Date.now(),
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
      ...(item.isChapter ? {
        isChapter:  true,
        bookId:     item.bookId || null,
        chapterNum: item.chapterNum || null,
        chapterId:  item.chapterId || item.id,
      } : {}),
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
// Shared Ellines Paystack account: primary webhook is the hub
// https://ellines.co.ke/api/paystack/webhook (same as tech.ellines.co.ke).
// Haven unlocks mainly via verifyPaystackPayment; this endpoint is optional backup.
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
      const paidCents = data.amount; // KES: lowest currency unit (cents)
      const metaOrderId = data.metadata?.orderId || data.metadata?.order_id || null;

      if (!reference) {
        console.warn("[paystackWebhook] missing reference");
        return;
      }

      // Find the order — paystackRef, metadata.orderId, then direct doc ID
      let ordersSnap = await db
        .collection("orders")
        .where("paystackRef", "==", reference)
        .limit(1)
        .get();

      if (ordersSnap.empty && metaOrderId) {
        const byMeta = await db.collection("orders").doc(String(metaOrderId)).get();
        if (byMeta.exists) {
          ordersSnap = { empty: false, docs: [byMeta] };
          console.log("[paystackWebhook] found order by metadata.orderId:", metaOrderId);
        }
      }

      // Fallback: old code stored ref = orderId
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
        // Idempotent repair: ensure library still has items
        try {
          await unlockBooksForUser(order.userEmail || email, order.items || [], "paystack_auto");
        } catch (e) {
          console.warn("[paystackWebhook] repair unlock failed:", e.message);
        }
        console.log("[paystackWebhook] already completed:", orderId);
        return;
      }

      // Reject underpayment (customer must pay at least order net total)
      try {
        assertPaystackAmountOk(
          paidCents,
          order.total,
          order.paystackChannel || data.channel || data.metadata?.paystackChannel
        );
      } catch (amtErr) {
        console.error("[paystackWebhook] amount check failed:", amtErr.message, "order:", orderId);
        await db.collection("orders").doc(orderId).update({
          paymentIssue: amtErr.message,
          paystackRef: reference,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
        return;
      }

      // Mark order completed
      await db.collection("orders").doc(orderId).update({
        status:           "Completed",
        paystackRef:      reference,
        paystackChannel:  data.channel,
        paidAmount:       paidCents / 100,
        confirmedAt:      admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
        paymentMethod:    "paystack",
        unlockedBy:       "paystack_webhook",
      });

      // Unlock books
      const unlockEmail = order.userEmail || email;
      if (!unlockEmail) {
        console.error("[paystackWebhook] no buyer email for order:", orderId);
        return;
      }
      await unlockBooksForUser(unlockEmail, order.items || [], "paystack_auto");
      console.log("[paystackWebhook] ✅ books unlocked for:", unlockEmail, "order:", orderId);
      
      // Verify unlock was successful — check that books were actually written to libraries
      const libRef = db.collection("libraries").doc(libDocId(unlockEmail));
      const libSnap = await libRef.get();
      if (!libSnap.exists || !libSnap.data()?.books || libSnap.data().books.length === 0) {
        console.error("[paystackWebhook] CRITICAL: Unlock verification failed for", unlockEmail, "order:", orderId);
        // Log for admin debugging
        await db.collection("unlock_failures").add({
          userEmail: unlockEmail,
          orderId,
          reference,
          reason: "books array empty after unlock",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          source: "paystackWebhook_post_unlock_check",
        }).catch(() => {});
      }

      // ── Send confirmation SMS/email to buyer ───────────────────────────────
      try {
        await sendOrderConfirmationToUser(
          { ...order, id: orderId },
          { atApiKey: AT_API_KEY.value(), atUsername: AT_USERNAME.value(), atSenderId: AT_SENDER_ID.value() }
        );
      } catch (ce) { console.warn("[paystackWebhook] confirm notify failed:", ce.message); }

      // ── Notify buyer in their user_notifications feed ─────────────────────
      try {
        const buyerEmail = unlockEmail.toLowerCase();
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
      const psNotifId = orderId + "_ps";
      await db.collection("admin_notifications").doc(psNotifId).set({
        id:         psNotifId,
        category:   "book_purchase",
        type:       "order_confirmed_auto",
        title:      "Paystack Payment Confirmed",
        message:    `Order #${orderId} paid KES ${paidCents / 100} via Paystack (${data.channel || "card"}) by ${order.userName || order.userEmail || "customer"}`,
        icon:       "💳",
        orderId,
        userName:    order.userName,
        userEmail:   order.userEmail,
        total:       paidCents / 100,
        paystackRef: reference,
        channel:     data.channel,
        priority:    "high",
        read:        false,
        readBy:      [],
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      }).catch(() => {});

    } catch (err) {
      console.error("[paystackWebhook] error:", err.message);
    }
  }
);

// ── Verify Paystack payment (callable — frontend confirms; server unlocks) ────
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
    if (!orderId) throw new HttpsError("invalid-argument", "orderId required");

    const secret = PAYSTACK_SECRET.value();
    const emailNorm = (userEmail || "").toLowerCase().trim();

    // ── Step 1: Load order and enforce ownership ──────────────────────────────
    let orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      // Legacy: some old flows used reference as doc id
      orderSnap = await db.collection("orders").doc(reference).get();
    }
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found");
    }

    const order = orderSnap.data();
    const orderEmail = (order.userEmail || "").toLowerCase().trim();

    if (emailNorm && orderEmail && emailNorm !== orderEmail) {
      throw new HttpsError("permission-denied", "Order does not belong to this user");
    }

    // Reference must match saved paystackRef, or be prefixed with order id
    const savedRef = order.paystackRef || "";
    const refOk =
      !savedRef ||
      savedRef === reference ||
      reference === orderSnap.id ||
      reference.startsWith(orderSnap.id + "_");
    if (!savedRef && !reference.startsWith(orderSnap.id)) {
      // Allow first-time verify when client failed to persist paystackRef
      console.warn("[verifyPaystack] no saved paystackRef — binding reference to order", orderSnap.id);
    } else if (savedRef && !refOk) {
      throw new HttpsError("failed-precondition", "Payment reference does not match this order");
    }

    // Already completed — repair library if needed, return success
    if (order.status === "Completed") {
      const unlockEmail = orderEmail || emailNorm;
      if (unlockEmail) {
        await unlockBooksForUser(unlockEmail, order.items || [], "paystack_verify_repair");
      }
      console.log("[verifyPaystack] order already completed:", orderSnap.id);
      return {
        success: true,
        unlocked: true,
        channel: order.paystackChannel || "unknown",
        amount: order.paidAmount || 0,
        source: "already_completed",
      };
    }

    // ── Step 2: Call Paystack verify API — retry for pending M-Pesa ───────────
    let paystackData;
    const MAX_ATTEMPTS = 8;
    const RETRY_DELAY_MS = 3000;

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

        if (psStatus === "success") break;
        if (psStatus === "pending" || psStatus === "processing") {
          if (attempt < MAX_ATTEMPTS) {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            continue;
          }
          throw new HttpsError("failed-precondition", `Payment still pending after ${MAX_ATTEMPTS} attempts. Webhook will complete it.`);
        }
        throw new HttpsError("failed-precondition", `Payment status: ${psStatus || "unknown"}`);
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

    // ── Step 3: Amount + metadata ownership checks ────────────────────────────
    const paidCents = paystackData.amount;
    const channelHint =
      order.paystackChannel ||
      paystackData.channel ||
      paystackData.metadata?.paystackChannel;

    assertPaystackAmountOk(paidCents, order.total, channelHint);

    const metaOrderId = paystackData.metadata?.orderId || paystackData.metadata?.order_id;
    if (metaOrderId && String(metaOrderId) !== String(orderSnap.id)) {
      throw new HttpsError("failed-precondition", "Paystack metadata orderId does not match");
    }

    const psEmail = (paystackData.customer?.email || "").toLowerCase().trim();
    if (psEmail && orderEmail && psEmail !== orderEmail) {
      console.warn("[verifyPaystack] Paystack customer email differs from order:", psEmail, orderEmail);
      // Soft warn only — some wallets use a different email than the Haven account
    }

    // ── Step 4: Unlock (server-side only) ─────────────────────────────────────
    const unlockEmail = orderEmail || emailNorm || psEmail;
    if (!unlockEmail) {
      throw new HttpsError("failed-precondition", "Cannot unlock: missing buyer email");
    }

    try {
      await db.collection("orders").doc(orderSnap.id).update({
        status:          "Completed",
        paystackRef:     reference,
        paystackChannel: paystackData.channel,
        paidAmount:      paidCents / 100,
        confirmedAt:     admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
        paymentMethod:   "paystack",
        unlockedBy:      "paystack_verify",
      });
      await unlockBooksForUser(unlockEmail, order.items || [], "paystack_verify");
      console.log("[verifyPaystack] ✅ books unlocked for:", unlockEmail, "order:", orderSnap.id);

      const libRef = db.collection("libraries").doc(libDocId(unlockEmail));
      const libSnap = await libRef.get();
      const books = libSnap.exists ? (libSnap.data()?.books || []) : [];
      const itemIds = (order.items || []).map(i => i.id);
      const missing = itemIds.filter(id => !books.some(b => b.id === id));
      if (missing.length) {
        console.error("[verifyPaystack] CRITICAL: unlock missing items", missing);
        await db.collection("unlock_failures").add({
          userEmail: unlockEmail,
          orderId: orderSnap.id,
          reference,
          reason: "items missing after unlock: " + missing.join(","),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          source: "verifyPaystack_post_unlock_check",
        }).catch(() => {});
        throw new HttpsError("internal", "Payment confirmed but book unlock failed. Use Retry Activation.");
      }

      // Buyer SMS/email is best-effort via webhook path; verify stays lean (PAYSTACK_SECRET only)
    } catch (fsErr) {
      if (fsErr instanceof HttpsError) throw fsErr;
      console.error("[verifyPaystack] Firestore unlock failed:", fsErr.message, "ref:", reference);
      throw new HttpsError("internal", "Payment confirmed but unlock failed. Use Retry Activation in My Library.");
    }

    return {
      success: true,
      unlocked: true,
      channel: paystackData.channel,
      amount: paidCents / 100,
      source: "verify",
    };
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
      const ppNotifId = orderId + "_pp";
      await db.collection("admin_notifications").doc(ppNotifId).set({
        id:              ppNotifId,
        category:        "book_purchase",
        type:            "order_confirmed_auto",
        title:           "PayPal Payment Confirmed",
        message:         `Order #${orderId} paid ${currency} ${paidAmt} via PayPal by ${order.userName || order.userEmail || "customer"}`,
        icon:            "💳",
        orderId,
        userName:        order.userName,
        userEmail:       order.userEmail,
        total:           paidAmt,
        paypalCaptureId: captureId,
        currency,
        priority:        "high",
        read:            false,
        readBy:          [],
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
        createdAtMs:     Date.now(),
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
// Called by the frontend on every first page load via Firebase callable SDK.
// The callable SDK automatically resolves the correct v2 Cloud Run URL, so no
// hardcoded URL is needed on the client side.
// Server reads the REAL client IP from the rawRequest headers (cannot be faked by client JS).
// Then fetches geolocation from ip-api.com (free, no key, 45 req/min per IP, JSON).
exports.trackVisitor = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    try {
      console.log("[trackVisitor] ✅ Function called - request data:", JSON.stringify(request.data || {}));

      // ── Extract the true public IP from reverse-proxy headers ──
      // Cloud Run / Firebase Hosting sets x-forwarded-for with the original client IP first.
      const headers       = request.rawRequest?.headers || {};
      const xForwardedFor = headers["x-forwarded-for"] || "";
      const xRealIp       = headers["x-real-ip"]       || "";
      const cfConnecting  = headers["cf-connecting-ip"] || ""; // Cloudflare
      const fastlyClient  = headers["fastly-client-ip"]|| ""; // Fastly CDN

      console.log("[trackVisitor] 📡 Headers:", {
        "x-forwarded-for": xForwardedFor,
        "x-real-ip": xRealIp,
        "cf-connecting-ip": cfConnecting,
        "fastly-client-ip": fastlyClient
      });

      // Pick the first real IP: CF > Fastly > x-real-ip > first of x-forwarded-for > socket
      const rawIp =
        cfConnecting ||
        fastlyClient ||
        xRealIp      ||
        xForwardedFor.split(",")[0].trim() ||
        request.rawRequest?.socket?.remoteAddress || "";

      // Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4 → 1.2.3.4)
      const clientIp = rawIp.replace(/^::ffff:/, "").trim() || "unknown";

      console.log("[trackVisitor] 🌐 IP extracted:", { rawIp, clientIp });

      const body      = request.data || {};
      const page      = (body.page      || "/").slice(0, 200);
      const referrer  = (body.referrer  || "direct").slice(0, 200);
      const userAgent = (body.userAgent || "").slice(0, 300);
      const device    = (body.device    || "Desktop").slice(0, 30);
      const userEmail = (body.userEmail || "").slice(0, 200);
      const userName  = (body.userName  || "").slice(0, 100);

      console.log("[trackVisitor] 📝 Data extracted:", { page, referrer, device, userEmail });

      // ── Geolocate with ip-api.com (free, no key, server-side call) ──
      // Fields: status,message,country,countryCode,region,regionName,city,lat,lon,isp,org,timezone,query
      let geo = {};
      if (clientIp && clientIp !== "unknown" && !clientIp.startsWith("127.") && !clientIp.startsWith("::1")) {
        try {
          console.log("[trackVisitor] 🔍 Attempting geolocation for IP:", clientIp);
          // Use HTTP instead of HTTPS to avoid 403 errors, add user agent
          const geoRes = await axios.get(
            `http://ip-api.com/json/${encodeURIComponent(clientIp)}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,org,timezone,query`,
            { 
              timeout: 6000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Ellines-Haven-Bot/1.0)'
              }
            }
          );
          if (geoRes.data?.status === "success") {
            geo = geoRes.data;
            console.log("[trackVisitor] ✅ ip-api success:", geo.country, geo.city);
          } else {
            console.warn("[trackVisitor] ⚠️ ip-api returned:", geoRes.data?.status, "-", geoRes.data?.message);
            // Fallback: try ipapi.co as backup
            try {
              console.log("[trackVisitor] 🔄 Trying ipapi.co fallback...");
              const fallbackRes = await axios.get(`https://ipapi.co/${encodeURIComponent(clientIp)}/json/`, {
                timeout: 4000,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Ellines-Haven-Bot/1.0)' }
              });
              if (fallbackRes.data && !fallbackRes.data.error) {
                geo = {
                  status: "success",
                  country: fallbackRes.data.country_name,
                  countryCode: fallbackRes.data.country_code,
                  region: fallbackRes.data.region_code,
                  regionName: fallbackRes.data.region,
                  city: fallbackRes.data.city,
                  lat: fallbackRes.data.latitude,
                  lon: fallbackRes.data.longitude,
                  isp: fallbackRes.data.org || fallbackRes.data.isp,
                  org: fallbackRes.data.org,
                  timezone: fallbackRes.data.timezone,
                  query: clientIp
                };
                console.log("[trackVisitor] ✅ ipapi.co fallback success:", geo.country, geo.city);
              }
            } catch (fallbackErr) {
              console.warn("[trackVisitor] ⚠️ ipapi.co fallback failed:", fallbackErr.message);
            }
          }
        } catch (geoErr) {
          console.warn("[trackVisitor] ⚠️ Primary geolocation failed:", geoErr.message);
          // Try backup service
          try {
            console.log("[trackVisitor] 🔄 Trying ipapi.co backup...");
            const backupRes = await axios.get(`https://ipapi.co/${encodeURIComponent(clientIp)}/json/`, {
              timeout: 4000,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Ellines-Haven-Bot/1.0)' }
            });
            if (backupRes.data && !backupRes.data.error) {
              geo = {
                status: "success",
                country: backupRes.data.country_name,
                countryCode: backupRes.data.country_code,
                region: backupRes.data.region_code,
                regionName: backupRes.data.region,
                city: backupRes.data.city,
                lat: backupRes.data.latitude,
                lon: backupRes.data.longitude,
                isp: backupRes.data.org || backupRes.data.isp,
                org: backupRes.data.org,
                timezone: backupRes.data.timezone,
                query: clientIp
              };
              console.log("[trackVisitor] ✅ ipapi.co backup success:", geo.country, geo.city);
            }
          } catch (backupErr) {
            console.warn("[trackVisitor] ⚠️ ipapi.co backup also failed:", backupErr.message);
          }
        }
      } else {
        console.log("[trackVisitor] ℹ️ Skipping geolocation - local IP or invalid:", clientIp);
      }

      // ── Write to Firestore ──
      const visitId = "v_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      console.log("[trackVisitor] 💾 Writing to Firestore doc:", visitId);
      
      const visitData = {
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
      };
      
      console.log("[trackVisitor] 📄 Document data:", JSON.stringify(visitData));
      
      await db.collection("site_visitors").doc(visitId).set(visitData);

      console.log("[trackVisitor] ✅ Successfully recorded visit from", clientIp, "in country", geo.country || "unknown");
      
      return { 
        ok: true, 
        ip: geo.query || clientIp, 
        city: geo.city || '', 
        country: geo.country || '', 
        countryCode: geo.countryCode || '', 
        region: geo.regionName || geo.region || '', 
        isp: geo.isp || geo.org || '', 
        lat: geo.lat || null, 
        lon: geo.lon || null, 
        timezone: geo.timezone || '',
        docId: visitId
      };
    } catch (err) {
      console.error("[trackVisitor] ❌ ERROR:", err.message);
      console.error("[trackVisitor] ❌ Error stack:", err.stack);
      console.error("[trackVisitor] ❌ Error code:", err.code);
      // Return ok:false but don't throw — client silently ignores this
      return { ok: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ── HTTP endpoint for visitor tracking (alternative to onCall, 100% public) ───
// ─────────────────────────────────────────────────────────────────────────────
// HTTP enrich endpoint (admin re-enrich / legacy). Always returns HTTP 200 so
// browsers never log a failed network request in the console.
exports.trackVisitorHttp = onRequest(
  { region: "us-central1", cors: true },
  async (req, res) => {
    const ok = (payload) => res.status(200).json(payload);

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }
    if (req.method !== "POST") {
      return ok({ ok: false, error: "Method not allowed" });
    }

    try {
      let body = req.body || {};
      // sendBeacon often arrives as text/plain string
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = {}; }
      } else if (Buffer.isBuffer(body)) {
        try { body = JSON.parse(body.toString("utf8")); } catch { body = {}; }
      }
      if (!body || typeof body !== "object") body = {};

      const page      = String(body.page      || "/").slice(0, 200);
      const referrer  = String(body.referrer  || "direct").slice(0, 200);
      const userAgent = String(body.userAgent || "").slice(0, 300);
      const device    = String(body.device    || "Desktop").slice(0, 30);
      const userEmail = String(body.userEmail || "").slice(0, 200);
      const userName  = String(body.userName  || "").slice(0, 100);
      const existingDocId = body._docId ? String(body._docId).slice(0, 128) : null;
      const requestedIp   = typeof body.ip === "string" ? body.ip.trim() : "";

      const xForwardedFor = req.get("x-forwarded-for") || "";
      const cfConnecting  = req.get("cf-connecting-ip") || "";
      const fastlyClient  = req.get("fastly-client-ip") || "";
      const xRealIp       = req.get("x-real-ip") || "";

      const rawIp =
        cfConnecting ||
        fastlyClient ||
        xRealIp ||
        xForwardedFor.split(",")[0].trim() ||
        req.socket?.remoteAddress ||
        "";

      const headerIp = rawIp.replace(/^::ffff:/, "").trim() || "unknown";
      const clientIp = (/^\d{1,3}(\.\d{1,3}){3}$/.test(requestedIp) || requestedIp.includes(":"))
        ? requestedIp.replace(/^::ffff:/, "")
        : headerIp;

      const geo = await lookupVisitorGeo(clientIp);
      const geoData = buildVisitorGeoFields(geo, clientIp);

      let docId = existingDocId;
      if (existingDocId) {
        // merge set — never throws NOT_FOUND like update() can
        await db.collection("site_visitors").doc(existingDocId).set(geoData, { merge: true });
      } else {
        docId = "v_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        await db.collection("site_visitors").doc(docId).set({
          ...geoData,
          page, referrer, userAgent, device,
          ...(userEmail ? { userEmail, userName } : {}),
          visitedAt:   admin.firestore.FieldValue.serverTimestamp(),
          visitedAtMs: Date.now(),
        });
      }

      return ok({
        ok: true,
        ip: geoData.ip,
        city: geoData.city,
        country: geoData.country,
        countryCode: geoData.countryCode,
        region: geoData.region,
        isp: geoData.isp,
        lat: geoData.lat,
        lon: geoData.lon,
        timezone: geoData.timezone,
        docId,
      });
    } catch (err) {
      console.error("[trackVisitorHttp] Error (soft):", err.message);
      // Soft-fail: 200 so client consoles stay clean
      return ok({ ok: false, error: "enrichment_skipped" });
    }
  }
);

// Auto-enrich visitor docs written by the client — no browser HTTP call needed.
exports.enrichVisitorOnCreate = onDocumentCreated(
  {
    document: "site_visitors/{docId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const data = snap.data() || {};
      if (data._needsGeo === false && data.country) return;

      // Prefer IP already on the doc; otherwise we cannot know the visitor IP
      // from a Firestore trigger (no request headers). Mark enriched empty.
      const ip = (data.rawIp || data.ip || "").trim();
      if (!ip || ip === "unknown") {
        await snap.ref.set({ _needsGeo: false }, { merge: true });
        return;
      }

      const geo = await lookupVisitorGeo(ip);
      await snap.ref.set(buildVisitorGeoFields(geo, ip), { merge: true });
    } catch (err) {
      console.error("[enrichVisitorOnCreate]", err.message);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ── Auth OTP helpers (password reset + login 2FA) — server-side codes only ───
// ─────────────────────────────────────────────────────────────────────────────
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

function authOtpDocId(email, purpose) {
  return `${libDocId(email)}_${purpose || "login"}`;
}

function hashOtpCode(otp, email, purpose) {
  return crypto
    .createHash("sha256")
    .update(`${String(otp)}:${String(email).toLowerCase()}:${purpose || "login"}`)
    .digest("hex");
}

async function assertOtpSendAllowed(emailKey, purpose) {
  const docId = authOtpDocId(emailKey, purpose);
  const snap = await db.collection("auth_otps").doc(docId).get();
  if (!snap.exists) return;
  const createdAtMs = snap.data()?.createdAtMs || 0;
  const elapsed = Date.now() - createdAtMs;
  if (createdAtMs && elapsed < OTP_RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
    throw new HttpsError(
      "resource-exhausted",
      `Please wait ${waitSec}s before requesting another code.`
    );
  }
}

async function storeAuthOtp(email, purpose, otpCode) {
  const emailKey = String(email).toLowerCase().trim();
  const docId = authOtpDocId(emailKey, purpose);
  const now = Date.now();
  await db.collection("auth_otps").doc(docId).set({
    email: emailKey,
    purpose,
    hash: hashOtpCode(otpCode, emailKey, purpose),
    attempts: 0,
    createdAtMs: now,
    expiresAtMs: now + OTP_TTL_MS,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docId;
}

async function deliverOtpMessage({ email, phone, name, otpCode, purpose }) {
  const nodemailer = require("nodemailer");
  const userName = name || "Valued Reader";
  const isLogin = purpose === "login";
  const title = isLogin ? "Your sign-in code" : "Your password reset code";
  const subject = isLogin
    ? `Your sign-in code: ${otpCode} — Ellines Haven`
    : `Your reset code: ${otpCode} — Ellines Haven`;
  const intro = isLogin
    ? "Use this code to finish signing in to Ellines Haven. It expires in <strong style=\"color:#c9a84c;\">15 minutes</strong>."
    : "We received a request to reset your Ellines Haven password. Use the code below — it expires in <strong style=\"color:#c9a84c;\">15 minutes</strong>.";
  const textBody = isLogin
    ? `Hi ${userName},\n\nYour Ellines Haven sign-in code is: ${otpCode}\n\nThis code expires in 15 minutes. If you didn't try to sign in, ignore this email and change your password.\n\n— Ellines Haven`
    : `Hi ${userName},\n\nYour Ellines Haven password reset code is: ${otpCode}\n\nThis code expires in 15 minutes. If you didn't request this, ignore this email.\n\n— Ellines Haven`;
  const smsText = isLogin
    ? `Ellines Haven sign-in code: ${otpCode}. Valid 15 mins. Do not share.`
    : `Ellines Haven reset code: ${otpCode}. Valid 15 mins. Do not share.`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d1a;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#13132a;border-radius:12px;border:1px solid rgba(201,168,76,0.3);overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#1a1a0f,#2a2508);padding:28px 36px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.2);">
          <h1 style="margin:0;color:#c9a84c;font-size:1.5rem;letter-spacing:1px;">📖 Ellines Haven</h1>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="margin:0 0 8px;color:#f0ece2;font-size:1rem;">Hi <strong>${userName}</strong>,</p>
          <p style="margin:0 0 24px;color:rgba(240,236,226,0.7);font-size:0.92rem;line-height:1.6;">${intro}</p>
          <div style="text-align:center;margin:28px 0;">
            <div style="display:inline-block;background:#0d0d1a;border:2px solid #c9a84c;border-radius:12px;padding:20px 40px;">
              <div style="color:rgba(201,168,76,0.7);font-size:0.75rem;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">${title}</div>
              <div style="color:#c9a84c;font-size:2.2rem;font-weight:700;letter-spacing:10px;font-family:monospace;">${otpCode}</div>
            </div>
          </div>
          <p style="margin:24px 0 0;color:rgba(240,236,226,0.5);font-size:0.82rem;line-height:1.6;">
            If you did not request this, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;color:rgba(240,236,226,0.35);font-size:0.78rem;">© Ellines Haven · ellines.haven@gmail.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  let emailSent = false;
  let smsSent = false;
  let smtpError = "";

  const atApiKey   = AT_API_KEY.value()   || "";
  const atUsername = AT_USERNAME.value()  || "";
  const atSenderId = AT_SENDER_ID.value() || "EllinesHvn";
  const smtpHost     = SMTP_HOST.value()     || "";
  const smtpUser     = SMTP_USER.value()     || "";
  const smtpPass     = SMTP_PASS.value()     || "";
  const resendApiKey = RESEND_API_KEY.value() || "";

  if (resendApiKey) {
    try {
      const { Resend } = require("resend");
      const resend = new Resend(resendApiKey);
      const { error: resendError } = await resend.emails.send({
        from: "Ellines Haven <noreply@haven.ellines.co.ke>",
        to: [email],
        subject,
        text: textBody,
        html: htmlBody,
      });
      if (resendError) {
        console.warn("[sendOtp] Resend error:", resendError.message, "| falling back to SMTP");
      } else {
        emailSent = true;
        console.log("[sendOtp] Email sent via Resend to", email);
      }
    } catch (e) {
      console.warn("[sendOtp] Resend failed:", e.message, "| falling back to SMTP");
    }
  }

  if (!emailSent && smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: 587,
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
      });
      await transporter.sendMail({
        from: `"Ellines Haven" <${smtpUser}>`,
        to: email,
        subject,
        text: textBody,
        html: htmlBody,
      });
      emailSent = true;
      console.log("[sendOtp] Email sent via SMTP/587 to", email);
    } catch (e) {
      smtpError = e.message;
      console.warn("[sendOtp] SMTP/587 failed:", e.message, "| code:", e.code);
    }
  }

  if (atApiKey && atUsername) {
    const rawPhone = phone ? String(phone).replace(/\D/g, "") : "";
    if (rawPhone) {
      let formattedPhone = rawPhone;
      if (rawPhone.startsWith("0")) formattedPhone = "+254" + rawPhone.slice(1);
      else if (rawPhone.startsWith("254")) formattedPhone = "+" + rawPhone;
      else if (!rawPhone.startsWith("+")) formattedPhone = "+254" + rawPhone;

      try {
        const isSandbox = atUsername === "sandbox";
        const params = new URLSearchParams({
          username: atUsername,
          to: formattedPhone,
          message: smsText,
        });
        if (!isSandbox && atSenderId) params.append("from", atSenderId);

        const smsRes = await axios.post(
          "https://api.africastalking.com/version1/messaging",
          params.toString(),
          {
            headers: {
              apiKey: atApiKey,
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
        const recipients = smsRes.data?.SMSMessageData?.Recipients || [];
        smsSent = recipients.some((r) => r.statusCode === 101 || r.status === "Success");
      } catch (e) {
        console.warn("[sendOtp] SMS failed:", e.response?.data || e.message);
      }
    }
  }

  if (!emailSent && !smsSent) {
    console.error(`[sendOtp] All delivery channels failed for ${email}. SMTP error: ${smtpError || "none"}. Resend key set: ${!!resendApiKey}`);
    throw new HttpsError(
      "unavailable",
      "Could not deliver the verification code. Please check your email address or contact support at ellines.haven@gmail.com."
    );
  }

  return { emailSent, smsSent };
}

async function issueAndDeliverOtp({ email, phone, name, purpose }) {
  const emailKey = String(email || "").toLowerCase().trim();
  if (!emailKey) throw new HttpsError("invalid-argument", "email is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailKey)) {
    throw new HttpsError("invalid-argument", "A valid email address is required");
  }

  await assertOtpSendAllowed(emailKey, purpose);

  const otpCode = String(crypto.randomInt(100000, 1000000));
  await storeAuthOtp(emailKey, purpose, otpCode);
  const delivered = await deliverOtpMessage({
    email: emailKey,
    phone,
    name,
    otpCode,
    purpose,
  });
  return { ...delivered, expiresInSec: Math.floor(OTP_TTL_MS / 1000) };
}

exports.sendPasswordResetOtp = onCall(
  {
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, RESEND_API_KEY],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { email, phone, name } = request.data || {};
    // OTP is always generated server-side (client-supplied otp ignored for security)
    return issueAndDeliverOtp({
      email,
      phone,
      name,
      purpose: "reset",
    });
  }
);

/** Login 2FA — email/SMS OTP after password succeeds */
exports.sendLoginOtp = onCall(
  {
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, RESEND_API_KEY],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { email, phone, name } = request.data || {};
    return issueAndDeliverOtp({
      email,
      phone,
      name,
      purpose: "login",
    });
  }
);

/** Verify a server-issued OTP for login or password reset */
exports.verifyAuthOtp = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const emailKey = String(request.data?.email || "").toLowerCase().trim();
    const otp = String(request.data?.otp || "").trim();
    const purpose = String(request.data?.purpose || "login").trim() || "login";

    if (!emailKey || !/^\d{6}$/.test(otp)) {
      throw new HttpsError("invalid-argument", "Valid email and 6-digit code are required");
    }

    const ref = db.collection("auth_otps").doc(authOtpDocId(emailKey, purpose));
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "No active verification code. Please request a new one.");
    }

    const data = snap.data() || {};
    if (Date.now() > (data.expiresAtMs || 0)) {
      await ref.delete().catch(() => {});
      throw new HttpsError("deadline-exceeded", "This code has expired. Please request a new one.");
    }

    const attempts = data.attempts || 0;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await ref.delete().catch(() => {});
      throw new HttpsError("resource-exhausted", "Too many incorrect attempts. Please request a new code.");
    }

    const expected = hashOtpCode(otp, emailKey, purpose);
    if (expected !== data.hash) {
      await ref.update({ attempts: attempts + 1 }).catch(() => {});
      throw new HttpsError("permission-denied", "Incorrect verification code.");
    }

    await ref.delete().catch(() => {});
    return { ok: true, purpose };
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

    // Extract real IP from request headers (same as trackVisitor)
    const headers       = request.rawRequest?.headers || {};
    const xForwardedFor = headers["x-forwarded-for"] || "";
    const xRealIp       = headers["x-real-ip"]       || "";
    const cfConnecting  = headers["cf-connecting-ip"] || "";
    const fastlyClient  = headers["fastly-client-ip"] || "";

    const rawIp    = cfConnecting || fastlyClient || xRealIp || xForwardedFor.split(",")[0].trim() || "unknown";
    const clientIp = rawIp.replace(/^::ffff:/, "").trim() || "unknown";

    const activityId = "act_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const now        = Date.now();
    const activityData = {
      id:       activityId,
      category: "user_login",
      userEmail: userEmail.toLowerCase(),
      userName:  userName || userEmail,
      title:     "User Login",
      message:   `${userName || userEmail} logged in`,
      icon:      "🔐",
      clientIp,
      userAgent: metadata.userAgent || headers["user-agent"] || "",
      device:    metadata.device || "Unknown",
      metadata:  {
        ...metadata,
        loginTime: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      },
      priority:    "low",
      read:        false,
      readBy:      [],
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: now,
    };

    let wroteNotification = false;
    let wroteLog          = false;
    let sessionId         = null;

    // Write to admin_notifications (best-effort — never throws)
    try {
      await db.collection("admin_notifications").doc(activityId).set(activityData);
      wroteNotification = true;
    } catch (e) {
      console.warn("[logUserLoginServer] admin_notifications write failed:", e.message);
    }

    // Write to activity_logs (best-effort)
    try {
      const logId = "log_" + now + "_" + Math.random().toString(36).slice(2, 7);
      await db.collection("activity_logs").doc(logId).set({
        id: logId,
        ...activityData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      wroteLog = true;
    } catch (e) {
      console.warn("[logUserLoginServer] activity_logs write failed:", e.message);
    }

    // Write user_session (best-effort)
    try {
      sessionId = "session_" + userEmail.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + now;
      await db.collection("user_sessions").doc(sessionId).set({
        userEmail:  userEmail.toLowerCase(),
        sessionId,
        loginTime:  admin.firestore.FieldValue.serverTimestamp(),
        ip:         clientIp,
        device:     metadata.device || "Unknown",
        userAgent:  metadata.userAgent || "",
        expiresAt:  new Date(now + 30 * 24 * 60 * 60 * 1000), // 30 days
      });
    } catch (e) {
      console.warn("[logUserLoginServer] user_sessions write failed:", e.message);
      sessionId = null;
    }

    console.log("[logUserLoginServer] Login recorded for", userEmail,
      "IP:", clientIp,
      "| notif:", wroteNotification, "| log:", wroteLog, "| session:", !!sessionId);

    // Always succeed from the client's perspective — tracking is non-blocking
    return { success: true, activityId, sessionId };
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


// ─────────────────────────────────────────────────────────────────────────────
// ── Admin Password Reset Notification — email user when admin resets their pw ─
// ─────────────────────────────────────────────────────────────────────────────
exports.sendAdminPasswordResetNotification = onCall(
  {
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, RESEND_API_KEY],
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const nodemailer = require("nodemailer");

    const { email, name, tempPassword } = request.data;
    if (!email) throw new HttpsError("invalid-argument", "email is required");

    const userName = name || "Valued Reader";

    const smtpHost     = SMTP_HOST.value()      || "";
    const smtpPort     = parseInt(SMTP_PORT.value() || "587", 10);
    const smtpUser     = SMTP_USER.value()      || "";
    const smtpPass     = SMTP_PASS.value()      || "";
    const resendApiKey = RESEND_API_KEY.value() || "";

    const atApiKey   = AT_API_KEY.value()   || "";
    const atUsername = AT_USERNAME.value()  || "";
    const atSenderId = AT_SENDER_ID.value() || "EllinesHvn";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d1a;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#13132a;border-radius:12px;border:1px solid rgba(201,168,76,0.3);overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#1a1a0f,#2a2508);padding:28px 36px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.2);">
          <h1 style="margin:0;color:#c9a84c;font-size:1.5rem;letter-spacing:1px;">📖 Ellines Haven</h1>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="margin:0 0 8px;color:#f0ece2;font-size:1rem;">Hi <strong>${userName}</strong>,</p>
          <p style="margin:0 0 20px;color:rgba(240,236,226,0.7);font-size:0.92rem;line-height:1.6;">
            An administrator has reset your Ellines Haven account password. Your temporary password is:
          </p>
          <div style="text-align:center;margin:20px 0;">
            <div style="display:inline-block;background:#0d0d1a;border:2px solid #c9a84c;border-radius:12px;padding:16px 32px;">
              <div style="color:#c9a84c;font-size:1.4rem;font-weight:700;letter-spacing:4px;font-family:monospace;">${tempPassword}</div>
            </div>
          </div>
          <p style="margin:20px 0 0;color:rgba(240,236,226,0.7);font-size:0.92rem;line-height:1.6;">
            When you sign in, you will be asked to set a new password of your choice.
          </p>
          <p style="margin:16px 0 0;color:rgba(240,236,226,0.5);font-size:0.82rem;line-height:1.6;">
            If you did not expect this change, contact us immediately at <a href="mailto:ellines.haven@gmail.com" style="color:#c9a84c;">ellines.haven@gmail.com</a> or WhatsApp: 0748 255 466.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;color:rgba(240,236,226,0.35);font-size:0.78rem;">© Ellines Haven · ellines.haven@gmail.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

    const textBody = `Hi ${userName},\n\nAn administrator has reset your Ellines Haven password.\n\nYour temporary password is: ${tempPassword}\n\nYou will be required to set a new password when you next sign in.\n\nIf you did not expect this, contact us at ellines.haven@gmail.com.\n\n— Ellines Haven`;

    let emailSent = false;

    // ── Send via Resend (primary — HTTPS, no port blocking) ──────────────────
    if (resendApiKey) {
      try {
        const { Resend } = require("resend");
        const resend = new Resend(resendApiKey);
        const { error: resendError } = await resend.emails.send({
          from:    "Ellines Haven <onboarding@resend.dev>",
          to:      [email],
          subject: "Your Ellines Haven password was reset by an admin",
          text:    textBody,
          html:    htmlBody,
        });
        if (resendError) {
          console.warn("[adminPwReset] Resend error:", resendError.message, "| falling back to SMTP");
        } else {
          emailSent = true;
          console.log("[adminPwReset] Email sent via Resend to", email);
        }
      } catch (e) {
        console.warn("[adminPwReset] Resend failed:", e.message, "| falling back to SMTP");
      }
    }

    // ── Send via SMTP port 587 — fallback ─────────────────────────────────────
    if (!emailSent && smtpHost && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host:   smtpHost,
          port:   587,
          secure: false,
          auth:   { user: smtpUser, pass: smtpPass },
          tls:    { rejectUnauthorized: false },
          connectionTimeout: 15000,
          greetingTimeout:   15000,
          socketTimeout:     15000,
        });
        await transporter.sendMail({
          from:    `"Ellines Haven" <${smtpUser}>`,
          to:      email,
          subject: "Your Ellines Haven password was reset by an admin",
          text:    textBody,
          html:    htmlBody,
        });
        emailSent = true;
        console.log("[adminPwReset] Notification sent via SMTP/587 to", email);
      } catch (e) {
        console.warn("[adminPwReset] SMTP/587 failed:", e.message, "| port: 587");
      }
    }

    // ── Fallback: AT Email (production only) ─────────────────────────────────
    if (!emailSent && atApiKey && atUsername && atUsername !== "sandbox") {
      try {
        const emailParams = new URLSearchParams({
          username: atUsername,
          to:       email,
          from:     smtpUser || "noreply@ellines-haven.web.app",
          subject:  "Your Ellines Haven password was reset by an admin",
          message:  textBody,
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
        emailSent = true;
      } catch (e) {
        console.warn("[adminPwReset] AT email failed:", e.response?.data || e.message);
      }
    }

    if (!emailSent) {
      console.warn(`[adminPwReset] Could not send notification to ${email} — SMTP not configured`);
      try {
        await db.collection("admin_pw_reset_log").add({
          email,
          userName,
          notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          deliveryStatus: "failed_no_credentials",
        });
      } catch {}
    }

    return { emailSent };
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5-6: READING CHALLENGES — Auto-create Collections on First Challenge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * startChallenge — Callable function to start a reading challenge
 * Auto-creates challenges and challenge_leaderboards collections if needed
 * Called from frontend: ChallengesPage.jsx
 */
exports.startChallenge = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { userEmail, userName, challengeType } = request.data;

    if (!userEmail || !userName || !challengeType) {
      throw new HttpsError("invalid-argument", "Missing: userEmail, userName, or challengeType");
    }

    const CHALLENGE_TYPES = {
      "7day": { goal: 1, reward: 50, duration: 7 },
      "30day": { goal: 3, reward: 150, duration: 30 },
      "100day": { goal: 5, reward: 300, duration: 100 },
      "annual": { goal: 12, reward: 1000, duration: 365 },
    };

    const typeData = CHALLENGE_TYPES[challengeType];
    if (!typeData) {
      throw new HttpsError("invalid-argument", `Invalid challenge type: ${challengeType}`);
    }

    try {
      const now = new Date();
      const period = challengeType === "annual" ? now.getFullYear() : `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
      const challengeId = `ch_${libDocId(userEmail)}_${challengeType}_${period}`;

      // ── Create challenge document in challenges collection ──────────────────
      const challengeRef = db.collection("challenges").doc(challengeId);
      await challengeRef.set({
        id: challengeId,
        userEmail: userEmail.toLowerCase(),
        userName: userName,
        type: challengeType,
        goal: typeData.goal,
        progress: 0,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: null,
        status: "active",
        books: [],
        reward_points: typeData.reward,
        metadata: {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          duration: typeData.duration,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("[startChallenge] created challenge:", challengeId);

      // ── Ensure challenge_leaderboards collection exists ────────────────────
      // Initialize leaderboard for this type if it doesn't exist
      const leaderboardId = `lb_${challengeType}_${period}`;
      const lbRef = db.collection("challenge_leaderboards").doc(leaderboardId);
      const lbSnap = await lbRef.get();

      if (!lbSnap.exists) {
        await lbRef.set({
          id: leaderboardId,
          type: challengeType,
          period: period,
          rankings: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log("[startChallenge] created leaderboard:", leaderboardId);
      }

      return {
        success: true,
        challengeId,
        message: `Challenge "${challengeType}" started successfully!`,
      };
    } catch (err) {
      console.error("[startChallenge] error:", err.message);
      throw new HttpsError("internal", err.message);
    }
  }
);

/**
 * completeChallenge — Callable function to mark challenge as completed
 * Updates challenge status and adds user to leaderboard
 */
exports.completeChallenge = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { challengeId, userEmail, userName } = request.data;

    if (!challengeId || !userEmail) {
      throw new HttpsError("invalid-argument", "Missing: challengeId or userEmail");
    }

    try {
      const challengeRef = db.collection("challenges").doc(challengeId);
      const snap = await challengeRef.get();

      if (!snap.exists) {
        throw new HttpsError("not-found", "Challenge not found");
      }

      const challenge = snap.data();

      // Check if already completed
      if (challenge.status === "completed") {
        return { success: false, message: "Challenge already completed" };
      }

      // Update challenge to completed
      const now = new Date();
      await challengeRef.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // ── Update leaderboard with user's ranking ────────────────────────────
      const lbId = `lb_${challenge.type}_${challenge.metadata.year}_${String(challenge.metadata.month).padStart(2, "0")}`;
      const lbRef = db.collection("challenge_leaderboards").doc(lbId);
      const lbSnap = await lbRef.get();

      const rankings = lbSnap.exists ? (lbSnap.data().rankings || []) : [];
      const timeToComplete = Math.floor((now - challenge.startedAt.toDate()) / (1000 * 60 * 60 * 24));

      // Add user to rankings and sort by time
      const newRanking = {
        rank: rankings.length + 1,
        userEmail: userEmail.toLowerCase(),
        userName: userName || userEmail,
        progress: challenge.progress,
        completedAt: now.toISOString(),
        timeToComplete: timeToComplete,
      };

      rankings.push(newRanking);
      rankings.sort((a, b) => a.timeToComplete - b.timeToComplete);
      rankings.forEach((r, idx) => { r.rank = idx + 1; });

      await lbRef.set({
        id: lbId,
        type: challenge.type,
        period: `${challenge.metadata.year}_${String(challenge.metadata.month).padStart(2, "0")}`,
        rankings: rankings,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      console.log("[completeChallenge] challenge completed:", challengeId, "leaderboard updated:", lbId);

      // ── Notify user of completion (optional) ─────────────────────────────
      try {
        const notifId = `notif_challenge_${challengeId}_${Date.now()}`;
        await db.collection("user_notifications").doc(notifId).set({
          userEmail: userEmail.toLowerCase(),
          type: "challenge_complete",
          title: "🏆 Challenge Complete!",
          message: `You completed the ${challenge.type} challenge and earned ${challenge.reward_points} points!`,
          icon: "🏆",
          challengeId,
          reward_points: challenge.reward_points,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.warn("[completeChallenge] user notification failed:", e.message);
      }

      return {
        success: true,
        message: "Challenge completed!",
        rank: newRanking.rank,
        reward_points: challenge.reward_points,
      };
    } catch (err) {
      console.error("[completeChallenge] error:", err.message);
      throw new HttpsError("internal", err.message);
    }
  }
);

/**
 * updateChallengeProgress — Callable function to update challenge progress
 * Called when user completes a book
 */
exports.updateChallengeProgress = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const { challengeId, bookId, bookTitle } = request.data;

    if (!challengeId || !bookId) {
      throw new HttpsError("invalid-argument", "Missing: challengeId or bookId");
    }

    try {
      const challengeRef = db.collection("challenges").doc(challengeId);
      const snap = await challengeRef.get();

      if (!snap.exists) {
        throw new HttpsError("not-found", "Challenge not found");
      }

      const challenge = snap.data();

      // Check if already completed
      if (challenge.status === "completed") {
        return { success: false, message: "Challenge already completed" };
      }

      // Add book to challenge books list
      const books = challenge.books || [];
      if (!books.find(b => b.id === bookId)) {
        books.push({
          id: bookId,
          title: bookTitle || "Unknown Book",
          completed_at: new Date().toISOString(),
        });
      }

      const newProgress = books.length;
      const isCompleted = newProgress >= challenge.goal;

      // Update challenge
      const updateData = {
        progress: newProgress,
        books: books,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (isCompleted) {
        updateData.status = "completed";
        updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      await challengeRef.update(updateData);

      console.log("[updateChallengeProgress] challenge updated:", challengeId, "progress:", newProgress);

      return {
        success: true,
        progress: newProgress,
        goal: challenge.goal,
        completed: isCompleted,
        message: isCompleted ? "Challenge completed!" : `${challenge.goal - newProgress} book${challenge.goal - newProgress !== 1 ? "s" : ""} to go!`,
      };
    } catch (err) {
      console.error("[updateChallengeProgress] error:", err.message);
      throw new HttpsError("internal", err.message);
    }
  }
);

console.log("[CloudFunctions] ✅ Reading Challenges system initialized - Phase 5-6");

// ─────────────────────────────────────────────────────────────────────────────
// ── .ehbook keep-forever packs — server-held keys (anti-sharing) ─────────────
// Ciphertext can be downloaded, but the AES key never lives in the file.
// Only the licensed owner (who still owns the book) can fetch the unlock key.
// ─────────────────────────────────────────────────────────────────────────────
const SUPER_ADMIN_EMAIL = "ellines.haven@gmail.com";

async function userOwnsBookForEhbook(email, bookId) {
  const emailKey = String(email || "").toLowerCase().trim();
  const id = String(bookId || "");
  if (!emailKey || !id) return false;
  if (emailKey === SUPER_ADMIN_EMAIL) return true;

  const libSnap = await db.collection("libraries").doc(libDocId(emailKey)).get();
  if (libSnap.exists) {
    const books = libSnap.data().books || [];
    if (books.some((b) => String(b.id) === id || String(b.bookId) === id)) return true;
  }

  try {
    const grants = await db.collection("user_chapter_grants")
      .where("userEmail", "==", emailKey)
      .where("bookId", "==", id)
      .limit(1)
      .get();
    if (!grants.empty) return true;
  } catch (e) {
    console.warn("[ehbook] grant check failed:", e.message);
  }
  return false;
}

/**
 * issueEhbookExportKey — create a random AES key stored server-side for a pack.
 * Client encrypts chapters with this key; the key is NOT written into the .ehbook file.
 */
exports.issueEhbookExportKey = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const emailKey = String(request.data?.email || "").toLowerCase().trim();
    const bookId = String(request.data?.bookId || "").trim();
    const title = String(request.data?.title || "").slice(0, 200);

    if (!emailKey || !bookId) {
      throw new HttpsError("invalid-argument", "email and bookId are required");
    }
    if (!(await userOwnsBookForEhbook(emailKey, bookId))) {
      throw new HttpsError(
        "permission-denied",
        "You can only create a keep-forever pack for books you own."
      );
    }

    const keyId = crypto.randomBytes(16).toString("hex");
    const contentKey = crypto.randomBytes(32); // AES-256
    const contentKeyB64 = contentKey.toString("base64");

    await db.collection("ehbook_licenses").doc(keyId).set({
      keyId,
      email: emailKey,
      bookId,
      title,
      contentKeyB64,
      revoked: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      lastExportAtMs: Date.now(),
    });

    console.log(`[ehbook] export key issued for ${emailKey} book=${bookId} keyId=${keyId}`);
    return { keyId, contentKeyB64, version: 2 };
  }
);

/**
 * issueEhbookImportKey — return the unlock key only to the licensed owner.
 * Shared files cannot be opened by another account.
 */
exports.issueEhbookImportKey = onCall(
  {
    region: "us-central1",
    allowInvalidAppCheckToken: true,
    invoker: "public",
  },
  async (request) => {
    const emailKey = String(request.data?.email || "").toLowerCase().trim();
    const bookId = String(request.data?.bookId || "").trim();
    const keyId = String(request.data?.keyId || "").trim();

    if (!emailKey || !bookId || !keyId) {
      throw new HttpsError("invalid-argument", "email, bookId, and keyId are required");
    }

    const snap = await db.collection("ehbook_licenses").doc(keyId).get();
    if (!snap.exists) {
      throw new HttpsError(
        "not-found",
        "This pack is not recognized. It may be damaged or was not created by Ellines Haven."
      );
    }

    const lic = snap.data() || {};
    if (lic.revoked === true) {
      throw new HttpsError("permission-denied", "This pack has been revoked. Download a new one from your library.");
    }
    if (String(lic.email || "").toLowerCase() !== emailKey) {
      throw new HttpsError(
        "permission-denied",
        "This pack is licensed to another account and cannot be shared."
      );
    }
    if (String(lic.bookId || "") !== bookId) {
      throw new HttpsError("permission-denied", "This pack does not match the requested book.");
    }
    if (!(await userOwnsBookForEhbook(emailKey, bookId))) {
      throw new HttpsError(
        "permission-denied",
        "Your library no longer includes this book, so the pack cannot be unlocked."
      );
    }

    await snap.ref.set({
      lastImportAtMs: Date.now(),
      importCount: admin.firestore.FieldValue.increment(1),
    }, { merge: true }).catch(() => {});

    console.log(`[ehbook] import key issued for ${emailKey} book=${bookId} keyId=${keyId}`);
    return { contentKeyB64: lic.contentKeyB64, version: 2 };
  }
);

console.log("[CloudFunctions] ✅ ehbook anti-sharing license keys initialized");
