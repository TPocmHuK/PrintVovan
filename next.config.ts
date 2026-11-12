import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["pdfjs-dist", "pdf-lib"],
  // Трассировка standalone забирает из pdfjs-dist только основной модуль,
  // без pdf.worker.mjs — без него getDocument() падает на сервере.
  // Подстраховка к копированию в build-скрипте.
  outputFileTracingIncludes: {
    "*": ["./node_modules/pdfjs-dist/legacy/build/pdf.mjs", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
