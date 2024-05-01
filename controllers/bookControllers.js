const { MongoClient, ObjectId } = require("mongodb");
const URI = process.env.DB_URI || "mongodb://localhost:27017/";
const client = new MongoClient(URI);

client.connect().catch(console.error);

async function getBooks(searchQuery) {
  const db = client.db("bookworm");
  const collection = db.collection("books");
  const books = await collection.find(searchQuery).toArray();
  return books;
}

async function updateStock(searchQuery) {
  const db = client.db("bookworm");
  const collection = db.collection("books");
  const books = await collection.updateOne(searchQuery, {
    $inc: { stock: -1 },
  });
  return books;
}

module.exports = { getBooks, updateStock };
