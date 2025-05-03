const jwt = require("jsonwebtoken");
const { TokenModel } = require("../models/indexModels");

const generateToken = (payload) => {
  if (!process.env.ACCESS_TOKEN || !process.env.REFRESH_TOKEN) {
    throw new Error("JWT секретные ключи не заданы");
  }
  const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN, {
    expiresIn: "1h",
  });
  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN, {
    expiresIn: "30d",
  });
  return { accessToken, refreshToken };
};

const saveToken = async (userId, refreshToken) => {
  const tokenData = await TokenModel.findOne({ user: userId });
  if (tokenData) {
    tokenData.refreshToken = refreshToken;
    return tokenData.save();
  }
  const token = await TokenModel.create({ user: userId, refreshToken });
  return token;
};

const removeToken = async (refreshToken) => {
    const tokenData = await TokenModel.findOneAndDelete({ refreshToken });
    if (!tokenData) {
      throw ApiError.BadRequest("Токен не найден");
    }
  return tokenData;
};

const validateAccessToken = async (token) => {
  console.log("Validate access token:", token);
  try {
    const userData = jwt.verify(token, process.env.ACCESS_TOKEN);
    console.log("Access token is valid:", userData);
    return userData;
  } catch (e) {
    console.log("Access token is not valid:", e);
    return null;
  }
};

const validateRefreshToken = (token) => {
  console.log("Validate refresh token:", token);
  try {
    const userData =  jwt.verify(token, process.env.REFRESH_TOKEN);
    console.log("Refresh token is valid:", userData);
    return userData;
  } catch (e) {
    console.log("Refresh token is not valid:", e);
    return null;
  }
};

const findToken = async (refreshToken) => {
  const tokenData = await TokenModel.findOne({ refreshToken });
  return tokenData;
};

module.exports = {
  generateToken,
  saveToken,
  removeToken,
  validateAccessToken,
  validateRefreshToken,
  findToken,
};
