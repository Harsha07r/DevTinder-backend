import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config(); 

import http from "http";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import connectDB from "./config/database.js";
import User from "./models/User.js";
import validRegistration from "./utils/validation.js";
import authMiddleware from "./middleware/authMiddleware.js";
import Connection from "./models/Connection.js";
import initializeSocket from "./utils/socket.js";
import { Chat } from "./models/Chat.js";

const app = express();

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
})); 

// ===== REGISTER =====
app.post("/register", async (req, res) => {
  try {
    validRegistration(req);

    const { firstName, lastName, emailId, password } = req.body;
    const hashedpassword = await bcrypt.hash(password, 10);

    const user = new User({ firstName, lastName, emailId, password: hashedpassword });
    await user.save();

    res.status(201).json({ message: "User Registered Successfully" });
  } catch (err) {
    if (err.code === 11000) {
      console.log("Duplicate email blocked:", err.keyValue.emailId);
      return res.status(400).json({ error: "Email already exists. Please login." });
    }
    console.log("Error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  try {
    const { emailId, password } = req.body;

    const user = await User.findOne({ emailId });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { _id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 60 * 60 * 1000
    });

    user.password = undefined;

    res.status(200).json({
      message: "Login successful",
      data: user
    });
  } catch (err) {
    console.log("Login Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//===== LOGOUT =====
app.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: false
  });
  res.status(200).json({ message: "Logged out successfully" });
});

// ===== PROFILE (AUTO LOGIN) =====
app.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (err) {
    console.log("Profile Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== FEED / POSTS =====
app.get("/posts", authMiddleware, async (req, res) => {
  try {
    const me = req.userId;

    // 1. Find all relations of mine
    const relations = await Connection.find({
      $or: [
        { fromUserId: me },
        { toUserId: me }
      ]
    });

    // 2. Collect all involved user ids
    const excludeIds = relations.map(r =>
      r.fromUserId.toString() === me
        ? r.toUserId
        : r.fromUserId
    );

    excludeIds.push(me); // also exclude myself

    // 3. Get feed
    const users = await User.find({
      _id: { $nin: excludeIds }
    }).select("firstName lastName photoUrl");

    res.status(200).json(users);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== UPDATE PROFILE =====
app.put("/profile", authMiddleware, async (req, res) => {
  try {
    const allowedUpdates = ["firstName", "lastName", "photoUrl", "bio"];
    const updates = {};
    for (const key of allowedUpdates) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const result = await User.updateOne(
      { _id: req.userId },
      { $set: updates },
      { runValidators: true, context: 'query' }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = await User.findById(req.userId).select("-password");
    res.status(200).json({
      message: "Profile updated successfully",
      data: user
    });
  } catch (err) {
    console.log("Profile Update Error:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ===== CONNECTIONS (ACCEPTED ONLY) =====
app.get("/connections", authMiddleware, async (req, res) => {
  try {
    const me = req.userId;

    const connections = await Connection.find({
      status: "accepted",
      $or: [
        { fromUserId: me },
        { toUserId: me }
      ]
    })
    .populate("fromUserId", "firstName lastName photoUrl age gender about")
    .populate("toUserId", "firstName lastName photoUrl age gender about");

    res.status(200).json({ data: connections });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== REQUEST SEND =====
app.post("/request/send", authMiddleware, async (req, res) => {
  try {
    const fromUserId = req.userId;
    const { toUserId } = req.body;

    if (fromUserId === toUserId) {
      return res.status(400).json({ message: "Cannot send request to yourself" });
    }

    // Check both directions ❗
    const existing = await Connection.findOne({
      $or: [
        { fromUserId, toUserId },
        { fromUserId: toUserId, toUserId: fromUserId }
      ]
    });

    if (existing) {
      return res.status(400).json({
        message: "Connection or request already exists"
      });
    }

    const request = await Connection.create({
      fromUserId,
      toUserId,
      status: "interested"
    });

    res.status(200).json({
      message: "Request sent",
      data: request
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== REQUEST REVIEW =====
app.post("/request/review", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { requestId, status } = req.body;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // 🔒 Only RECEIVER can review
    const connection = await Connection.findOne({
      _id: requestId,
      toUserId: userId,
      status: "interested"
    });

    if (!connection) {
      return res.status(403).json({
        message: "Not authorized to review this request"
      });
    }

    connection.status = status;
    await connection.save();

    res.status(200).json({
      message: "Request updated",
      data: connection
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===== GET PENDING REQUESTS =====
app.get("/requests", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const requests = await Connection.find({
      toUserId: userId,
      status: "interested"
    })
    .populate("fromUserId", "firstName lastName photoUrl about");

    res.status(200).json({
      data: requests
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/connection/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const connection = await Connection.findOne({
      _id: id,
      $or: [
        { fromUserId: userId },
        { toUserId: userId }
      ],
      status: "accepted"
    });

    if (!connection) {
      return res.status(403).json({
        message: "Not authorized"
      });
    }

    await Connection.deleteOne({ _id: id });

    res.status(200).json({
      message: "Connection removed"
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Replace your existing GET /chat/:targetUserId with this:
app.get("/chat/:targetUserId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { targetUserId } = req.params;

    const targetUser = await User.findById(targetUserId).select(
      "firstName lastName photoUrl"
    );
    if (!targetUser)
      return res.status(404).json({ message: "User not found" });

    const chat = await Chat.findOne({
      participants: {
        $all: [
          new mongoose.Types.ObjectId(userId),
          new mongoose.Types.ObjectId(targetUserId),
        ],
      },
    }).populate("messages.senderId", "firstName lastName"); // ← key fix

    const messages = (chat?.messages || []).map((m) => ({
      senderId: m.senderId._id.toString(),
      firstName: m.senderId.firstName,
      lastName: m.senderId.lastName,
      text: m.text,
      createdAt: m.createdAt,
    }));

    res.status(200).json({ messages, targetUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server=http.createServer(app);
initializeSocket(server);

// ===== START SERVER =====
const startServer = async () => {
  try {
    await connectDB();
    console.log("Database connected successfully");
    server.listen(3000, () => {
      console.log("Server is running on port 3000");
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
  }
};

startServer();