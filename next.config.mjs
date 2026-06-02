import path from 'path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(),
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
