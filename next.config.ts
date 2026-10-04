import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["unpdf", "linkedom", "@mozilla/readability"],
};

export default config;
