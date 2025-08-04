import mongoose from "mongoose";

const connectDB = async () => {
  try {
    mongoose.connection.on("connected", () =>
      console.log("Database connected")
    );

    await mongoose.connect(`${process.env.MONGODB_URI}/getyourpopcorn`);
  } catch (error) {
    console.log("hello, " + error.message);
  }
};

export default connectDB;
