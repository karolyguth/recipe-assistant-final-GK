/** @type {import('next').NextConfig} */
const nextConfig = {
  // A cross-encoder natív ONNX runtime-ot használ, ezért nem csomagoljuk be a szerver bundle-be
  experimental: {
    serverComponentsExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  },
};

export default nextConfig;
