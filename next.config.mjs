const parseList = (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins:
    typeof process.env.ALLOWED_DEV_ORIGINS === "string"
      ? parseList(process.env.ALLOWED_DEV_ORIGINS)
      : undefined,
};
export default nextConfig;

