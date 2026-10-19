/// <reference types="vite/client" />

declare module "*.asset.json" {
  const asset: { url: string };
  export default asset;
}
