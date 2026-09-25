import type { Metadata } from "next";
import { LoginPage } from "@/components/login-page";

export const metadata: Metadata = {
  title: "Entrar · HoraCerta",
  description: "Seu tempo, no lugar certo. Entre com seu nome de acesso e PIN.",
};

export default function Login() {
  return <LoginPage />;
}
