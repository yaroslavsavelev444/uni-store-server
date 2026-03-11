require("dotenv").config();

import { hash } from "bcryptjs";
import { UserModel, UserSecurityModel } from "../models/index.models";

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 10;

import { connectDB, disconnect } from "../config/mongo";

async function createAdmin() {
  await connectDB();

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordPlain = process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminEmail || !adminPasswordPlain) {
    console.error(
      "Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD for the one-time setup",
    );
    process.exit(1);
  }

  const hashed = await hash(adminPasswordPlain, SALT_ROUNDS);

  // Создание или обновление админа
  let admin = await UserModel.findOne({ email: adminEmail.toLowerCase() });

  if (admin) {
    admin.role = "admin";
    admin.password = hashed;
    await admin.save();
    console.log("Admin updated:", admin._id.toString());
  } else {
    admin = new UserModel({
      name: "Admin",
      email: adminEmail.toLowerCase(),
      password: hashed,
      role: "admin",
    });
    await admin.save();
    console.log("Admin created:", admin._id.toString());
  }

  // Создание или обновление UserSecurity
  let userSec = await UserSecurityModel.findOne({ userId: admin._id });
  if (!userSec) {
    userSec = new UserSecurityModel({ userId: admin._id });
    await userSec.save();
    console.log("UserSecurity created for admin:", admin._id.toString());
  } else {
    console.log("UserSecurity already exists for admin:", admin._id.toString());
  }

  await disconnect();
  console.log("Done");
}

createAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
