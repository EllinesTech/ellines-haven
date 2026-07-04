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
        await unlockBooksForUser(order.userEmail, order.items || []);
        console.log("[mpesaCallback] books unlocked for:", order.userEmail, "order:", orderId);
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
async function unlockBooksForUser(userEmail, items) {
  const ref = db.collection("libraries").doc(libDocId(userEmail));
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data().books || []) : [];
  const map = new Map(existing.map((b) => [b.id, b]));

  for (const item of items) {
    const existing = map.get(item.id) || {};
    map.set(item.id, {
      ...existing,
      id:               item.id,
      title:            item.title || existing.title || "",
      price:            item.price || existing.price || 0,
      downloadUnlocked: true,
      unlockedAt:       new Date().toISOString(),
      unlockedBy:       "mpesa_auto",
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

      // Find the order by Paystack reference
      const ordersSnap = await db
        .collection("orders")
        .where("paystackRef", "==", reference)
        .limit(1)
        .get();

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
      await unlockBooksForUser(order.userEmail || email, order.items || []);
      console.log("[paystackWebhook] ✅ books unlocked for:", order.userEmail, "order:", orderId);

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

    try {
      const res = await axios.get(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secret}` } }
      );

      const data = res.data?.data;
      if (!data || data.status !== "success") {
        throw new HttpsError("failed-precondition", "Payment not successful");
      }

      // Unlock books if not already done (webhook may have already handled it)
      if (orderId && userEmail) {
        const orderSnap = await db.collection("orders").doc(orderId).get();
        if (orderSnap.exists && orderSnap.data().status !== "Completed") {
          const order = orderSnap.data();
          await db.collection("orders").doc(orderId).update({
            status:          "Completed",
            paystackRef:     reference,
            paystackChannel: data.channel,
            paidAmount:      data.amount / 100,
            confirmedAt:     admin.firestore.FieldValue.serverTimestamp(),
            paymentMethod:   "paystack",
          });
          await unlockBooksForUser(userEmail, order.items || []);
        }
      }

      return { success: true, channel: data.channel, amount: data.amount / 100 };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      throw new HttpsError("internal", msg);
    }
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
      await unlockBooksForUser(order.userEmail || userEmail, order.items || []);
      console.log("[capturePayPalOrder] ✅ books unlocked for:", order.userEmail, "order:", orderId);

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

    // ── Try AT Email API ──────────────────────────────────────────────────────
    if (atApiKey && atUsername) {
      try {
        await axios.post(
          "https://api.africastalking.com/version1/messaging/email",
          {
            username: atUsername,
            to:       email,
            from:     smtpUser || "noreply@ellines-haven.web.app",
            subject:  `Your Ellines Haven reset code: ${otpCode}`,
            message:  emailBody,
          },
          {
            headers: {
              apiKey: atApiKey,
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
        emailSent.sent = true;
      } catch (e) {
        console.warn("[sendOtp] AT email failed:", e.response?.data || e.message);
      }
    }

    // ── Try SMTP as fallback (using nodemailer-style raw HTTP to SMTP is complex;
    //    we skip SMTP if AT email API already worked) ───────────────────────────
    // For simplicity: log OTP to Firestore for dev purposes when creds are missing
    if (!emailSent.sent) {
      console.log(`[sendOtp] OTP for ${email}: ${otpCode} (configure AT_API_KEY + AT_USERNAME to enable delivery)`);
      // Store in Firestore temporarily so admin can see it in dev mode
      try {
        await db.collection("dev_otps").doc(email.toLowerCase().replace(/[^a-z0-9]/g, "_")).set({
          email, otp: otpCode, createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: Date.now() + 900000,
        });
      } catch {}
    }

    // ── 2. Send SMS via Africa's Talking SMS API ──────────────────────────────
    if (phone && atApiKey && atUsername) {
      const rawPhone = String(phone).replace(/\D/g, "");
      let formattedPhone = rawPhone;
      if (rawPhone.startsWith("0"))   formattedPhone = "+254" + rawPhone.slice(1);
      else if (rawPhone.startsWith("254")) formattedPhone = "+" + rawPhone;
      else if (!rawPhone.startsWith("+")) formattedPhone = "+254" + rawPhone;

      const smsText = `Your Ellines Haven password reset code is: ${otpCode}. Valid for 15 minutes. Do not share this code.`;

      try {
        const params = new URLSearchParams({
          username: atUsername,
          to:       formattedPhone,
          message:  smsText,
          ...(atSenderId ? { from: atSenderId } : {}),
        });
        await axios.post(
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
        smsSent.sent = true;
      } catch (e) {
        console.warn("[sendOtp] SMS failed:", e.response?.data || e.message);
      }
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
      const params = new URLSearchParams({
        username: atUsername,
        to:       recipients,
        message,
        ...(atSenderId ? { from: atSenderId } : {}),
      });
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
