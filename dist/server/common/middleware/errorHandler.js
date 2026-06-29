export function errorHandler(err, _req, res, _next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json({
        success: false,
        error: message,
        details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
}
