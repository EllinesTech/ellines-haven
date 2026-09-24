const admin = require("firebase-admin");

const db = admin.firestore();

const PUBLIC_BOOK_FIELDS = [
  "id",
  "title",
  "subtitle",
  "author",
  "cover",
  "coverType",
  "genre",
  "genres",
  "setting",
  "audienceRating",
  "type",
  "price",
  "pages",
  "wordCount",
  "chapterCount",
  "rating",
  "reviews",
  "ratingQuote",
  "status",
  "freeFirstChapter",
  "themes",
  "excerpt",
  "description",
  "featured",
  "isNew",
  "date",
  "readTime",
];

function toPublicBook(book) {
  const out = {};
  for (const field of PUBLIC_BOOK_FIELDS) {
    if (book[field] !== undefined) out[field] = book[field];
  }
  return out;
}

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Cache-Control", "public, max-age=60");
}

exports.havenCatalogueApi = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET.",
    });
  }

  try {
    const snap = await db.collection("site_data").doc("books_catalogue").get();

    if (!snap.exists) {
      return res.status(404).json({
        success: false,
        error: "Ellines Haven catalogue is not available.",
      });
    }

    const data = snap.data() || {};
    const books = Array.isArray(data.books) ? data.books.map(toPublicBook) : [];

    return res.status(200).json({
      success: true,
      api: "ellines-haven-catalogue",
      version: "1",
      business: "Ellines Haven",
      currency: "KES",
      count: books.length,
      books,
    });
  } catch (error) {
    console.error("[havenCatalogueApi] failed:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to read the Ellines Haven catalogue.",
    });
  }
};
