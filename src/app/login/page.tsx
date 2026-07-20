import type { Metadata } from "next";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false, follow: false } };
export { default } from "../auth/login/page";
