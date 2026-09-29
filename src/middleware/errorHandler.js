function errorHandler(error, req, res, next) {
  const status = error.status || (error.name === "ZodError" ? 400 : 500);
  if (status >= 500) console.error(error);
  res
    .status(status)
    .json({
      success: false,
      message:
        status >= 500 && process.env.NODE_ENV === "production"
          ? "Internal server error"
          : error.message || "Request failed",
      code: error.code || "REQUEST_ERROR",
    });
}
module.exports = errorHandler;
