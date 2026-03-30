import validator from "validator";

const validRegistration = (req) => {
  const { firstName, lastName, emailId, password } = req.body;

  if (!firstName || !validator.isLength(firstName, { min: 3, max: 30 })) {
    throw new Error("First Name must be between 3 and 30 characters.");
  }

  if (!lastName || !validator.isLength(lastName, { min: 3, max: 30 })) {
    throw new Error("Last Name must be between 3 and 30 characters.");
  }

  if (!emailId || !validator.isEmail(emailId)) {
    throw new Error("Invalid email format.");
  }

  if (!password || !validator.isLength(password, { min: 8 })) {
    throw new Error("Password must be at least 8 characters.");
  }
};

export default validRegistration;
