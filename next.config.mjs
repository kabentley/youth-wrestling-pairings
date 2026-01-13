const parseList = (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const dumpAllowedOrigins = (value) => {
  console.log("ALLOWED_DEV_ORIGINS raw:", value);
  const parsed = parseList(value);
  console.log("ALLOWED_DEV_ORIGINS parsed:", parsed);
  return parsed;
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins:
    typeof process.env.ALLOWED_DEV_ORIGINS === "string"
      ? dumpAllowedOrigins(process.env.ALLOWED_DEV_ORIGINS)
      : undefined,
};
export default nextConfig;

