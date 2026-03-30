import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    status: {
      type: String,
      enum: ["interested", "ignored", "accepted", "rejected"],
      default: "interested"
    }
  },
  { timestamps: true }
);

const Connection = mongoose.model("Connection", connectionSchema);

// This is the line you are likely missing:
export default Connection;