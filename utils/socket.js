import { Server } from "socket.io";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import mongoose from "mongoose";
import User from "../models/User.js";
import { Chat } from "../models/Chat.js";

const getSecretRoomId = (userId, targetUserId) => {
  return crypto
    .createHash("sha256")
    .update([userId, targetUserId].sort().join("_"))
    .digest("hex");
};

const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      credentials: true,
    },
  });

  // ─── Auth Middleware ───────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie || "");
      const token = cookies.token;

      if (!token) throw new Error("No token found");

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded._id);
      if (!user) throw new Error("User not found");

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Authentication failed: " + err.message));
    }
  });

  // ─── Events ───────────────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    console.log("User connected:", socket.user._id);

    // ── Join room ────────────────────────────────────────────────────────────
    socket.on("joinChat", ({ userId, targetUserId }) => {
      const roomId = getSecretRoomId(userId, targetUserId);
      socket.join(roomId);
      console.log(`User ${userId} joined room ${roomId}`);
    });

    // ── Send message ─────────────────────────────────────────────────────────
    socket.on("sendMessage", async ({ senderId, receiverId, text, firstName, lastName }) => {
      const roomId = getSecretRoomId(senderId, receiverId);

      try {
        const senderObjId = new mongoose.Types.ObjectId(senderId);
        const receiverObjId = new mongoose.Types.ObjectId(receiverId);

        let chat = await Chat.findOne({
          participants: { $all: [senderObjId, receiverObjId] },
        });

        if (!chat) {
          chat = new Chat({
            participants: [senderObjId, receiverObjId],
            messages: [],
          });
        }

        chat.messages.push({ senderId: senderObjId, text });
        await chat.save();

        console.log("Message saved to DB successfully");

        // ✅ socket.to() excludes the sender — fixes the duplicate message bug
        socket.to(roomId).emit("messageReceived", {
          senderId,
          text,
          firstName,
          lastName,
          createdAt: new Date().toISOString(), // ✅ timestamp for live messages
        });

      } catch (err) {
        console.error("CHAT SAVE ERROR:", err);
      }
    });

    // ── Typing indicators ─────────────────────────────────────────────────────
    socket.on("typing", ({ senderId, receiverId }) => {
      const roomId = getSecretRoomId(senderId, receiverId);
      socket.to(roomId).emit("userTyping", { senderId });
    });

    socket.on("stoppedTyping", ({ senderId, receiverId }) => {
      const roomId = getSecretRoomId(senderId, receiverId);
      socket.to(roomId).emit("userStoppedTyping", { senderId });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.user._id);
    });
  });
};

export default initializeSocket;