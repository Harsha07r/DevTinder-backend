import mongoose from "mongoose";

const connectDB = async () => {
  await mongoose.connect(
    "mongodb+srv://harsha_db_user:Ladakh7@cluster1.7qyqgww.mongodb.net/DevTinder"
  );
};

export default connectDB;
