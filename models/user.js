import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    minlength: 3,
  maxlength: 30
  },
  lastName: {
    type: String,
    required: true,
    minlength: 3,
  maxlength: 30
  },
  emailId: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },

 photoUrl: {
  type: String,
  default: "https://i.pravatar.cc/300/400"
},
age:{
  type: Number,
},
bio:{
  type: String,
},
about:{
  type: String,
}
});

export default mongoose.model("User", userSchema);
