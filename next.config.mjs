import path from 'path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(),
  },
  images: {
    unoptimized: true,
  },
  env: {
    VITE_MIDTRANS_CLIENT_KEY: process.env.VITE_MIDTRANS_CLIENT_KEY || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '',
  },
}

export default nextConfig
