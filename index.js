const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const app = express();
const cookieParser = require("cookie-parser");
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const { getBooks, updateStock } = require("./controllers/bookControllers");

const SECRET_KEY = process.env.SECRET_KEY;

const URI = process.env.DB_URI || "mongodb://localhost:27017/";
const client = new MongoClient(URI);

client.connect().catch(console.error);

// async function updateStock(searchQuery) {
//   const db = client.db("bookworm");
//   const collection = db.collection("books");
//   const books = await collection.updateOne(searchQuery, {
//     $inc: { stock: -1 },
//   });
//   return books;
// }

app.get("/", async (req, res) => {
  const data = await getBooks({});
  res.send(data);
});

app.get("/search", async (req, res) => {
  const query = req.query.query;
  const nameSearchQuery = { name: { $regex: query, $options: "i" } };
  const authorSearchQuery = { author: { $regex: query, $options: "i" } };

  const nameMatches = await getBooks(nameSearchQuery);
  const authorMatches = await getBooks(authorSearchQuery);

  res.send({ nameMatches, authorMatches });
});

app.get("/books/:id", async (req, res) => {
  const id = req.params.id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send("Invalid id format");
  }

  const data = await getBooks({
    _id: new ObjectId(id),
  });

  res.send(data);
});

app.put("/order", async (req, res) => {
  const items = req.body.items;

  if (
    !items ||
    !Array.isArray(items) ||
    items.some((id) => !ObjectId.isValid(id))
  ) {
    return res.status(400).send("Invalid item ids");
  }

  const token = req.cookies.token;

  let email;
  if (token) {
    try {
      const payload = jwt.verify(token, SECRET_KEY);
      email = payload.email;
    } catch (e) {
      return res.status(401).send("Invalid token");
    }

    const db = client.db("bookworm");
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).send("User not found");
    }

    const results = await Promise.all(
      items.map((id) => updateStock({ _id: ObjectId(id) }))
    );
    return res.send(results);
  }

  return res.status(401).send("Unauthorized");
});

app.post("/register", async (req, res) => {
  try {
    const db = client.db("bookworm");
    const collection = db.collection("users");
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const cartItems = req.body.cart;

    if (!name || !email || !password) {
      return res.status(400).send("All fields are required.");
    }

    const existingUser = await collection.findOne({ email });
    if (existingUser) {
      return res.status(400).send("User with this email already exists.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userObject = {
      name: name,
      email: email,
      password: hashedPassword,
      cart: cartItems,
    };
    const user = await collection.insertOne(userObject);

    const token = jwt.sign({ email: email }, SECRET_KEY);
    res.cookie("token", token, { httpOnly: true });
    res.send("registered successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred");
  }
});

app.post("/login", async (req, res) => {
  const db = client.db("bookworm");
  const collection = db.collection("users");
  const email = req.body.email;
  const password = req.body.password;

  const existingUser = await collection.findOne({ email: email });
  if (existingUser) {
    const match = await bcrypt.compare(password, existingUser.password);
    if (match) {
      const token = jwt.sign({ email: email }, SECRET_KEY);
      res.cookie("token", token, { httpOnly: true });
      res.send({ name: existingUser.name, email: existingUser.email });
    } else {
      res.status(400).send("Invalid Credentials");
    }
  } else {
    res.status(400).send("Invalid Credentials");
  }
});

app.get("/cart", async (req, res) => {
  const db = client.db("bookworm");
  const cartCollection = db.collection("cart");
  const userCollection = db.collection("users");
  const token = req.cookies.token;
  const { email } = jwt.verify(token, SECRET_KEY);
  if (!token) {
    return res.status(401).send("Authentication required");
  }
  const existingUser = await userCollection.findOne({ email: email });
  if (existingUser) {
    const cart = await cartCollection.findOne({ email: email });
    if (cart) {
      res.send(cart);
    } else {
      res.send({ message: "Cart is empty" });
    }
  } else {
    res.status(400).send("please register");
  }
});

app.post("/cart", async (req, res) => {
  try {
    const db = client.db("bookworm");
    const cartCollection = db.collection("cart");
    const userCollection = db.collection("users");
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).send("Authentication required");
    }
    const sentCart = req.body.cart;
    // console.log(sentCart);
    const { email } = jwt.verify(token, SECRET_KEY);
    const existingUser = await userCollection.findOne({ email: email });
    if (existingUser) {
      const cart = await cartCollection.updateOne(
        { email: email },
        { $set: { cart: sentCart } },
        { upsert: true }
      );
      // console.log(sentCart);
      res.send(cart);
      // console.log(cart);
    } else {
      res.status(400).send("please register");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred");
  }
});

app.get("/auth", async (req, res) => {
  try {
    const token = req.cookies.token;
    const payload = jwt.verify(token, SECRET_KEY);
    const db = client.db("bookworm");
    const userCollection = db.collection("users");
    const userData = await userCollection.findOne({ email: payload.email });
    if (payload && userData) {
      const dataToSend = { name: userData.name, email: userData.email };
      console.log(dataToSend);
      res.send(dataToSend);
    } else {
      res.send({});
    }
  } catch (error) {
    res.status(400).send("there was an error, error");
  }
});

app.post("/logout", (req, res) => {
  try {
    res.clearCookie("token");
    console.log("successful logout");
    res.send("logout successfully");
  } catch (error) {
    console.log("error", error);
  }
});

app.listen(8000, () => {
  console.log("running on http://localhost:8000/");
});
